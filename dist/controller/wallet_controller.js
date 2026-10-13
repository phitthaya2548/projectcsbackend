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
exports.router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
exports.router.post("/checkslip", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        const customerId = String(req.body.customer_id || "").trim();
        if (!file || !customerId) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาแนบสลิปและระบุ customer_id",
            });
        }
        const slipokId = process.env.SLIPOK_ID;
        const slipokXAuth = process.env.SLIPOK_XAUTH;
        if (!slipokId || !slipokXAuth) {
            console.error("SlipOK credentials are missing");
            return res.status(500).json({
                ok: false,
                message: "ระบบตรวจสอบสลิปยังไม่พร้อมใช้งาน",
            });
        }
        const customerRef = firebase_1.db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบข้อมูลลูกค้า",
            });
        }
        const form = new form_data_1.default();
        form.append("files", file.buffer, {
            filename: file.originalname || "slip.jpg",
            contentType: file.mimetype,
        });
        // ให้ SlipOK ตรวจบัญชีผู้รับและบันทึกข้อมูลสลิป
        form.append("log", "true");
        const slipResponse = await axios_1.default.post(`https://api.slipok.com/api/line/apikey/${slipokId}`, form, {
            headers: {
                ...form.getHeaders(),
                "x-authorization": slipokXAuth,
            },
            timeout: 30000,
            validateStatus: () => true,
        });
        const responseData = slipResponse.data;
        const errorCode = responseData?.code;
        // ตรวจผลตอบกลับจาก SlipOK ก่อนเติมเงิน
        if (slipResponse.status < 200 ||
            slipResponse.status >= 300 ||
            responseData?.success !== true) {
            let message = "สลิปไม่ผ่านการตรวจสอบ";
            if (errorCode === 1014) {
                message = "บัญชีผู้รับไม่ตรงกับบัญชีร้าน";
            }
            else if (errorCode === 1012) {
                message = "สลิปนี้ถูกใช้แล้ว";
            }
            else if (errorCode === 1013) {
                message = "จำนวนเงินในสลิปไม่ถูกต้อง";
            }
            return res.status(400).json({
                ok: false,
                message,
            });
        }
        const data = responseData.data;
        const amount = Number(data?.amount);
        const transRef = String(data?.transRef || "").trim();
        if (data?.success !== true ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            !transRef) {
            return res.status(400).json({
                ok: false,
                message: "ข้อมูลสลิปไม่ถูกต้อง",
            });
        }
        // ใช้ transRef เป็น ID เพื่อป้องกันการบันทึกสลิปซ้ำ
        // หาก transRef มีอักขระที่ไม่เหมาะกับ document ID
        // ให้ใช้การเข้ารหัสหรือ hash ก่อนนำไปใช้จริง
        const topupRef = firebase_1.db
            .collection("topup_history")
            .doc(encodeURIComponent(transRef));
        await firebase_1.db.runTransaction(async (transaction) => {
            const [latestCustomer, existingTopup] = await Promise.all([
                transaction.get(customerRef),
                transaction.get(topupRef),
            ]);
            if (!latestCustomer.exists) {
                throw new Error("CUSTOMER_NOT_FOUND");
            }
            if (existingTopup.exists) {
                throw new Error("DUPLICATE_SLIP");
            }
            const currentBalance = Number(latestCustomer.get("wallet_balance") ?? 0);
            transaction.update(customerRef, {
                wallet_balance: currentBalance + amount,
            });
            transaction.create(topupRef, {
                customer_id: customerId,
                amount,
                trans_ref: transRef,
                status: "success",
                created_at: firebase_1.FieldValue.serverTimestamp(),
            });
        });
        return res.status(200).json({
            ok: true,
            message: "เติมเงินสำเร็จ",
            amount,
            transRef,
        });
    }
    catch (error) {
        if (error?.message === "DUPLICATE_SLIP") {
            return res.status(400).json({
                ok: false,
                message: "สลิปนี้ถูกใช้เติมเงินแล้ว",
            });
        }
        if (error?.message === "CUSTOMER_NOT_FOUND") {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบข้อมูลลูกค้า",
            });
        }
        console.error("checkslip error:", error?.response?.data || error?.message || error);
        return res.status(500).json({
            ok: false,
            message: "ไม่สามารถตรวจสอบสลิปได้ กรุณาลองใหม่",
        });
    }
});
exports.router.get("/history/topup/:customer_id", async (req, res) => {
    try {
        const customerId = req.params.customer_id;
        const customerRef = firebase_1.db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const topupSnap = await firebase_1.db.collection("topup_history")
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
            const data = doc.data();
            return {
                topup_id: data.topup_id,
                type: "topup",
                amount: data.amount,
                topup_datetime: data.topup_datetime.toDate().toISOString(),
            };
        });
        return res.json({
            ok: true,
            message: "ประวัติการเติมเงิน",
            data: topupHistory,
        });
    }
    catch (e) {
        console.error("SERVER ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: "server error",
            error: e.message,
        });
    }
});
exports.router.get("/history/paid_orders/:customer_id", async (req, res) => {
    try {
        const customerId = req.params.customer_id;
        const customerRef = firebase_1.db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const paidOrdersSnap = await firebase_1.db.collection("orders")
            .where("customer_id", "==", customerRef)
            .where("status", "in", ["completed", "payment_completed", "washing", "drying", "waiting_delivery", "delivery_in_progress"])
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
            const data = doc.data();
            return {
                order_id: data.order_id,
                type: "payment",
                service_type: checkServiceType(data.service_type) ?? "ไม่ทราบประเภทบริการ",
                total_amount: data.service_price + data.delivery_price + (data.detergent_price || 0),
                order_datetime: data.order_datetime.toDate().toISOString(),
            };
        });
        return res.json({
            ok: true,
            message: "ประวัติการชำระเงิน",
            data: paidOrders,
        });
    }
    catch (e) {
        console.error("SERVER ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: "server error",
            error: e.message,
        });
    }
});
function checkServiceType(serviceType) {
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
