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
    console.log("SLIPOK RESPONSE:", respos.status, JSON.stringify(responseData));

    // ตรวจผลจาก SlipOK ก่อนใช้ข้อมูล
    if (respos.status !== 200 || responseData?.success === false) {
      return res.status(400).json({
        ok: false,
        message: responseData?.message || "ตรวจสอบสลิปไม่สำเร็จ",
        code: responseData?.code,
      });
    }

    const data = responseData?.data?.data || responseData?.data;

    if (data?.success === false) {
      return res.status(400).json({
        ok: false,
        message: data?.message || "สลิปไม่ผ่านการตรวจสอบ",
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

    // ใช้ transRef เป็น doc id เพื่อกันสลิปซ้ำแบบ atomic
    const docRef = db.collection("topup_history").doc(transRef);

    const topupData: TopupHistory = {
      topup_id: docRef.id,
      customer_id: customerRef,
      amount,
      trans_ref: transRef,
      topup_datetime: Timestamp.now(),
    };

    let walletBalanceAfter = 0;
    const paidOrderIds: string[] = [];

    await db.runTransaction(async (tx) => {
      // ---- READS ทั้งหมดก่อน ----
      const dupDoc = await tx.get(docRef);
      if (dupDoc.exists) throw new Error("SLIP_DUPLICATE");

      const customerDoc = await tx.get(customerRef);
      if (!customerDoc.exists) throw new Error("CUSTOMER_NOT_FOUND");

      const currentBalance = Number(customerDoc.data()?.wallet_balance || 0);

      const pendingOrdersSnap = await tx.get(
        db
          .collection("orders")
          .where("customer_id", "==", customerRef)
          .where("status", "==", "waiting_payment")
          .orderBy("order_datetime", "asc")
      );

      // ---- WRITES ----
      let runningBalance = currentBalance + amount;

      for (const orderDoc of pendingOrdersSnap.docs) {
        const orderData = orderDoc.data() as Order;
        const storeRef = orderData.store_id;

        const amountDue =
          Number(orderData.service_price || 0) +
          Number(orderData.delivery_price || 0) +
          Number(orderData.detergent_price || 0);

        if (amountDue > 0 && runningBalance >= amountDue) {
          if (!storeRef) throw new Error("STORE_NOT_FOUND");

          runningBalance -= amountDue;
          paidOrderIds.push(orderDoc.id);

          tx.update(orderDoc.ref, { status: "payment_completed" });
          tx.update(storeRef, {
            wallet_balance: FieldValue.increment(amountDue),
          });
        } else {
          break;
        }
      }

      walletBalanceAfter = runningBalance;

      tx.set(docRef, topupData);
      tx.update(customerRef, { wallet_balance: runningBalance });
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

    if (e.message === "SLIP_DUPLICATE") {
      return res.status(400).json({ ok: false, message: "สลิปนี้ถูกใช้แล้ว" });
    }
    if (e.message === "CUSTOMER_NOT_FOUND") {
      return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
    }
    if (e.message === "STORE_NOT_FOUND") {
      return res.status(400).json({ ok: false, message: "ไม่พบร้านของออเดอร์" });
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