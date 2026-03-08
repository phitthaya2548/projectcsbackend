"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
exports.router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
exports.router.post("/checkslip", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                ok: false,
                message: "แนบไฟล์สลิป key=file",
            });
        }
        const customerId = req.body.customer_id;
        if (!customerId) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ customer_id",
            });
        }
        const customerRef = firebase_1.db
            .collection("customers")
            .doc(String(customerId));
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
        const form = new form_data_1.default();
        form.append("files", file.buffer, {
            filename: file.originalname || "slip.jpg",
            contentType: file.mimetype || "image/jpeg",
        });
        const r = await axios_1.default.post(url, form, {
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
        const transRef = data?.transRef;
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
        const topupDocRef = firebase_1.db
            .collection("topup_history")
            .doc(transRef);
        await firebase_1.db.runTransaction(async (tx) => {
            const existing = await tx.get(topupDocRef);
            if (existing.exists) {
                throw new Error("DUPLICATE_SLIP");
            }
            const topupData = {
                customer_id: customerRef,
                amount,
                trans_ref: transRef,
                topup_datetime: firestore_1.Timestamp.now(),
            };
            tx.set(topupDocRef, topupData);
            tx.update(customerRef, {
                wallet_balance: firebase_1.FieldValue.increment(amount),
            });
        });
        return res.json({
            ok: true,
            message: "เติมเงินสำเร็จ",
            amount,
            trans_ref: transRef,
        });
    }
    catch (e) {
        if (e.message === "DUPLICATE_SLIP") {
            return res.status(400).json({
                ok: false,
                message: "สลิปนี้ถูกใช้แล้ว",
            });
        }
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
