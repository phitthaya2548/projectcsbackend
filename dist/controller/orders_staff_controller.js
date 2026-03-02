"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
exports.router = (0, express_1.Router)();
exports.router.put("/start_wash/:id", async (req, res) => {
    try {
        const order_id = req.params.id;
        const { staff_id } = req.body;
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ staff_id",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(order_id);
        const staffRef = firebase_1.db.collection("laundry_staff").doc(staff_id);
        await firebase_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(orderRef);
            if (!snap.exists) {
                throw { code: 404, message: "ไม่พบออเดอร์นี้" };
            }
            const order = snap.data();
            if (order.status !== "waiting_wash") {
                throw {
                    code: 409,
                    message: "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซัก",
                };
            }
            if (order.staff_id) {
                throw {
                    code: 409,
                    message: "ออเดอร์นี้ถูกรับไปแล้ว",
                };
            }
            const updateData = {
                staff_id: staffRef,
                status: "waiting_wash",
            };
            tx.update(orderRef, updateData);
        });
        return res.json({
            ok: true,
            message: "รับงานและเริ่มซัก",
        });
    }
    catch (error) {
        if (error.code) {
            return res.status(error.code).json({
                ok: false,
                message: error.message,
            });
        }
        console.error(error);
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/history/:id", async (req, res) => {
    try {
        const staff_id = req.params.id;
        const staffRef = firebase_1.db.collection("laundry_staff").doc(staff_id);
        const staffSnap = await staffRef.get();
        if (!staffSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบ staff คนนี้",
            });
        }
        const ACTIVE_STATUS = [
            "waiting_wash",
            "waiting_payment",
            "washing",
            "drying",
            "waiting_delivery",
        ];
        const ordersSnap = await firebase_1.db
            .collection("orders")
            .where("staff_id", "==", staffRef)
            .where("status", "in", ACTIVE_STATUS)
            .get();
        if (ordersSnap.empty) {
            return res.json({ ok: true, data: [] });
        }
        const orders = await Promise.all(ordersSnap.docs.map(async (doc) => {
            const order = doc.data();
            const orderStoreRef = order.store_id;
            const [storeSnap, addressSnap, customerSnap] = await Promise.all([
                orderStoreRef ? orderStoreRef.get() : Promise.resolve(null),
                order.address_id ? order.address_id.get() : Promise.resolve(null),
                order.customer_id ? order.customer_id.get() : Promise.resolve(null),
            ]);
            const storeData = storeSnap?.exists ? storeSnap.data() : null;
            const addressData = addressSnap?.exists ? addressSnap.data() : null;
            const customerData = customerSnap?.exists ? customerSnap.data() : null;
            return {
                id: doc.id,
                store: storeSnap?.exists
                    ? {
                        id: orderStoreRef?.id ?? null,
                        name: storeData?.name ?? null,
                    }
                    : null,
                status: order.status,
                service_type: order.service_type,
                detergent_option: order.detergent_option ?? null,
                note: order.note ?? null,
                before_wash_image: order.before_wash_image ?? null,
                after_wash_image: order.after_wash_image ?? null,
                wash_dry_weight: order.wash_dry_weight,
                service_price: order.service_price,
                delivery_price: order.delivery_price,
                rider_pickup_id: order.rider_pickup_id?.id ?? null,
                rider_delivery_id: order.rider_delivery_id?.id ?? null,
                order_datetime: order.order_datetime
                    ? order.order_datetime.toDate()
                    : null,
                address: addressData?.address_text ?? null,
                customer: customerData
                    ? {
                        id: customerSnap.id,
                        name: customerData.fullname ?? null,
                        phone: customerData.phone ?? null,
                        profile_image: customerData.profile_image ?? null,
                    }
                    : null,
            };
        }));
        return res.json({ ok: true, data: orders });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.put("/update/status/staff/:id", async (req, res) => {
    try {
        const orderId = req.params.id;
        const { staff_id, status } = req.body;
        const ALLOWED = [
            "washing",
            "drying",
            "waiting_delivery",
        ];
        if (!status || !ALLOWED.includes(status)) {
            return res.status(400).json({
                ok: false,
                message: `สถานะต้องเป็น: ${ALLOWED.join(", ")}`,
            });
        }
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ staff_id",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        await firebase_1.db.runTransaction(async (tx) => {
            const orderSnap = await tx.get(orderRef);
            if (!orderSnap.exists)
                throw new Error("ไม่พบออเดอร์");
            const order = orderSnap.data();
            if (order.staff_id?.id !== staff_id)
                throw new Error("คุณไม่ใช่ staff ที่รับงานนี้");
            const serviceType = order.service_type;
            const updateData = { status };
            if (status === "washing") {
            }
            if (status === "drying") {
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
                if (serviceType === "wash_dry" && order.machine_dryer_id) {
                    tx.update(order.machine_dryer_id, {
                        status: "available",
                    });
                }
            }
            tx.update(orderRef, updateData);
        });
        return res.json({
            ok: true,
            message: "อัปเดตสถานะสำเร็จ",
            data: { status },
        });
    }
    catch (err) {
        console.error(err);
        if (err.message === "ไม่พบออเดอร์")
            return res.status(404).json({ ok: false, message: err.message });
        if (err.message === "คุณไม่ใช่ staff ที่รับงานนี้")
            return res.status(403).json({ ok: false, message: err.message });
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.put("/calculate/:id", async (req, res) => {
    try {
        const orderId = req.params.id;
        const { staff_id, weight, washer_id, dryer_id } = req.body;
        if (!staff_id || !weight || weight <= 0) {
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
        if (order.staff_id?.id !== staff_id) {
            return res.status(403).json({
                ok: false,
                message: "คุณไม่ใช่ staff ที่รับงานนี้",
            });
        }
        if (order.status !== "waiting_wash") {
            return res.status(409).json({
                ok: false,
                message: "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซัก",
            });
        }
        const serviceType = order.service_type;
        let washer = null;
        let dryer = null;
        let servicePrice = 0;
        if (serviceType === "wash" || serviceType === "wash_dry") {
            if (!washer_id)
                return res.status(400).json({ ok: false, message: "กรุณาระบุ washer_id" });
            const snap = await firebase_1.db.collection("machines").doc(washer_id).get();
            if (!snap.exists)
                return res.status(404).json({ ok: false, message: "ไม่พบเครื่องซัก" });
            washer = snap.data();
            if (washer.status !== "available")
                return res.status(422).json({ ok: false, message: "เครื่องซักไม่ว่าง" });
            if (washer.capacity < weight)
                return res.status(422).json({ ok: false, message: "เครื่องซักรับน้ำหนักไม่พอ" });
            servicePrice += washer.price;
        }
        if (serviceType === "dry" || serviceType === "wash_dry") {
            if (!dryer_id)
                return res.status(400).json({ ok: false, message: "กรุณาระบุ dryer_id" });
            const snap = await firebase_1.db.collection("machines").doc(dryer_id).get();
            if (!snap.exists)
                return res.status(404).json({ ok: false, message: "ไม่พบเครื่องอบ" });
            dryer = snap.data();
            if (dryer.status !== "available")
                return res.status(422).json({ ok: false, message: "เครื่องอบไม่ว่าง" });
            if (dryer.capacity < weight)
                return res.status(422).json({ ok: false, message: "เครื่องอบรับน้ำหนักไม่พอ" });
            servicePrice += dryer.price;
        }
        const deliveryFee = order.delivery_price ?? 0;
        const grandTotal = servicePrice + deliveryFee;
        await firebase_1.db.runTransaction(async (tx) => {
            const orderDoc = await tx.get(orderRef);
            const orderData = orderDoc.data();
            const customerRef = orderData.customer_id;
            const customerSnap = await tx.get(customerRef);
            const wallet = customerSnap.data()?.wallet_balance ?? 0;
            const nextStatus = wallet >= grandTotal
                ? serviceType === "dry"
                    ? "drying"
                    : "washing"
                : "waiting_payment";
            if (washer) {
                const fw = await tx.get(firebase_1.db.collection("machines").doc(washer_id));
                if (fw.data()?.status !== "available")
                    throw new Error("เครื่องซักถูกใช้งานไปแล้ว");
            }
            if (dryer) {
                const fd = await tx.get(firebase_1.db.collection("machines").doc(dryer_id));
                if (fd.data()?.status !== "available")
                    throw new Error("เครื่องอบถูกใช้งานไปแล้ว");
            }
            const updateData = {
                status: nextStatus,
                service_price: servicePrice,
                wash_dry_weight: weight,
                machine_washer_id: washer
                    ? firebase_1.db.collection("machines").doc(washer_id)
                    : null,
                machine_dryer_id: dryer
                    ? firebase_1.db.collection("machines").doc(dryer_id)
                    : null,
            };
            tx.update(orderRef, updateData);
            if (nextStatus !== "waiting_payment") {
                if (washer) {
                    tx.update(firebase_1.db.collection("machines").doc(washer_id), {
                        status: "busy",
                    });
                }
                if (dryer && serviceType === "dry") {
                    tx.update(firebase_1.db.collection("machines").doc(dryer_id), {
                        status: "busy",
                    });
                }
                tx.update(customerRef, {
                    wallet_balance: wallet - grandTotal,
                });
            }
        });
        return res.json({
            ok: true,
            message: "คำนวณราคาและอัปเดตสถานะสำเร็จ",
            data: {
                service_price: servicePrice,
                delivery_fee: deliveryFee,
                total_amount: grandTotal,
            },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            ok: false,
            message: err.message ?? "server error",
        });
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
        function haversineKm(lat1, lng1, lat2, lng2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) *
                    Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        let delivery_price = 0;
        let distanceKm = 0;
        const storeLat = storeData?.latitude;
        const storeLng = storeData?.longitude;
        const cusLat = addressData?.latitude;
        const cusLng = addressData?.longitude;
        if (storeLat && storeLng && cusLat && cusLng) {
            distanceKm = haversineKm(storeLat, storeLng, cusLat, cusLng);
            const serviceRadius = (storeData?.service_radius);
            const deliveryMin = (storeData?.delivery_min);
            const deliveryMax = (storeData?.delivery_max);
            if (distanceKm > serviceRadius)
                return res.status(422).json({
                    ok: false,
                    message: `ที่อยู่ลูกค้าอยู่นอกพื้นที่ให้บริการ (${distanceKm.toFixed(1)} กม. / รัศมี ${serviceRadius} กม.)`,
                });
            delivery_price = calculateDeliveryFee(distanceKm, serviceRadius, deliveryMin, deliveryMax);
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
            },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, message: err.message ?? "server error" });
    }
});
function calculateDeliveryFee(distanceKm, serviceRadius, deliveryMin, deliveryMax) {
    if (distanceKm > serviceRadius)
        throw new Error("Out of delivery area");
    const shipping = deliveryMin + (distanceKm / serviceRadius) * (deliveryMax - deliveryMin);
    return Math.round(Math.min(Math.max(shipping, deliveryMin), deliveryMax));
}
