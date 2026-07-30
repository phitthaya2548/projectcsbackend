import { Router } from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { db, FieldValue } from "../config/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { TopupHistory } from "../modules/topup_history";

export const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/checkslip", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        ok: false,
        message: "แนบไฟล์สลิป",
      });
    }

    const customerId = String(req.body.customer_id || "").trim();

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ customer_id",
      });
    }

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const slipokId = process.env.SLIPOK_ID;
    const xauth = process.env.SLIPOK_XAUTH;

    if (!slipokId || !xauth) {
      return res.status(500).json({
        ok: false,
        message: "missing SLIPOK env",
      });
    }

    const url = `https://api.slipok.com/api/line/apikey/${slipokId}`;

    const form = new FormData();
    form.append("files", file.buffer, {
      filename: file.originalname || "slip.jpg",
      contentType: file.mimetype || "image/jpeg",
    });

    const respos = await axios.post(url, form, {
      headers: {
        "x-authorization": xauth,
        ...form.getHeaders(),
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (respos.status < 200 || respos.status >= 300) {
      return res.status(respos.status).json({
        ok: false,
        message: "ตรวจสอบสลิปล้มเหลว",
        slipok: respos.data,
      });
    }

    const data = respos.data?.data || respos.data;
    const amount = Number(data?.amount);
    const transRef = String(data?.transRef || "").trim();

    if (!amount || amount <= 0) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบจำนวนเงินในสลิป",
      });
    }

    if (!transRef) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบเลขอ้างอิงธุรกรรม",
      });
    }

    const duplicateSnap = await db
      .collection("topup_history")
      .where("trans_ref", "==", transRef)
      .limit(1)
      .get();

    if (!duplicateSnap.empty) {
      return res.status(400).json({
        ok: false,
        message: "สลิปนี้ถูกใช้แล้ว",
      });
    }

    const docRef = db.collection("topup_history").doc();

    const topupData: TopupHistory = {
      topup_id: docRef.id,
      customer_id: customerRef,
      amount: amount,
      trans_ref: transRef,
      topup_datetime: Timestamp.now(),
    };

    // These get filled in inside the transaction and used in the response below.
    let walletBalanceAfter = 0;
    const paidOrderIds: string[] = [];

    await db.runTransaction(async (tx) => {
      // --- ALL READS FIRST (Firestore transactions forbid reads after writes) ---

      const customerDoc = await tx.get(customerRef);
      if (!customerDoc.exists) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }
      const currentBalance = Number(customerDoc.data()?.wallet_balance || 0);

      // หายอดค้างชำระ (orders ที่ status = waiting_payment ของลูกค้าคนนี้)
      // เรียงจากเก่าไปใหม่ เผื่อมีหลายบิลค้าง จะได้ตัดจ่ายบิลเก่าก่อน
      const pendingOrdersSnap = await tx.get(
        db
          .collection("orders")
          .where("customer_id", "==", customerRef)
          .where("status", "==", "waiting_payment")
          .orderBy("order_datetime", "asc")
      );

      // --- COMPUTE ---

      let runningBalance = currentBalance + amount;

      for (const orderDoc of pendingOrdersSnap.docs) {
        const orderData = orderDoc.data();

        // ยอดที่ต้องจ่ายของบิลนี้ = ค่าบริการ + ค่าส่ง
        // (ไม่มีฟิลด์ total_amount ใน schema จริง เลยรวมจาก service_price + delivery_price)
        const servicePrice = Number(orderData?.service_price || 0);
        const deliveryPrice = Number(orderData?.delivery_price || 0);
        const amountDue = servicePrice + deliveryPrice;

        if (amountDue > 0 && runningBalance >= amountDue) {
          runningBalance -= amountDue;
          paidOrderIds.push(orderDoc.id);
        } else {
          // ยอดไม่พอสำหรับบิลนี้ (หรือบิลถัดไปที่แพงกว่า) หยุดไล่ตัดต่อ
          break;
        }
      }

      walletBalanceAfter = runningBalance;

      // --- ALL WRITES AFTER ---

      tx.set(docRef, topupData);

      tx.update(customerRef, {
        wallet_balance: runningBalance,
      });

      for (const orderId of paidOrderIds) {
        tx.update(db.collection("orders").doc(orderId), {
          status: "payment_completed",
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

    return res.status(500).json({
      ok: false,
      message: "server error",
      error: e.message,
    });
  }
});