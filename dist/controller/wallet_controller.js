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
        const customerRef = firebase_1.db.collection("customers").doc(customerId);
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
        const respos = await axios_1.default.post(url, form, {
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
        const duplicateSnap = await firebase_1.db
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
        const docRef = firebase_1.db.collection("topup_history").doc();
        const topupData = {
            topup_id: docRef.id,
            customer_id: customerRef,
            amount: amount,
            trans_ref: transRef,
            topup_datetime: firestore_1.Timestamp.now(),
        };
        let walletBalanceAfter = 0;
        const paidOrderIds = [];
        await firebase_1.db.runTransaction(async (tx) => {
            const customerDoc = await tx.get(customerRef);
            if (!customerDoc.exists) {
                throw new Error("CUSTOMER_NOT_FOUND");
            }
            const currentBalance = Number(customerDoc.data()?.wallet_balance || 0);
            const pendingOrdersSnap = await tx.get(firebase_1.db
                .collection("orders")
                .where("customer_id", "==", customerRef)
                .where("status", "==", "waiting_payment")
                .orderBy("order_datetime", "asc"));
            let runningBalance = currentBalance + amount;
            for (const orderDoc of pendingOrdersSnap.docs) {
                const orderData = orderDoc.data();
                const servicePrice = Number(orderData?.service_price || 0);
                const deliveryPrice = Number(orderData?.delivery_price || 0);
                const detergenPrice = Number(orderData?.detergent_price || 0);
                const amountDue = servicePrice + deliveryPrice + detergenPrice;
                if (amountDue > 0 && runningBalance >= amountDue) {
                    runningBalance -= amountDue;
                    paidOrderIds.push(orderDoc.id);
                }
                else {
                    break;
                }
            }
            walletBalanceAfter = runningBalance;
            tx.set(docRef, topupData);
            tx.update(customerRef, {
                wallet_balance: runningBalance,
            });
            for (const orderId of paidOrderIds) {
                tx.update(firebase_1.db.collection("orders").doc(orderId), {
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
            .where("status", "in", ["completed", "payment_completed"])
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
