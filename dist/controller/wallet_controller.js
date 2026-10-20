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
                message: "กรุณาแนบไฟล์สลิป",
            });
        }
        const customerId = String(req.body.customer_id || "").trim();
        if (!customerId) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ customer_id",
            });
        }
        // 1. ตรวจสอบลูกค้า
        const customerRef = firebase_1.db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        // 2. ตรวจสอบ Environment Variables
        const slipokId = process.env.SLIPOK_ID?.trim();
        const xauth = process.env.SLIPOK_XAUTH?.trim();
        if (!slipokId || !xauth) {
            console.error("Missing SLIPOK_ID or SLIPOK_XAUTH");
            return res.status(500).json({
                ok: false,
                message: "ระบบตรวจสอบสลิปยังไม่ได้ตั้งค่า",
            });
        }
        // 3. เรียก SlipOK API
        const url = `https://api.slipok.com/api/line/apikey/${encodeURIComponent(slipokId)}`;
        const form = new form_data_1.default();
        form.append("files", file.buffer, {
            filename: file.originalname || "slip.jpg",
            contentType: file.mimetype || "image/jpeg",
        });
        form.append("log", "true");
        const slipResponse = await axios_1.default.post(url, form, {
            headers: {
                "x-authorization": xauth,
                ...form.getHeaders(),
            },
            timeout: 30000,
            validateStatus: () => true,
        });
        const responseData = slipResponse.data;
        console.log("SLIPOK STATUS:", slipResponse.status);
        console.log("SLIPOK RESPONSE:", JSON.stringify(responseData));
        // 4. ตรวจสอบผลตอบกลับจาก API
        if (slipResponse.status < 200 ||
            slipResponse.status >= 300 ||
            responseData?.success !== true) {
            return res.status(400).json({
                ok: false,
                message: responseData?.message || "SlipOK ไม่สามารถตรวจสอบสลิปได้",
                code: responseData?.code ?? null,
            });
        }
        // SlipOK โดยทั่วไปคืนรายละเอียดรายการใน responseData.data
        // รองรับกรณีที่รายละเอียดถูกซ้อนอยู่ใน data.data ด้วย
        const data = responseData?.data?.data ?? responseData?.data;
        if (!data || typeof data !== "object") {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบข้อมูลธุรกรรมจาก SlipOK",
            });
        }
        const amount = Number(data.amount);
        const transRef = String(data.transRef || "").trim();
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบจำนวนเงินที่ถูกต้องในสลิป",
            });
        }
        if (!transRef) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบเลขอ้างอิงธุรกรรม",
            });
        }
        // 5. ใช้เลขอ้างอิงธุรกรรมป้องกันการเติมเงินซ้ำ
        const docRef = firebase_1.db.collection("topup_history").doc(transRef);
        const paidOrderIds = [];
        let walletBalanceAfter = 0;
        await firebase_1.db.runTransaction(async (tx) => {
            // อ่านข้อมูลทั้งหมดก่อนเขียนข้อมูล
            const dupDoc = await tx.get(docRef);
            if (dupDoc.exists) {
                throw new Error("SLIP_DUPLICATE");
            }
            const customerDoc = await tx.get(customerRef);
            if (!customerDoc.exists) {
                throw new Error("CUSTOMER_NOT_FOUND");
            }
            const currentBalance = Number(customerDoc.data()?.wallet_balance || 0);
            const pendingOrdersSnap = await tx.get(firebase_1.db.collection("orders")
                .where("customer_id", "==", customerRef)
                .where("status", "==", "waiting_payment")
                .orderBy("order_datetime", "asc"));
            const ordersToPay = [];
            let runningBalance = currentBalance + amount;
            // คำนวณยอดก่อนเริ่มเขียนข้อมูล
            for (const orderDoc of pendingOrdersSnap.docs) {
                const orderData = orderDoc.data();
                const amountDue = Number(orderData.service_price || 0) +
                    Number(orderData.delivery_price || 0) +
                    Number(orderData.detergent_price || 0);
                if (!Number.isFinite(amountDue) || amountDue < 0) {
                    throw new Error("INVALID_ORDER_AMOUNT");
                }
                if (amountDue === 0) {
                    continue;
                }
                if (runningBalance < amountDue) {
                    break;
                }
                const storeRef = orderData.store_id;
                if (!storeRef) {
                    throw new Error("STORE_NOT_FOUND");
                }
                runningBalance -= amountDue;
                ordersToPay.push({
                    ref: orderDoc.ref,
                    storeRef,
                    amountDue,
                });
            }
            // เริ่มเขียนข้อมูลหลังอ่านข้อมูลทั้งหมดแล้ว
            for (const order of ordersToPay) {
                tx.update(order.ref, {
                    status: "payment_completed",
                });
                tx.update(order.storeRef, {
                    wallet_balance: firebase_1.FieldValue.increment(order.amountDue),
                });
                paidOrderIds.push(order.ref.id);
            }
            const topupData = {
                topup_id: transRef,
                customer_id: customerRef,
                amount,
                trans_ref: transRef,
                topup_datetime: firestore_1.Timestamp.now(),
            };
            tx.create(docRef, topupData);
            tx.update(customerRef, {
                wallet_balance: runningBalance,
            });
            walletBalanceAfter = runningBalance;
        });
        return res.json({
            ok: true,
            message: "เติมเงินสำเร็จ",
            data: {
                topup_id: transRef,
                customer_id: customerRef.path,
                amount,
                trans_ref: transRef,
                wallet_balance_after: walletBalanceAfter,
                paid_order_ids: paidOrderIds,
            },
        });
    }
    catch (e) {
        console.error("CHECKSLIP ERROR:", e);
        if (e.message === "SLIP_DUPLICATE") {
            return res.status(400).json({
                ok: false,
                message: "สลิปนี้ถูกใช้แล้ว",
            });
        }
        if (e.message === "CUSTOMER_NOT_FOUND") {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        if (e.message === "STORE_NOT_FOUND") {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบร้านของออเดอร์",
            });
        }
        if (e.message === "INVALID_ORDER_AMOUNT") {
            return res.status(400).json({
                ok: false,
                message: "ยอดเงินของออเดอร์ไม่ถูกต้อง",
            });
        }
        if (axios_1.default.isAxiosError(e)) {
            return res.status(502).json({
                ok: false,
                message: "เชื่อมต่อระบบตรวจสอบสลิปไม่สำเร็จ",
            });
        }
        return res.status(500).json({
            ok: false,
            message: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์",
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
