import { Router } from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { db, FieldValue } from "../config/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { TopupHistory } from "../modules/topup_history";
import { Order } from "../modules/order";
import { StoreData } from "../modules/store";

export const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.post("/checkslip", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ ok: false, message: "แนบไฟล์สลิป" });
    }

    // ต้องใช้ multer.memoryStorage() เท่านั้น ไม่งั้น file.buffer จะเป็น undefined
    if (!file.buffer) {
      return res.status(500).json({
        ok: false,
        message: "upload ต้องใช้ multer.memoryStorage()",
      });
    }

    const customerId = String(req.body.customer_id || "").trim();
    if (!customerId) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ customer_id" });
    }

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
    }

    const slipokId = process.env.SLIPOK_ID;
    const xauth = process.env.SLIPOK_XAUTH;
    if (!slipokId || !xauth) {
      return res.status(500).json({ ok: false, message: "missing SLIPOK env" });
    }

    const url = `https://api.slipok.com/api/line/apikey/${slipokId}`;

    // ต้อง import FormData จาก "form-data" (ไม่ใช่ FormData ของ Node/เบราว์เซอร์)
    const form = new FormData();
    form.append("files", file.buffer, {
      filename: file.originalname || "slip.jpg",
      contentType: file.mimetype || "image/jpeg",
    });
    form.append("log", "true");

    const respos = await axios.post(url, form, {
      headers: {
        "x-authorization": xauth,
        ...form.getHeaders(),
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    const responseData = respos.data;
    const errorCode = responseData?.code;

    // helper: doc ของประวัติเติมเงิน ใช้ transRef เป็น doc id เพื่อกันสลิปซ้ำ
    const topupDocRefOf = (ref: string) =>
      db.collection("topup_history").doc(ref.replace(/\//g, "_"));

    const slipOkPassed =
      respos.status >= 200 &&
      respos.status < 300 &&
      responseData?.success === true;

    let data: any = null;

    if (slipOkPassed) {
      data = responseData?.data || responseData;
    } else if (errorCode === 1012 && responseData?.data?.transRef) {
      // SlipOK บอกว่าสลิปเคยถูกตรวจแล้ว -> เช็คว่าระบบเราบันทึกเติมเงินไว้จริงหรือยัง
      // ถ้ายังไม่มี แปลว่าครั้งก่อน SlipOK ผ่านแต่ transaction ของเราล้มเหลว
      // ให้เติมเงินต่อแทนการปฏิเสธ (ผู้ใช้จะได้ไม่ติดสลิปซ้ำตลอดไป)
      const recoverRef = String(responseData.data.transRef || "").trim();
      const existing = await topupDocRefOf(recoverRef).get();

      if (existing.exists) {
        return res.status(400).json({
          ok: false,
          message: "สลิปนี้ถูกใช้แล้ว",
          slipok_code: 1012,
        });
      }

      console.warn("SLIPOK DUPLICATE but not in topup_history, recovering:", recoverRef);
      data = responseData.data;
    }

    if (!data) {
      // log ไว้ดูว่า SlipOK ตอบอะไรกลับมาจริง ๆ
      console.error("SLIPOK FAIL:", respos.status, JSON.stringify(responseData));

      let message = "สลิปไม่ผ่านการตรวจสอบ";
      if (errorCode === 1014) {
        message = "บัญชีผู้รับไม่ตรงบัญชีระบบ";
      } else if (errorCode === 1012) {
        message = "สลิปนี้ถูกใช้แล้ว";
      } else if (errorCode === 1013) {
        message = "จำนวนเงินในสลิปไม่ถูกต้อง";
      } else if (responseData?.message) {
        message = `สลิปไม่ผ่านการตรวจสอบ: ${responseData.message}`;
      }

      return res.status(400).json({
        ok: false,
        message,
        slipok_code: errorCode ?? null,
      });
    }

    const amount = Number(data?.amount);
    const transRef = String(data?.transRef || "").trim();

    if (!amount || amount <= 0) {
      return res.status(400).json({ ok: false, message: "ไม่พบจำนวนเงินในสลิป" });
    }
    if (!transRef) {
      return res.status(400).json({ ok: false, message: "ไม่พบเลขอ้างอิงธุรกรรม" });
    }

    // ใช้ transRef เป็น doc id เพื่อกันสลิปซ้ำแบบ atomic ภายใน transaction
    const docRef = topupDocRefOf(transRef);

    const topupData: TopupHistory = {
      topup_id: docRef.id,
      customer_id: customerRef,
      amount: amount,
      trans_ref: transRef,
      topup_datetime: Timestamp.now(),
    };

    let walletBalanceAfter = 0;
    const paidOrderIds: string[] = [];

    await db.runTransaction(async (tx) => {
      // ---------- READS (ต้องอ่านทั้งหมดก่อนเขียน) ----------
      const dupDoc = await tx.get(docRef);
      if (dupDoc.exists) {
        throw new Error("DUPLICATE_SLIP");
      }

      const customerDoc = await tx.get(customerRef);
      if (!customerDoc.exists) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }
      const currentBalance = Number(customerDoc.data()?.wallet_balance || 0);

      // ไม่ใช้ orderBy เพื่อไม่ต้องสร้าง composite index
      // (where customer_id + where status + orderBy order_datetime จะ error
      //  FAILED_PRECONDITION ถ้ายังไม่ได้สร้าง index -> เป็น 500 server error)
      const pendingOrdersSnap = await tx.get(
        db
          .collection("orders")
          .where("customer_id", "==", customerRef)
          .where("status", "==", "waiting_payment")
      );

      const pendingDocs = [...pendingOrdersSnap.docs].sort((a, b) => {
        const ta = a.data().order_datetime?.toMillis?.() ?? 0;
        const tb = b.data().order_datetime?.toMillis?.() ?? 0;
        return ta - tb;
      });

      // ---------- คำนวณ ----------
      let runningBalance = currentBalance + amount;
      const toPay: {
        ref: FirebaseFirestore.DocumentReference;
        storeRef: any;
        amountDue: number;
      }[] = [];

      for (const orderDoc of pendingDocs) {
        const orderData = orderDoc.data() as Order;

        const amountDue =
          Number(orderData.service_price || 0) +
          Number(orderData.delivery_price || 0) +
          Number(orderData.detergent_price || 0);

        if (amountDue > 0 && runningBalance >= amountDue) {
          let storeRef: any = orderData.store_id;

          // กรณีเก็บ store_id เป็น string แทน DocumentReference
          if (typeof storeRef === "string") {
            storeRef = db.collection("stores").doc(storeRef);
          }
          if (!storeRef) {
            throw new Error("STORE_NOT_FOUND");
          }

          runningBalance -= amountDue;
          paidOrderIds.push(orderDoc.id);
          toPay.push({ ref: orderDoc.ref, storeRef, amountDue });
        } else {
          break;
        }
      }

      walletBalanceAfter = runningBalance;

      // ---------- WRITES ----------
      tx.set(docRef, topupData);

      tx.update(customerRef, { wallet_balance: runningBalance });

      for (const p of toPay) {
        tx.update(p.ref, { status: "payment_completed" });
        tx.update(p.storeRef, {
          wallet_balance: FieldValue.increment(p.amountDue),
        });
      }
    });

    return res.json({
      ok: true,
      message: "เติมเงินสำเร็จ",
      data: {
        ...topupData,
        wallet_balance_after: walletBalanceAfter,
        paid_order_ids: paidOrderIds,
      },
    });
  } catch (e: any) {
    console.error("SERVER ERROR:", e);

    if (e?.message === "DUPLICATE_SLIP") {
      return res.status(400).json({
        ok: false,
        message: "สลิปนี้ถูกใช้แล้ว",
        slipok_code: 1012,
      });
    }
    if (e?.message === "CUSTOMER_NOT_FOUND") {
      return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
    }
    if (e?.message === "STORE_NOT_FOUND") {
      return res.status(500).json({ ok: false, message: "ไม่พบร้านค้าของออเดอร์" });
    }

    return res.status(500).json({
      ok: false,
      message: "server error",
      error: e.message,
    });
  }
});
router.get("/history/topup/:customer_id", async (req, res) => {
  try{
    const customerId = req.params.customer_id;
    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }
    const topupSnap = await db.collection("topup_history")
  .where("customer_id", "==", customerRef)
  .orderBy("topup_datetime", "desc")
  .limit(50)
  .get();

      
    if (topupSnap.empty) {
      return res.json({
        ok: true,
        message: "ไม่พบประวัติการเติมเงิน",
        data: [],
      });
    }
    const topupHistory = topupSnap.docs.map((doc) => {
      const data = doc.data() as TopupHistory;
      return {
        topup_id: data.topup_id,
        type: "topup",
        amount: data.amount,
        topup_datetime: data.topup_datetime.toDate().toISOString(),
      }
    });
    return res.json({
      ok: true,
      message: "ประวัติการเติมเงิน",
      data: topupHistory,
    });


  }catch(e:any){
    console.error("SERVER ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: "server error",
      error: e.message,
    });
  }
});
router.get("/history/paid_orders/:customer_id", async (req, res) => {

  try{
    const customerId = req.params.customer_id;

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const paidOrdersSnap = await db.collection("orders")
      .where("customer_id", "==", customerRef)
      .where("status", "in", ["completed", "payment_completed","washing","drying","waiting_delivery","delivery_in_progress"])
      .orderBy("order_datetime", "desc")
      .limit(50)
      .get();
    
    if (paidOrdersSnap.empty) {
      return res.json({
        ok: true,
        message: "ไม่พบประวัติการชำระเงิน",
        data: [],
      });
    }
    const paidOrders = paidOrdersSnap.docs.map((doc) => {
      const data = doc.data() as Order;
      return{
        order_id: data.order_id,
        type: "payment",
        service_type: checkServiceType(data.service_type) ?? "ไม่ทราบประเภทบริการ",
        total_amount: data.service_price + data.delivery_price + (data.detergent_price || 0),
        order_datetime: data.order_datetime.toDate().toISOString(),
        
      }
    });
    return res.json({
      ok: true,
      message: "ประวัติการชำระเงิน",
      data: paidOrders,
    });

  }

  catch(e:any){
    console.error("SERVER ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: "server error",
      error: e.message,
    });
  }
});
function checkServiceType(serviceType: string) {
  switch (serviceType) {
    case "wash_dry":
      return "ซักอบ";
    case "wash":
      return "ซักอย่างเดียว";
    case "dry":
      return "อบอย่างเดียว";
    default:
      return "ไม่ทราบประเภทบริการ";
  }
}