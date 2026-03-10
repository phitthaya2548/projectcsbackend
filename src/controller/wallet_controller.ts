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
        message: "แนบไฟล์สลิป key=file",
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

    const r = await axios.post(url, form, {
      headers: {
        "x-authorization": xauth,
        ...form.getHeaders(),
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (r.status < 200 || r.status >= 300) {
      return res.status(r.status).json({
        ok: false,
        message: "ตรวจสอบสลิปล้มเหลว",
        slipok: r.data,
      });
    }

    const data = r.data?.data || r.data;
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

    await db.runTransaction(async (tx) => {
      tx.set(docRef, topupData);

      tx.update(customerRef, {
        wallet_balance: FieldValue.increment(amount),
      });
    });

    return res.json({
      ok: true,
      message: "เติมเงินสำเร็จ",
      data: topupData,
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


// router.get("/topup_history/:id", async (req, res) => {
//   try {
//     const customerId = req.params.id;

//     if (!customerId) {
//       return res.status(400).json({
//         ok: false,
//         message: "ไม่พบ customer_id",
//       });
//     }

//     // ✅ ตรวจสอบลูกค้า
//     const customerRef = db.collection("customers").doc(customerId);
//     const customerDoc = await customerRef.get();

//     if (!customerDoc.exists) {
//       return res.status(404).json({
//         ok: false,
//         message: "ไม่พบลูกค้า",
//       });
//     }

//     const walletBalance = customerDoc.data()?.wallet_balance || 0;

//     // ✅ ดึงทั้งหมดมาแล้วกรองเอง
//     const snap = await db
//       .collection("topup_history")
//       .orderBy("topup_datetime", "desc")
//       .get();

//     // กรองเฉพาะของลูกค้าคนนี้
//     const history = snap.docs
//       .filter(doc => {
//         const data = doc.data();
//         const refPath = data.customer_id?.path;
//         return refPath === `customers/${customerId}` || 
//                data.customer_id === customerId ||
//                data.customer_id === customerRef.path;
//       })
//       .slice(0, 20) // จำกัด 20 รายการ
//       .map((doc) => {
//         const data = doc.data() as TopupHistory;

//         return {
//           id: doc.id,
//           amount: data.amount,
//           trans_ref: data.trans_ref,
//           datetime: data.topup_datetime?.toDate?.()
//             ? data.topup_datetime.toDate().toISOString()
//             : null,
//         };
//       });

//     return res.json({
//       ok: true,
//       wallet_balance: walletBalance,
//       history,
//     });

//   } catch (e: any) {
//     console.error("Wallet error:", e);

//     return res.status(500).json({
//       ok: false,
//       message: "server error",
//       error: e.message,
//     });
//   }
// });