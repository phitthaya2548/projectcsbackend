"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
exports.router = (0, express_1.Router)();
const VALID_SERVICE_TYPES = ["wash", "dry", "wash_dry"];
const VALID_DETERGENT = ["no_detergent", "detergent"];
exports.router.post("/create", async (req, res) => {
    try {
        const { customer_id, address_id, store_id, service_type, detergent_option, before_wash_image, note, } = req.body;
        if (!customer_id || !store_id || !service_type) {
            return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
        }
        if (!VALID_SERVICE_TYPES.includes(service_type)) {
            return res.status(400).json({ ok: false, message: "ประเภทบริการไม่ถูกต้อง" });
        }
        if (detergent_option && !VALID_DETERGENT.includes(detergent_option)) {
            return res.status(400).json({ ok: false, message: "ตัวเลือกน้ำยาไม่ถูกต้อง" });
        }
        const storeRef = firebase_1.db.collection("stores").doc(store_id);
        const customerRef = firebase_1.db.collection("customers").doc(customer_id);
        const [storeSnap, customerSnap] = await Promise.all([
            storeRef.get(),
            customerRef.get(),
        ]);
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
        }
        if (!customerSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบข้อมูลลูกค้า" });
        }
        const store = storeSnap.data();
        if (store.status !== "เปิดร้าน") {
            return res.status(400).json({ ok: false, message: "ร้านปิดอยู่ ไม่สามารถสั่งได้" });
        }
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const currentHour = now.getHours();
        const openHour = Number(store.opening_hours.split(":")[0]);
        const closeHour = Number(store.closed_hours.split(":")[0]);
        const isOpen = openHour < closeHour
            ? currentHour >= openHour && currentHour < closeHour
            : currentHour >= openHour || currentHour < closeHour; // ข้ามคืน เช่น 20-02
        if (!isOpen) {
            return res.status(400).json({ ok: false, message: "อยู่นอกเวลาให้บริการ" });
        }
        if (address_id) {
            const addressData = await firebase_1.db.collection("customer_addresses").doc(address_id).get();
            if (!addressData.exists) {
                return res.status(404).json({ ok: false, message: "ไม่พบที่อยู่" });
            }
            const addressInfo = addressData.data();
            const storeLat = store.latitude;
            const storeLng = store.longitude;
            const customerLat = addressInfo.latitude;
            const customerLng = addressInfo.longitude;
            const radiusKm = store.service_radius;
            if (storeLat == null || storeLng == null || customerLat == null || customerLng == null) {
                return res.status(400).json({ ok: false, message: "ไม่พบข้อมูลพิกัด" });
            }
            const distanceKm = haversineDistance(storeLat, storeLng, customerLat, customerLng);
            if (distanceKm > radiusKm) {
                return res.status(400).json({
                    ok: false,
                    message: `ที่อยู่ของคุณอยู่นอกพื้นที่บริการ`,
                });
            }
        }
        const orderRef = firebase_1.db.collection("orders").doc();
        const newOrder = {
            order_id: orderRef.id,
            customer_id: customerRef,
            store_id: storeRef,
            address_id: address_id ? firebase_1.db.collection("customer_addresses").doc(address_id) : null,
            rider_pickup_id: null,
            rider_delivery_id: null,
            staff_id: null,
            service_type,
            wash_dry_weight: 0,
            service_price: 0,
            delivery_price: 0,
            detergent_option: detergent_option ?? null,
            before_wash_image: before_wash_image ?? "",
            after_wash_image: "",
            note: note ?? null,
            machine_washer_id: null,
            machine_dryer_id: null,
            status: "waiting_pickup",
            order_datetime: firestore_1.Timestamp.now(),
        };
        await orderRef.set(newOrder);
        return res.status(201).json({
            ok: true,
            message: "สร้างออเดอร์สำเร็จ",
            order_id: orderRef.id,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
exports.router.get("/list/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerRef = firebase_1.db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
        }
        const customerData = customerSnap.data();
        const snap = await firebase_1.db
            .collection("orders")
            .where("customer_id", "==", customerRef)
            .orderBy("order_datetime", "desc")
            .get();
        if (snap.empty) {
            return res.json({ ok: true, data: [] });
        }
        const data = await Promise.all(snap.docs.map(async (doc) => {
            const d = doc.data();
            let addressData = null;
            if (d.address_id) {
                const addressSnap = await firebase_1.db
                    .collection("customer_addresses")
                    .doc(d.address_id.id)
                    .get();
                addressData = addressSnap.data() ?? null;
            }
            return {
                order_id: doc.id,
                customer_id: d.customer_id?.id ?? null,
                store_id: d.store_id?.id ?? null,
                address_id: d.address_id?.id ?? null,
                rider_id: d.rider_id?.id ?? null,
                staff_id: d.staff_id?.id ?? null,
                service_type: d.service_type,
                wash_dry_weight: d.wash_dry_weigh,
                detergent_option: d.detergent_option ?? null,
                before_wash_image: d.before_wash_image ?? "",
                after_wash_image: d.after_wash_image ?? "",
                note: d.note ?? null,
                status: d.status ?? "waiting_pickup",
                order_datetime: d.order_datetime
                    ? { _seconds: d.order_datetime.seconds }
                    : null,
                customer_fullname: customerData.fullname ?? "-",
                customer_phone: customerData.phone ?? "-",
                address_full: addressData?.address_text ?? "-",
            };
        }));
        return res.json({ ok: true, data });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.get("/completed/:id", async (req, res) => {
    const orderId = req.params.id;
    try {
        const orderSnap = await firebase_1.db.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return res.status(404).json({ error: "Order not found" });
        }
        const data = orderSnap.data();
        if (data.status !== "completed") {
            return res.status(400).json({ error: "Order is not completed" });
        }
        const [riderPickupSnap, riderDeliverySnap, staffSnap, addressSnap, storeSnap] = await Promise.all([
            data.rider_pickup_id ? data.rider_pickup_id.get() : null,
            data.rider_delivery_id ? data.rider_delivery_id.get() : null,
            data.staff_id ? data.staff_id.get() : null,
            data.address_id ? data.address_id.get() : null,
            data.store_id ? data.store_id.get() : null,
        ]);
        const riderPickup = riderPickupSnap?.data();
        const riderDelivery = riderDeliverySnap?.data();
        const staff = staffSnap?.data();
        const order = {
            order_id: data.order_id,
            status: data.status,
            service_type: data.service_type,
            detergent_option: data.detergent_option,
            service_price: data.service_price ?? 0,
            delivery_price: data.delivery_price ?? 0,
            total_amount: (data.service_price ?? 0) + (data.delivery_price ?? 0),
            wash_dry_weight: data.wash_dry_weight,
            note: data.note,
            before_wash_image: data.before_wash_image,
            after_wash_image: data.after_wash_image,
            order_datetime: data.order_datetime,
            store_id: data.store_id?.id ?? null,
            address_id: data.address_id?.id ?? null,
            machine_washer_id: data.machine_washer_id?.id ?? null,
            machine_dryer_id: data.machine_dryer_id?.id ?? null,
            rider_pickup: riderPickup ? {
                rider_id: riderPickup.rider_id,
                fullname: riderPickup.fullname,
                phone: riderPickup.phone,
                profile_image: riderPickup.profile_image,
                vehicle_type: riderPickup.vehicle_type,
                license_plate: riderPickup.license_plate,
            } : null,
            rider_delivery: riderDelivery ? {
                rider_id: riderDelivery.rider_id,
                fullname: riderDelivery.fullname,
                phone: riderDelivery.phone,
                profile_image: riderDelivery.profile_image,
                vehicle_type: riderDelivery.vehicle_type,
                license_plate: riderDelivery.license_plate,
            } : null,
            staff: staff ? {
                staff_id: staff.staff_id,
                fullname: staff.fullname,
                phone: staff.phone,
                profile_image: staff.profile_image,
                username: staff.username,
            } : null,
        };
        return res.status(200).json({ data: order });
    }
    catch (error) {
        console.error("Error fetching completed order:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
