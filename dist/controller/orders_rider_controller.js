"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const upload_1 = require("../middlewares/upload");
exports.router = (0, express_1.Router)();
exports.router.put("/update/status/:id", upload_1.upload.single("image"), async (req, res) => {
    try {
        const order_id = req.params.id;
        const { status, rider_id } = req.body;
        if (!status) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุสถานะ" });
        }
        const orderRef = firebase_1.db.collection("orders").doc(order_id);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const orderData = orderSnap.data();
        const updateData = { status };
        // อัปโหลดรูป
        if (req.file) {
            const fileName = `orders/${order_id}/${Date.now()}_${req.file.originalname}`;
            const file = firebase_1.bucket.file(fileName);
            await file.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });
            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${firebase_1.bucket.name}/${fileName}`;
            if (status === "pickup_completed")
                updateData.before_wash_image = publicUrl;
            if (status === "completed")
                updateData.after_wash_image = publicUrl;
        }
        // ไรเดอร์รับผ้าจากบ้านลูกค้าแล้ว กำลังเดินทางไปร้าน
        if (status === "pickup_completed") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            if (!orderData?.rider_pickup_id) {
                updateData.rider_pickup_id = firebase_1.db.collection("riders").doc(rider_id);
            }
        }
        // ไรเดอร์ส่งผ้าถึงร้านแล้ว พนักงานจะเห็นงานตอนนี้
        if (status === "waiting_wash") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_pickup_id = firebase_1.db.collection("riders").doc(rider_id);
        }
        // ไรเดอร์ส่งผ้ากลับบ้านลูกค้าเสร็จ
        if (status === "completed") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_delivery_id = firebase_1.db.collection("riders").doc(rider_id);
        }
        await orderRef.update(updateData);
        return res.json({ ok: true, message: "อัปเดตสถานะสำเร็จ", data: updateData });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
function calcDistanceKm(riderLat, riderLng, addressLat, addressLng) {
    if (riderLat == null ||
        riderLng == null ||
        addressLat == null ||
        addressLng == null) {
        return null;
    }
    if (Math.abs(riderLat) > 90 ||
        Math.abs(addressLat) > 90 ||
        Math.abs(riderLng) > 180 ||
        Math.abs(addressLng) > 180) {
        return null;
    }
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // km
    const lat1 = toRad(riderLat);
    const lat2 = toRad(addressLat);
    const dLat = lat2 - lat1;
    const dLng = toRad(addressLng - riderLng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
exports.router.get("/:id", async (req, res) => {
    try {
        const rider_id = req.params.id;
        const riderlat = parseFloat(req.query.lat);
        const riderlng = parseFloat(req.query.lng);
        const hasRiderLocation = !isNaN(riderlat) && !isNaN(riderlng);
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const activeStatuses = ["picked_up", "pickup_completed", "delivering"];
        const [pickupSnap, deliverySnap] = await Promise.all([
            firebase_1.db.collection("orders")
                .where("rider_pickup_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
            firebase_1.db.collection("orders")
                .where("rider_delivery_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
        ]);
        const allDocs = pickupSnap.docs.concat(deliverySnap.docs);
        const uniqueMap = new Map(allDocs.map((doc) => [doc.id, doc]));
        const orderDocs = Array.from(uniqueMap.values());
        if (orderDocs.length === 0) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์ของไรเดอร์คนนี้" });
        }
        const orders = await Promise.all(orderDocs.map(async (orderDoc) => {
            const orderData = orderDoc.data();
            const addressRef = orderData?.address_id;
            const customerRef = orderData?.customer_id;
            const [addressSnap, customerSnap] = await Promise.all([
                addressRef ? addressRef.get() : Promise.resolve(null),
                customerRef ? customerRef.get() : Promise.resolve(null),
            ]);
            const addressData = addressSnap?.exists ? addressSnap.data() : null;
            const customerData = customerSnap?.exists ? customerSnap.data() : null;
            // ── คำนวณระยะทาง ──
            const addrLat = addressData?.latitude ?? null;
            const addrLng = addressData?.longitude ?? null;
            let distance = 0;
            if (hasRiderLocation && addrLat !== null && addrLng !== null) {
                distance = calcDistanceKm(riderlat, riderlng, addrLat, addrLng) ?? 0;
            }
            return {
                id: orderDoc.id,
                order_number: orderData?.order_number ?? null,
                status: orderData?.status ?? null,
                service_type: orderData?.service_type ?? null,
                distance_km: Number(distance.toFixed(1)),
                time_slot: orderData?.time_slot ?? null,
                note: orderData?.note ?? null,
                before_wash_image: orderData?.before_wash_image ?? null,
                after_wash_image: orderData?.after_wash_image ?? null,
                rider_pickup_id: orderData?.rider_pickup_id?.id ?? null,
                rider_delivery_id: orderData?.rider_delivery_id?.id ?? null,
                order_datetime: orderData?.order_datetime
                    ? { _seconds: orderData.order_datetime.seconds }
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
exports.router.post("/accept/:id", async (req, res) => {
    try {
        const order_id = req.params.id;
        const { rider_id } = req.body;
        if (!rider_id) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
        }
        const firestore = firebase_1.db;
        const riderRef = firestore.collection("riders").doc(rider_id);
        const MAX_ORDERS = 3;
        const [pickupSnap, deliverySnap] = await Promise.all([
            firestore.collection("orders")
                .where("rider_pickup_id", "==", riderRef)
                .where("status", "==", "picked_up")
                .get(),
            firestore.collection("orders")
                .where("rider_delivery_id", "==", riderRef)
                .where("status", "==", "delivering")
                .get(),
        ]);
        const totalActive = pickupSnap.size + deliverySnap.size;
        if (totalActive >= MAX_ORDERS) {
            return res.status(400).json({
                ok: false,
                message: `คุณรับงานครบ ${MAX_ORDERS} งานแล้ว กรุณาจบงานก่อนรับงานใหม่`,
            });
        }
        const orderRef = firestore.collection("orders").doc(order_id);
        await firestore.runTransaction(async (tx) => {
            const snap = await tx.get(orderRef);
            if (!snap.exists)
                throw new Error("ไม่พบออเดอร์นี้");
            const status = snap.data()?.status;
            if (status === "waiting_pickup") {
                if (snap.data()?.rider_pickup_id)
                    throw new Error("งานนี้ถูกรับไปแล้ว");
                tx.update(orderRef, {
                    rider_pickup_id: riderRef,
                    status: "picked_up",
                });
            }
            else if (status === "waiting_delivery") {
                if (snap.data()?.rider_delivery_id)
                    throw new Error("งานนี้ถูกรับไปแล้ว");
                tx.update(orderRef, {
                    rider_delivery_id: riderRef,
                    status: "delivering",
                });
            }
            else {
                throw new Error("สถานะงานไม่รองรับการรับงาน");
            }
        });
        return res.json({
            ok: true,
            message: `รับงานสำเร็จ! (งานที่ ${totalActive + 1}/${MAX_ORDERS})`,
        });
    }
    catch (error) {
        if (error.message) {
            return res.status(400).json({ ok: false, message: error.message });
        }
        console.error(error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
