"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const haversine_1 = require("../services/haversine");
const calculateDelivery_1 = require("../services/calculateDelivery");
const firestore_1 = require("firebase-admin/firestore");
const notification_1 = require("../services/notification");
exports.router = (0, express_1.Router)();
exports.router.put("/start_wash/:id", async (req, res) => {
    try {
        const order_id = req.params.id;
        const staff_id = req.body.staff_id;
        if (!order_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ order_id",
            });
        }
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ staff_id",
            });
        }
        const orderRef = firebase_1.db
            .collection("orders")
            .doc(order_id);
        const staffRef = firebase_1.db
            .collection("laundry_staff")
            .doc(staff_id);
        const staffSnap = await staffRef.get();
        if (!staffSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบพนักงาน",
            });
        }
        let customerId = null;
        let currentStatus = null;
        await firebase_1.db.runTransaction(async (tx) => {
            const orderSnap = await tx.get(orderRef);
            if (!orderSnap.exists) {
                throw {
                    code: 404,
                    message: "ไม่พบออเดอร์นี้",
                };
            }
            const order = orderSnap.data();
            if (order.status !== "waiting_wash" && order.status !== "waiting_dry") {
                throw {
                    code: 409,
                    message: "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซักหรือรออบ",
                };
            }
            if (order.staff_id) {
                throw {
                    code: 409,
                    message: "ออเดอร์นี้ถูกรับไปแล้ว",
                };
            }
            tx.update(orderRef, {
                staff_id: staffRef,
            });
            customerId =
                order.customer_id?.id ?? null;
            currentStatus =
                order.status;
        });
<<<<<<< HEAD
        if (customerId && currentStatus) {
            try {
                const isDry = currentStatus === "waiting_dry";
                await notification_1.NotificationService.sendToUser(customerId, "customer", "พนักงานซักอบรับงานแล้ว", isDry
                    ? "พนักงานซักอบกำลังดำเนินการอบผ้าให้คุณ"
                    : "พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ", {
                    order_id,
                    status: currentStatus,
                });
            }
            catch (error) {
                console.error("send notification error:", error);
            }
        }
        return res.status(200).json({
=======
        const orderSnap = await orderRef.get();
        const orderData = orderSnap.data();
        if (orderData?.customer_id) {
            await notification_1.NotificationService.sendToUser(orderData.customer_id.id, "customer", "พนักงานซักอบรับงานแล้ว", "พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ", {
                order_id: order_id,
                status: orderData.status
            });
        }
        return res.json({
>>>>>>> origin/main
            ok: true,
            message: currentStatus === "waiting_dry"
                ? "รับงานอบสำเร็จ"
                : "รับงานซักสำเร็จ",
            data: {
                order_id,
                staff_id,
                status: currentStatus,
            },
        });
    }
    catch (error) {
        console.error("start wash error:", error);
        if (error?.code &&
            Number.isInteger(error.code)) {
            return res.status(error.code).json({
                ok: false,
                message: error.message ?? "เกิดข้อผิดพลาด",
            });
        }
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/historynow/:id", async (req, res) => {
    try {
        const staff_id = String(req.params.id || "").trim();
        if (!staff_id) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุ staff_id" });
        }
        const staffRef = firebase_1.db.collection("laundry_staff").doc(staff_id);
        const staffSnap = await staffRef.get();
        if (!staffSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบ staff คนนี้" });
        }
        const activeStatuses = [
            "waiting_wash",
            "waiting_dry",
            "waiting_payment",
<<<<<<< HEAD
            "payment_completed",
=======
            'payment_completed',
>>>>>>> origin/main
            "washing",
            "drying",
            "waiting_delivery",
        ];
        const ordersSnap = await firebase_1.db.collection("orders")
            .where("staff_id", "==", staffRef)
            .where("status", "in", activeStatuses)
            .orderBy("order_datetime", "desc")
            .get();
        if (ordersSnap.empty) {
            return res.status(200).json({ ok: true, data: [] });
        }
        const orders = await Promise.all(ordersSnap.docs.map(async (doc) => {
            const order = doc.data();
            const [storeSnap, addressSnap, customerSnap, washerSnap, dryerSnap] = await Promise.all([
                order.store_id ? order.store_id.get() : Promise.resolve(null),
                order.address_id ? order.address_id.get() : Promise.resolve(null),
                order.customer_id ? order.customer_id.get() : Promise.resolve(null),
                order.machine_washer_id ? order.machine_washer_id.get() : Promise.resolve(null),
                order.machine_dryer_id ? order.machine_dryer_id.get() : Promise.resolve(null),
            ]);
            const storeData = storeSnap?.exists ? storeSnap.data() : null;
            const addressData = addressSnap?.exists ? addressSnap.data() : null;
            const customerData = customerSnap?.exists ? customerSnap.data() : null;
            const washerData = washerSnap?.exists ? washerSnap.data() : null;
            const dryerData = dryerSnap?.exists ? dryerSnap.data() : null;
            return {
                id: doc.id,
                store: storeData ? {
                    id: storeSnap.id,
                    name: storeData.store_name ?? null,
                } : null,
                status: order.status ?? null,
                service_type: order.service_type ?? null,
                detergent_option: order.detergent_option ?? null,
                note: order.note ?? null,
                before_wash_image: order.before_wash_image ?? null,
                after_wash_image: order.after_wash_image ?? null,
                wash_dry_weight: order.wash_dry_weight ?? null,
                service_price: order.service_price ?? null,
                delivery_price: order.delivery_price ?? null,
                detergent_price: order.detergent_price ?? null,
                rider_pickup_id: order.rider_pickup_id?.id ?? null,
                rider_delivery_id: order.rider_delivery_id?.id ?? null,
                order_datetime: order.order_datetime
                    ? order.order_datetime.toDate().toISOString()
                    : null,
                address: addressData?.address_text ?? null,
                customer: customerData ? {
                    id: customerSnap.id,
                    name: customerData.fullname ?? null,
                    phone: customerData.phone ?? null,
                    profile_image: customerData.profile_image ?? null,
                } : null,
                washer: washerData ? {
                    id: washerSnap.id,
                    name: washerData.name ?? null,
                    capacity: washerData.capacity ?? null,
                    work_minutes: washerData.work_minutes ?? null,
                    status: washerData.status ?? null,
                } : null,
                dryer: dryerData ? {
                    id: dryerSnap.id,
                    name: dryerData.name ?? null,
                    capacity: dryerData.capacity ?? null,
                    work_minutes: dryerData.work_minutes ?? null,
                    status: dryerData.status ?? null,
                } : null,
            };
        }));
        return res.status(200).json({ ok: true, data: orders });
    }
    catch (error) {
        console.error("get staff active orders error:", error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.put("/update/status/:id", async (req, res) => {
    try {
        const orderId = String(req.params.id || "").trim();
        const staff_id = String(req.body.staff_id || "").trim();
        const status = req.body.status;
        if (!orderId) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ order_id",
            });
        }
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ staff_id",
            });
        }
        if (!status) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ status",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        let customerId = null;
        let updatedStatus = null;
        await firebase_1.db.runTransaction(async (tx) => {
            const orderSnap = await tx.get(orderRef);
            if (!orderSnap.exists) {
                throw {
                    code: 404,
                    message: "ไม่พบออเดอร์",
                };
            }
            const order = orderSnap.data();
<<<<<<< HEAD
            if (order.staff_id?.id !== staff_id) {
                throw {
                    code: 403,
                    message: "คุณไม่ใช่ staff ที่รับงานนี้",
                };
            }
=======
            if (order.staff_id?.id !== staff_id)
                throw new Error("คุณไม่ใช่ staff ที่รับงานนี้");
>>>>>>> origin/main
            const updateData = {
                status,
                order_datetime: firestore_1.FieldValue.serverTimestamp(),
            };
            if (status === "drying") {
                if (order.machine_dryer_id) {
                    const dryerSnap = await tx.get(order.machine_dryer_id);
<<<<<<< HEAD
                    if (!dryerSnap.exists) {
                        throw {
                            code: 404,
                            message: "ไม่พบเครื่องอบ",
                        };
                    }
                    const dryerData = dryerSnap.data();
                    if (dryerData.status !== "available") {
                        throw {
                            code: 409,
                            message: "เครื่องอบไม่ว่าง กรุณารอเครื่องซักเสร็จ",
                        };
=======
                    const dryerData = dryerSnap.data();
                    if (dryerData?.status !== "available") {
                        throw new Error("เครื่องอบไม่ว่าง กรุณารอเครื่องซักเสร็จ");
>>>>>>> origin/main
                    }
                }
                if (order.machine_washer_id) {
                    tx.update(order.machine_washer_id, {
                        status: "available",
                    });
                }
                if (order.machine_dryer_id) {
                    tx.update(order.machine_dryer_id, {
                        status: "busy",
                    });
                }
            }
            if (status === "waiting_delivery") {
                if (order.machine_washer_id) {
                    tx.update(order.machine_washer_id, {
                        status: "available",
                    });
                }
                if (order.machine_dryer_id) {
                    tx.update(order.machine_dryer_id, {
                        status: "available",
                    });
                }
            }
            tx.update(orderRef, updateData);
            customerId =
                order.customer_id?.id ?? null;
            updatedStatus = status;
        });
<<<<<<< HEAD
        if (customerId) {
            try {
                if (updatedStatus === "drying") {
                    await notification_1.NotificationService.sendToUser(customerId, "customer", "พนักงานกำลังอบผ้าให้คุณ", "", {
                        order_id: orderId,
                        status: updatedStatus,
                    });
                }
                if (updatedStatus === "waiting_delivery") {
                    await notification_1.NotificationService.sendToUser(customerId, "customer", "พนักงานซักอบซักผ้าเสร็จแล้ว", "พนักงานซักอบกำลังเตรียมส่งผ้าให้คุณ", {
                        order_id: orderId,
                        status: updatedStatus,
                    });
                }
            }
            catch (error) {
                console.error("send notification error:", error);
            }
        }
        return res.status(200).json({
=======
        const orderSnap = await orderRef.get();
        const orderData = orderSnap.data();
        if (orderData?.customer_id && orderData?.status == "drying") {
            await notification_1.NotificationService.sendToUser(orderData.customer_id.id, "customer", "พนักงานกำลังอบผ้าให้คุณ", "", {
                order_id: orderId,
                status: orderData.status
            });
        }
        else if (orderData?.customer_id && orderData?.status == "waiting_delivery") {
            await notification_1.NotificationService.sendToUser(orderData.customer_id.id, "customer", "พนักงานซักอบซักผ้าเสร็จแล้ว", "พนักงานซักอบกำลังเตรียมส่งผ้าให้คุณ", {
                order_id: orderId,
                status: orderData.status
            });
        }
        return res.json({
>>>>>>> origin/main
            ok: true,
            message: "อัปเดตสถานะสำเร็จ",
            data: {
                status: updatedStatus,
            },
        });
    }
    catch (err) {
<<<<<<< HEAD
        console.error("update staff order status error:", err);
        if (err?.code) {
            return res.status(err.code).json({
                ok: false,
                message: err.message ?? "เกิดข้อผิดพลาด",
            });
        }
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
=======
        console.error(err);
        if (err.message === "ไม่พบออเดอร์")
            return res.status(404).json({ ok: false, message: err.message });
        if (err.message === "คุณไม่ใช่ staff ที่รับงานนี้")
            return res.status(403).json({ ok: false, message: err.message });
        if (err.message === "เครื่องอบไม่ว่าง กรุณารอเครื่องซักเสร็จ")
            return res.status(409).json({ ok: false, message: err.message });
        return res.status(500).json({ ok: false, message: "server error" });
>>>>>>> origin/main
    }
});
exports.router.put("/calculate/:id", async (req, res) => {
    try {
        const orderId = req.params.id;
        const { staff_id: staffId, weight, washer_id: washerId, dryer_id: dryerId } = req.body;
        if (!staffId || !Number.isFinite(weight) || weight <= 0) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ staff_id และน้ำหนักให้ถูกต้อง",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const order = orderSnap.data();
        if (order.staff_id?.id !== staffId) {
            return res.status(403).json({
                ok: false,
                message: "คุณไม่ใช่ staff ที่รับงานนี้",
            });
        }
<<<<<<< HEAD
        const allowedStatuses = ["waiting_wash", "waiting_dry", "waiting_payment"];
        if (!allowedStatuses.includes(order.status)) {
            return res.status(409).json({
                ok: false,
                message: "สถานะออเดอร์ไม่รองรับการคำนวณราคา",
=======
        const storeRef = order.store_id;
        if (!storeRef) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
        }
        const detergent_price = storeRef ? (await storeRef.get()).data()?.detergent_price ?? 0 : 0;
        const allowedStatuses = ["waiting_wash", "waiting_dry", "waiting_payment", 'payment_completed'];
        if (!allowedStatuses.includes(order.status)) {
            return res.status(409).json({
                ok: false,
                message: "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซัก รออบ หรือรอชำระเงิน",
>>>>>>> origin/main
            });
        }
        if (!order.store_id || !order.customer_id) {
            return res.status(404).json({
                ok: false,
                message: !order.store_id ? "ไม่พบร้านค้า" : "ไม่พบ customer",
            });
        }
        const storeSnap = await order.store_id.get();
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
        }
        const storeData = storeSnap.data();
        const detergentPrice = storeData.detergent_price ?? 0;
        const serviceType = order.service_type;
        const detergentOption = order.detergent_option;
        const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
        const needsDryer = serviceType === "dry" || serviceType === "wash_dry";
<<<<<<< HEAD
        const effectiveWasherId = washerId || order.machine_washer_id?.id;
        const effectiveDryerId = dryerId || order.machine_dryer_id?.id;
        if (needsWasher && !effectiveWasherId) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุ washer_id" });
        }
        if (needsDryer && !effectiveDryerId) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุ dryer_id" });
        }
        const washerRef = effectiveWasherId ? firebase_1.db.collection("machines").doc(effectiveWasherId) : null;
        const dryerRef = effectiveDryerId ? firebase_1.db.collection("machines").doc(effectiveDryerId) : null;
        const [washerSnap, dryerSnap] = await Promise.all([
            washerRef ? washerRef.get() : null,
            dryerRef ? dryerRef.get() : null,
        ]);
        const washer = washerSnap?.exists ? washerSnap.data() : null;
        const dryer = dryerSnap?.exists ? dryerSnap.data() : null;
        if (needsWasher) {
            if (!washer) {
                return res.status(404).json({ ok: false, message: "ไม่พบเครื่องซัก" });
            }
=======
        const effectiveWasherId = washer_id || order.machine_washer_id?.id;
        const effectiveDryerId = dryer_id || order.machine_dryer_id?.id;
        let washer = null;
        let dryer = null;
        if (needsWasher) {
            if (!effectiveWasherId) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ washer_id" });
            }
            const snap = await firebase_1.db.collection("machines").doc(effectiveWasherId).get();
            if (!snap.exists) {
                return res.status(404).json({ ok: false, message: "ไม่พบเครื่องซัก" });
            }
            washer = snap.data();
>>>>>>> origin/main
            if (washer.status !== "available") {
                return res.status(422).json({ ok: false, message: "เครื่องซักไม่ว่าง" });
            }
            if (washer.capacity < weight) {
                return res.status(422).json({ ok: false, message: "เครื่องซักรับน้ำหนักไม่พอ" });
            }
        }
        if (needsDryer) {
<<<<<<< HEAD
            if (!dryer) {
                return res.status(404).json({ ok: false, message: "ไม่พบเครื่องอบ" });
            }
=======
            if (!effectiveDryerId) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ dryer_id" });
            }
            const snap = await firebase_1.db.collection("machines").doc(effectiveDryerId).get();
            if (!snap.exists) {
                return res.status(404).json({ ok: false, message: "ไม่พบเครื่องอบ" });
            }
            dryer = snap.data();
>>>>>>> origin/main
            if (dryer.status !== "available") {
                return res.status(422).json({ ok: false, message: "เครื่องอบไม่ว่าง" });
            }
            if (dryer.capacity < weight) {
                return res.status(422).json({ ok: false, message: "เครื่องอบรับน้ำหนักไม่พอ" });
            }
<<<<<<< HEAD
=======
        }
        let servicePrice = (washer?.price ?? 0) + (dryer?.price ?? 0);
        if (needsWasher && detergentOption === "no_detergent") {
            servicePrice += detergent_price;
>>>>>>> origin/main
        }
        const servicePrice = (washer?.price ?? 0) + (dryer?.price ?? 0);
        const detergentFee = needsWasher && detergentOption === "no_detergent"
            ? detergentPrice
            : 0;
        const deliveryFee = order.delivery_price ?? 0;
<<<<<<< HEAD
        const grandTotal = servicePrice + detergentFee + deliveryFee;
        let paid = false;
        let walletAfter = 0;
        let finalStatus = order.status;
        let customerId = null;
=======
        const grandTotal = servicePrice + deliveryFee;
        let paid = false;
        let walletAfter = 0;
        let finalStatus = order.status;
        let customerId = order.customer_id?.id;
>>>>>>> origin/main
        await firebase_1.db.runTransaction(async (tx) => {
            const freshOrderSnap = await tx.get(orderRef);
            if (!freshOrderSnap.exists) {
                throw { code: 404, message: "ไม่พบออเดอร์" };
            }
            const freshOrder = freshOrderSnap.data();
            if (freshOrder.staff_id?.id !== staffId) {
                throw { code: 403, message: "คุณไม่ใช่ staff ที่รับงานนี้" };
            }
            if (!allowedStatuses.includes(freshOrder.status)) {
                throw { code: 409, message: "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาลองใหม่" };
            }
            const customerRef = freshOrder.customer_id;
            if (!customerRef) {
                throw { code: 404, message: "ไม่พบ customer" };
            }
            const [customerSnap, freshWasherSnap, freshDryerSnap] = await Promise.all([
                tx.get(customerRef),
                washerRef ? tx.get(washerRef) : null,
                dryerRef ? tx.get(dryerRef) : null,
            ]);
            if (!customerSnap.exists) {
                throw { code: 404, message: "ไม่พบ customer" };
            }
            const wallet = customerSnap.data()?.wallet_balance ?? 0;
            const canPayNow = wallet >= grandTotal;
            const nextStatus = canPayNow
<<<<<<< HEAD
                ? serviceType === "dry" ? "drying" : "washing"
                : "waiting_payment";
            if (canPayNow && washerRef && freshWasherSnap?.data()?.status !== "available") {
                throw { code: 409, message: "เครื่องซักถูกใช้งานไปแล้ว" };
            }
            if (canPayNow && dryerRef && freshDryerSnap?.data()?.status !== "available") {
                throw { code: 409, message: "เครื่องอบถูกใช้งานไปแล้ว" };
=======
                ? serviceType === "dry"
                    ? "drying"
                    : "washing"
                : "waiting_payment";
            if (canPayNow) {
                if (washer) {
                    const fw = await tx.get(firebase_1.db.collection("machines").doc(effectiveWasherId));
                    if (fw.data()?.status !== "available") {
                        throw new Error("เครื่องซักถูกใช้งานไปแล้ว");
                    }
                }
                if (dryer) {
                    const fd = await tx.get(firebase_1.db.collection("machines").doc(effectiveDryerId));
                    if (fd.data()?.status !== "available") {
                        throw new Error("เครื่องอบถูกใช้งานไปแล้ว");
                    }
                }
>>>>>>> origin/main
            }
            const updateData = {
                status: nextStatus,
                service_price: servicePrice,
                detergent_price: detergentFee,
                wash_dry_weight: weight,
<<<<<<< HEAD
                machine_washer_id: washerRef,
                machine_dryer_id: dryerRef,
            };
            if (freshOrder.status !== nextStatus) {
                updateData.order_datetime = firestore_1.FieldValue.serverTimestamp();
            }
            tx.update(orderRef, updateData);
            if (canPayNow) {
                if (washerRef) {
                    tx.update(washerRef, { status: "busy" });
                }
                if (dryerRef && serviceType === "dry") {
                    tx.update(dryerRef, { status: "busy" });
                }
                walletAfter = wallet - grandTotal;
                tx.update(customerRef, { wallet_balance: walletAfter });
            }
=======
                machine_washer_id: washer ? firebase_1.db.collection("machines").doc(effectiveWasherId) : null,
                machine_dryer_id: dryer ? firebase_1.db.collection("machines").doc(effectiveDryerId) : null,
                detergent_price: detergent_price
            };
            tx.update(orderRef, updateData);
            if (canPayNow) {
                if (washer) {
                    tx.update(firebase_1.db.collection("machines").doc(effectiveWasherId), { status: "busy" });
                }
                if (dryer && serviceType === "dry") {
                    tx.update(firebase_1.db.collection("machines").doc(effectiveDryerId), { status: "busy" });
                }
                tx.update(customerRef, { wallet_balance: wallet - grandTotal });
                walletAfter = wallet - grandTotal;
            }
>>>>>>> origin/main
            else {
                walletAfter = wallet;
            }
            paid = canPayNow;
            finalStatus = nextStatus;
            customerId = customerRef.id;
        });
        if (customerId) {
<<<<<<< HEAD
            try {
                const message = paid
                    ? serviceType === "dry"
                        ? "ชำระเงินเรียบร้อยแล้ว พนักงานซักอบกำลังดำเนินการอบผ้าให้คุณ"
                        : "ชำระเงินเรียบร้อยแล้ว พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ"
                    : "ยอดเงินในกระเป๋าของคุณไม่พอชำระ กรุณาเติมเงิน";
                await notification_1.NotificationService.sendToUser(customerId, "customer", "พนักงานซักอบคำนวณราคาเรียบร้อยแล้ว", message, { order_id: orderId, status: finalStatus });
            }
            catch (error) {
                console.error("send notification error:", error);
            }
        }
        return res.status(200).json({
=======
            if (paid) {
                await notification_1.NotificationService.sendToUser(customerId, "customer", "พนักงานซักอบคำนวณราคาเรียบร้อยแล้ว", "ชำระเงินเรียบร้อยแล้ว พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ", {
                    order_id: orderId,
                    status: finalStatus
                });
            }
            else {
                await notification_1.NotificationService.sendToUser(customerId, "customer", "พนักงานซักอบคำนวณราคาเรียบร้อยแล้ว", "ยอดเงินในกระเป๋าของคุณไม่พอชำระ กรุณาเติมเงิน", {
                    order_id: orderId,
                    status: finalStatus
                });
            }
        }
        return res.json({
>>>>>>> origin/main
            ok: true,
            paid,
            message: paid
                ? "ชำระเงินแล้ว คำนวณราคาสำเร็จ เริ่มดำเนินการได้เลย"
                : "คำนวณราคาสำเร็จ แต่ยอดเงินในกระเป๋าไม่พอชำระ กรุณาเติมเงิน",
            data: {
                service_price: servicePrice,
                detergent_price: detergentFee,
                delivery_price: deliveryFee,
                total_amount: grandTotal,
                wallet_balance_after: walletAfter,
            },
        });
    }
    catch (err) {
        console.error("calculate order error:", err);
        if (err?.code) {
            return res.status(err.code).json({ ok: false, message: err.message });
        }
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.get("/calculate/preview/:id", async (req, res) => {
    try {
        const orderId = req.params.id;
        const staff_id = req.query.staff_id;
        if (!staff_id)
            return res.status(400).json({ ok: false, message: "กรุณาระบุ staff_id" });
        const orderSnap = await firebase_1.db.collection("orders").doc(orderId).get();
        if (!orderSnap.exists)
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        const order = orderSnap.data();
        if (order.staff_id?.id !== staff_id)
            return res.status(403).json({ ok: false, message: "คุณไม่ใช่ staff ที่รับงานนี้" });
        const addressRef = order.address_id;
        const storeRef = order.store_id;
        const [addressSnap, storeSnap] = await Promise.all([
            addressRef.get(),
            storeRef.get(),
        ]);
        if (!addressSnap.exists)
            return res.status(404).json({ ok: false, message: "ไม่พบที่อยู่ลูกค้า" });
        const addressData = addressSnap.data();
        const storeData = storeSnap.data();
        let delivery_price = 0;
        let distanceKm = 0;
        const storeLat = storeData?.latitude;
        const storeLng = storeData?.longitude;
        const cusLat = addressData?.latitude;
        const cusLng = addressData?.longitude;
        const detergen_price = storeData?.detergent_price ?? 0;
        if (storeLat && storeLng && cusLat && cusLng) {
            distanceKm = haversine_1.DistanceService.haversineKm(storeLat, storeLng, cusLat, cusLng);
            const serviceRadius = (storeData?.service_radius);
            const deliveryMin = (storeData?.delivery_min);
            const deliveryMax = (storeData?.delivery_max);
            if (distanceKm > serviceRadius)
                return res.status(422).json({
                    ok: false,
                    message: `ที่อยู่ลูกค้าอยู่นอกพื้นที่ให้บริการ `,
                });
            delivery_price = calculateDelivery_1.DeliveryService.calculateDeliveryFee(distanceKm, serviceRadius, deliveryMin, deliveryMax);
        }
        const updateData = {
            delivery_price: delivery_price,
        };
        await firebase_1.db.collection("orders").doc(orderId).update(updateData);
        return res.json({
            ok: true,
            message: "คำนวณค่าส่งสำเร็จ",
            data: {
                delivery_price: delivery_price,
                distance_km: Math.round(distanceKm * 100) / 100,
                detergent_price: detergen_price,
            },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: err.message ?? "server error" });
    }
});
exports.router.put("/start_paid/:id", async (req, res) => {
<<<<<<< HEAD
=======
    try {
        const orderId = req.params.id;
        const { staff_id } = req.body;
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ staff_id",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const order = orderSnap.data();
        if (order.staff_id?.id !== staff_id) {
            return res.status(403).json({
                ok: false,
                message: "คุณไม่ใช่ staff ที่รับงานนี้",
            });
        }
        // endpoint นี้ใช้ได้เฉพาะออเดอร์ที่จ่ายเงินไปแล้วเท่านั้น
        if (order.status !== "payment_completed") {
            return res.status(409).json({
                ok: false,
                message: "ออเดอร์นี้ยังไม่ได้ชำระเงิน กรุณาใช้หน้าคำนวณราคาแทน",
            });
        }
        const serviceType = order.service_type;
        const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
        const needsDryer = serviceType === "dry" || serviceType === "wash_dry";
        if (!order.machine_washer_id && needsWasher) {
            return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องซักที่ผูกไว้" });
        }
        if (!order.machine_dryer_id && needsDryer) {
            return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องอบที่ผูกไว้" });
        }
        const [washerSnap, dryerSnap] = await Promise.all([
            order.machine_washer_id ? order.machine_washer_id.get() : Promise.resolve(null),
            order.machine_dryer_id ? order.machine_dryer_id.get() : Promise.resolve(null),
        ]);
        const washerData = washerSnap?.data();
        const dryerData = dryerSnap?.data();
        const washerBusy = needsWasher && washerData?.status !== "available";
        const dryerBusy = needsDryer && dryerData?.status !== "available";
        if (washerBusy || dryerBusy) {
            return res.status(200).json({
                ok: true,
                waiting: true,
                message: washerBusy && dryerBusy
                    ? "เครื่องซักและเครื่องอบยังไม่ว่าง กรุณารอสักครู่"
                    : washerBusy
                        ? `${washerData?.name ?? "เครื่องซัก"} ยังไม่ว่าง กรุณารอสักครู่`
                        : `${dryerData?.name ?? "เครื่องอบ"} ยังไม่ว่าง กรุณารอสักครู่`,
                data: {
                    washer_status: washerData?.status ?? null,
                    dryer_status: dryerData?.status ?? null,
                },
            });
        }
        let nextStatus = serviceType === "dry" ? "drying" : "washing";
        await firebase_1.db.runTransaction(async (tx) => {
            const freshOrderSnap = await tx.get(orderRef);
            const freshOrder = freshOrderSnap.data();
            if (freshOrder.status !== "payment_completed") {
                throw new Error("สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาลองใหม่");
            }
            const freshWasherSnap = needsWasher && freshOrder.machine_washer_id
                ? await tx.get(freshOrder.machine_washer_id)
                : null;
            const freshDryerSnap = needsDryer && freshOrder.machine_dryer_id
                ? await tx.get(freshOrder.machine_dryer_id)
                : null;
            if (freshWasherSnap && freshWasherSnap.data()?.status !== "available") {
                throw new Error("เครื่องซักถูกใช้งานไปแล้ว กรุณารอสักครู่");
            }
            if (freshDryerSnap && freshDryerSnap.data()?.status !== "available") {
                throw new Error("เครื่องอบถูกใช้งานไปแล้ว กรุณารอสักครู่");
            }
            if (freshWasherSnap) {
                tx.update(freshWasherSnap.ref, { status: "busy" });
            }
            if (freshDryerSnap) {
                tx.update(freshDryerSnap.ref, { status: "busy" });
            }
            tx.update(orderRef, {
                status: nextStatus,
            });
        });
        return res.json({
            ok: true,
            waiting: false,
            message: nextStatus === "drying" ? "เริ่มอบแล้ว" : "เริ่มซักแล้ว",
            data: { status: nextStatus },
        });
    }
    catch (err) {
        console.error(err);
        if (err.message?.includes("เครื่องซักถูกใช้งานไปแล้ว") ||
            err.message?.includes("เครื่องอบถูกใช้งานไปแล้ว")) {
            return res.status(200).json({
                ok: true,
                waiting: true,
                message: err.message,
            });
        }
        return res.status(500).json({
            ok: false,
            message: err.message ?? "server error",
        });
    }
});
exports.router.get("/detail/:id", async (req, res) => {
>>>>>>> origin/main
    try {
        const orderId = req.params.id;
        const { staff_id } = req.body;
        if (!staff_id) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุ staff_id" });
        }
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const order = orderSnap.data();
        if (order.staff_id?.id !== staff_id) {
            return res.status(403).json({ ok: false, message: "คุณไม่ใช่ staff ที่รับงานนี้" });
        }
        if (order.status !== "payment_completed") {
            return res.status(409).json({
                ok: false,
                message: "ออเดอร์นี้ยังไม่ได้ชำระเงิน กรุณาใช้หน้าคำนวณราคาแทน",
            });
        }
        const serviceType = order.service_type;
        const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
        const needsDryer = serviceType === "dry" || serviceType === "wash_dry";
        if (needsWasher && !order.machine_washer_id) {
            return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องซักที่ผูกไว้" });
        }
        if (needsDryer && !order.machine_dryer_id) {
            return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องอบที่ผูกไว้" });
        }
        const [washerSnap, dryerSnap] = await Promise.all([
            order.machine_washer_id ? order.machine_washer_id.get() : null,
            order.machine_dryer_id ? order.machine_dryer_id.get() : null,
        ]);
        const washerData = washerSnap?.exists ? washerSnap.data() : null;
        const dryerData = dryerSnap?.exists ? dryerSnap.data() : null;
        const washerBusy = needsWasher && washerData?.status !== "available";
        const dryerBusy = serviceType === "dry" && dryerData?.status !== "available";
        if (washerBusy || dryerBusy) {
            return res.status(200).json({
                ok: true,
                waiting: true,
                message: washerBusy && dryerBusy
                    ? "เครื่องซักและเครื่องอบยังไม่ว่าง กรุณารอสักครู่"
                    : washerBusy
                        ? `${washerData?.name ?? "เครื่องซัก"} ยังไม่ว่าง กรุณารอสักครู่`
                        : `${dryerData?.name ?? "เครื่องอบ"} ยังไม่ว่าง กรุณารอสักครู่`,
                data: {
                    washer_status: washerData?.status ?? null,
                    dryer_status: dryerData?.status ?? null,
                },
            });
        }
        const nextStatus = serviceType === "dry" ? "drying" : "washing";
        await firebase_1.db.runTransaction(async (tx) => {
            const freshOrderSnap = await tx.get(orderRef);
            if (!freshOrderSnap.exists) {
                throw { code: 404, message: "ไม่พบออเดอร์" };
            }
            const freshOrder = freshOrderSnap.data();
            if (freshOrder.staff_id?.id !== staff_id) {
                throw { code: 403, message: "คุณไม่ใช่ staff ที่รับงานนี้" };
            }
            if (freshOrder.status !== "payment_completed") {
                throw { code: 409, message: "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาลองใหม่" };
            }
            const freshWasherSnap = needsWasher && freshOrder.machine_washer_id
                ? await tx.get(freshOrder.machine_washer_id)
                : null;
            const freshDryerSnap = needsDryer && freshOrder.machine_dryer_id
                ? await tx.get(freshOrder.machine_dryer_id)
                : null;
            if (freshWasherSnap && freshWasherSnap.data()?.status !== "available") {
                throw {
                    code: 409,
                    waiting: true,
                    message: "เครื่องซักถูกใช้งานไปแล้ว กรุณารอสักครู่",
                };
            }
            if (serviceType === "dry" &&
                freshDryerSnap &&
                freshDryerSnap.data()?.status !== "available") {
                throw {
                    code: 409,
                    waiting: true,
                    message: "เครื่องอบถูกใช้งานไปแล้ว กรุณารอสักครู่",
                };
            }
            if (freshWasherSnap) {
                tx.update(freshWasherSnap.ref, { status: "busy" });
            }
            if (freshDryerSnap && serviceType === "dry") {
                tx.update(freshDryerSnap.ref, { status: "busy" });
            }
            tx.update(orderRef, {
                status: nextStatus,
                order_datetime: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        return res.status(200).json({
            ok: true,
            waiting: false,
            message: nextStatus === "drying" ? "เริ่มอบแล้ว" : "เริ่มซักแล้ว",
            data: { status: nextStatus },
        });
    }
    catch (err) {
        console.error("start paid error:", err);
        if (err?.waiting) {
            return res.status(200).json({
                ok: true,
                waiting: true,
                message: err.message,
            });
        }
        if (err?.code) {
            return res.status(err.code).json({
                ok: false,
                message: err.message,
            });
        }
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.get("/detail/:id", async (req, res) => {
    try {
        const orderId = req.params.id;
        const orderSnap = await firebase_1.db.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบคำสั่งซื้อ" });
        }
        const orderData = orderSnap.data();
        const [customerSnap, addressSnap, riderPickupSnap] = await Promise.all([
            orderData.customer_id?.get() ?? null,
            orderData.address_id?.get() ?? null,
            orderData.rider_pickup_id?.get() ?? null,
        ]);
        const customerData = customerSnap?.exists ? customerSnap.data() : null;
        const addressData = addressSnap?.exists ? addressSnap.data() : null;
        const riderPickupData = riderPickupSnap?.exists ? riderPickupSnap.data() : null;
        const customer = customerData && customerSnap ? {
            customer_id: customerSnap.id,
            username: customerData.username ?? null,
            fullname: customerData.fullname ?? null,
            profile_image: customerData.profile_image ?? null,
            phone: customerData.phone ?? null,
        } : null;
        const address = addressData ? {
            address_text: addressData.address_text ?? null,
        } : null;
        const riderPickup = riderPickupData ? {
            fullname: riderPickupData.fullname ?? null,
            phone: riderPickupData.phone ?? null,
            vehicle_type: riderPickupData.vehicle_type ?? null,
            license_plate: riderPickupData.license_plate ?? null,
            profile_image: riderPickupData.profile_image ?? null,
        } : null;
        const orderDatetime = orderData.order_datetime
            ? typeof orderData.order_datetime.toDate === "function"
                ? orderData.order_datetime.toDate().toISOString()
                : orderData.order_datetime
            : null;
        return res.status(200).json({
            ok: true,
            data: {
                order_id: orderSnap.id,
                customer_id: orderData.customer_id?.id ?? null,
                address_id: orderData.address_id?.id ?? null,
                store_id: orderData.store_id?.id ?? null,
                rider_pickup_id: orderData.rider_pickup_id?.id ?? null,
                rider_delivery_id: orderData.rider_delivery_id?.id ?? null,
                machine_washer_id: orderData.machine_washer_id?.id ?? null,
                machine_dryer_id: orderData.machine_dryer_id?.id ?? null,
                staff_id: orderData.staff_id?.id ?? null,
                service_type: orderData.service_type ?? null,
                wash_dry_weight: orderData.wash_dry_weight ?? null,
                service_price: orderData.service_price ?? null,
                delivery_price: orderData.delivery_price ?? null,
                detergent_price: orderData.detergent_price ?? null,
                detergent_option: orderData.detergent_option ?? null,
                before_wash_image: orderData.before_wash_image ?? null,
                after_wash_image: orderData.after_wash_image ?? null,
                note: orderData.note ?? null,
                status: orderData.status ?? null,
                order_datetime: orderDatetime,
                customer,
                address,
                rider_pickup: riderPickup,
            },
        });
    }
    catch (error) {
        console.error("get order detail error:", error);
        return res.status(500).json({
            ok: false,
            message: "เกิดข้อผิดพลาดในระบบ",
        });
    }
});
