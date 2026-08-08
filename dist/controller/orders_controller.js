"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
const haversine_1 = require("../services/haversine");
const notification_1 = require("../services/notification");
exports.router = (0, express_1.Router)();
exports.router.post("/create", async (req, res) => {
    try {
        const { customer_id, address_id, store_id, service_type, detergent_option, before_wash_image, note, } = req.body;
        if (!customer_id || !store_id || !service_type) {
            return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
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
        if (store.status !== "OPEN") {
            return res.status(400).json({ ok: false, message: "ร้านปิดอยู่ ไม่สามารถสั่งได้" });
        }
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const currentHour = now.getHours();
        const openHour = Number(store.opening_hours.split(":")[0]);
        const closeHour = Number(store.closed_hours.split(":")[0]);
        let isOpen = false;
        if (openHour < closeHour) {
            // กรณีเปิดและปิดในวันเดียวกัน เช่น 08:00 - 20:00
            if (currentHour >= openHour && currentHour < closeHour) {
                isOpen = true;
            }
        }
        else {
            // กรณีข้ามเที่ยงคืน เช่น 20:00 - 06:00
            if (currentHour >= openHour || currentHour < closeHour) {
                isOpen = true;
            }
        }
        if (!isOpen) {
            return res.status(400).json({
                ok: false,
                message: "อยู่นอกเวลาให้บริการ",
            });
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
            const distanceKm = haversine_1.DistanceService.haversineKm(storeLat, storeLng, customerLat, customerLng);
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
            detergent_price: 0,
            note: note ?? null,
            machine_washer_id: null,
            machine_dryer_id: null,
            status: "pending_confirmation",
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
exports.router.post("/store/accept/:id", async (req, res) => {
    const orderId = req.params.id;
    const { store_id } = req.body;
    try {
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const Storedata = orderSnap.data();
        if (store_id && Storedata.store_id?.id !== store_id) {
            return res.status(403).json({ ok: false, message: "ออเดอร์นี้ไม่ใช่ของร้านค้านี้" });
        }
        if (Storedata.status !== "pending_confirmation") {
            return res.status(400).json({
                ok: false,
                message: `ไม่สามารถรับออเดอร์นี้ได้ (สถานะปัจจุบัน: ${Storedata.status})`,
            });
        }
        await orderRef.update({
            status: "waiting_pickup",
            order_datetime: firestore_1.FieldValue.serverTimestamp(),
        });
        if (Storedata?.customer_id) {
            await notification_1.NotificationService.sendToUser(Storedata.customer_id.id, "customer", "ร้านยืนยันออเดอร์แล้ว", "ร้านยืนยันออเดอร์ของคุณแล้ว กำลังรอไรเดอร์มารับผ้า", {
                order_id: orderId,
                status: "waiting_pickup"
            });
        }
        return res.status(200).json({
            ok: true,
            message: "รับออเดอร์สำเร็จ เปลี่ยนสถานะเป็นรอจัดส่ง",
            order_id: orderId,
            status: "waiting_pickup",
        });
    }
    catch (error) {
        console.error("Error accepting order:", error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
exports.router.post("/store/cancel/:id", async (req, res) => {
    const orderId = req.params.id;
    const { store_id, reason } = req.body;
    try {
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const data = orderSnap.data();
        // ตรวจสอบว่าออเดอร์นี้เป็นของร้านที่กดยกเลิกจริง
        if (store_id && data.store_id?.id !== store_id) {
            return res.status(403).json({ ok: false, message: "ออเดอร์นี้ไม่ใช่ของร้านค้านี้" });
        }
        await orderRef.update({
            status: "cancelled",
            cancel_reason: reason ?? null,
            cancelled_at: firestore_1.FieldValue.serverTimestamp(),
        });
        return res.status(200).json({
            ok: true,
            message: "ยกเลิกออเดอร์สำเร็จ",
            order_id: orderId,
            status: "cancelled",
        });
    }
    catch (error) {
        console.error("Error cancelling order:", error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
exports.router.get("/store/detail/:id", async (req, res) => {
    const orderId = req.params.id;
    try {
        const orderSnap = await firebase_1.db.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
        }
        const data = orderSnap.data();
        const [addressSnap, customerSnap] = await Promise.all([
            data.address_id ? data.address_id.get() : null,
            data.customer_id ? data.customer_id.get() : null,
        ]);
        const address = addressSnap?.data();
        const customer = customerSnap?.data();
        const order = {
            order_id: orderSnap.id,
            status: data.status,
            service_type: data.service_type,
            detergent_option: data.detergent_option,
            wash_dry_weight: data.wash_dry_weight ?? 0,
            service_price: data.service_price ?? 0,
            delivery_price: data.delivery_price ?? 0,
            total_amount: (data.service_price ?? 0) + (data.delivery_price ?? 0),
            note: data.note,
            before_wash_image: data.before_wash_image ?? "",
            after_wash_image: data.after_wash_image ?? "",
            order_datetime: data.order_datetime
                ? { _seconds: data.order_datetime.seconds }
                : null,
            store_id: data.store_id?.id ?? null,
            address_id: data.address_id?.id ?? null,
            machine_washer_id: data.machine_washer_id?.id ?? null,
            machine_dryer_id: data.machine_dryer_id?.id ?? null,
            // ข้อมูลเสริม denormalized
            customer_fullname: customer?.fullname ?? "-",
            customer_phone: customer?.phone ?? "-",
            customer_profile_image: customer?.profile_image ?? "",
            customer_email: customer?.email ?? "",
            address_full: address?.address_text ?? "-",
        };
        return res.status(200).json({ ok: true, data: order });
    }
    catch (error) {
        console.error("Error fetching order detail:", error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
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
        const addressIds = [
            ...new Set(snap.docs
                .map((d) => d.data().address_id?.id)
                .filter(Boolean)),
        ];
        const addressMap = new Map();
        if (addressIds.length > 0) {
            const addressSnaps = await Promise.all(addressIds.map((id) => firebase_1.db.collection("customer_addresses").doc(id).get()));
            addressSnaps.forEach((snap) => {
                if (snap.exists)
                    addressMap.set(snap.id, snap.data());
            });
        }
        const reviewRefs = snap.docs.map((d) => firebase_1.db.collection("reviews").doc(d.id));
        const reviewSnaps = reviewRefs.length > 0
            ? await firebase_1.db.getAll.apply(firebase_1.db, reviewRefs)
            : [];
        const reviewMap = new Map();
        reviewSnaps.forEach((r) => {
            if (r.exists)
                reviewMap.set(r.id, r.data());
        });
        const data = snap.docs.map((doc) => {
            const d = doc.data();
            const addressId = d.address_id?.id ?? null;
            const addressData = addressId ? addressMap.get(addressId) ?? null : null;
            const reviewData = reviewMap.get(doc.id) ?? null;
            return {
                order_id: doc.id,
                customer_id: d.customer_id?.id ?? null,
                store_id: d.store_id?.id ?? null,
                address_id: addressId,
                rider_pickup_id: d.rider_pickup_id?.id ?? null,
                rider_delivery_id: d.rider_delivery_id?.id ?? null,
                staff_id: d.staff_id?.id ?? null,
                service_type: d.service_type,
                wash_dry_weight: d.wash_dry_weight ?? 0,
                service_price: d.service_price ?? 0,
                delivery_price: d.delivery_price ?? 0,
                total_amount: (d.service_price ?? 0) + (d.delivery_price ?? 0),
                detergent_option: d.detergent_option ?? null,
                before_wash_image: d.before_wash_image ?? "",
                after_wash_image: d.after_wash_image ?? "",
                note: d.note ?? null,
                machine_washer_id: d.machine_washer_id?.id ?? null,
                machine_dryer_id: d.machine_dryer_id?.id ?? null,
                status: d.status ?? "waiting_pickup",
                order_datetime: d.order_datetime
                    ? { _seconds: d.order_datetime.seconds }
                    : null,
                customer_fullname: customerData.fullname ?? "-",
                customer_phone: customerData.phone ?? "-",
                address_full: addressData?.address_text ?? "-",
                // สถานะรีวิว
                is_reviewed: reviewData !== null,
            };
        });
        return res.json({ ok: true, data });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "Server error" });
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
        const [riderPickupSnap, riderDeliverySnap, staffSnap, addressSnap, storeSnap, reviewSnap] = await Promise.all([
            data.rider_pickup_id ? data.rider_pickup_id.get() : null,
            data.rider_delivery_id ? data.rider_delivery_id.get() : null,
            data.staff_id ? data.staff_id.get() : null,
            data.address_id ? data.address_id.get() : null,
            data.store_id ? data.store_id.get() : null,
            firebase_1.db.collection("reviews").doc(orderId).get(),
        ]);
        const riderPickup = riderPickupSnap?.data();
        const riderDelivery = riderDeliverySnap?.data();
        const staff = staffSnap?.data();
        const review = reviewSnap.exists ? reviewSnap.data() : null;
        const storeData = storeSnap?.data();
        const addressData = addressSnap?.data();
        const order = {
            order_id: data.order_id,
            status: data.status,
            service_type: data.service_type,
            detergent_option: data.detergent_option,
            service_price: data.service_price ?? 0,
            delivery_price: data.delivery_price ?? 0,
            total_amount: (data.service_price ?? 0) + (data.delivery_price ?? 0) + (data?.detergent_price ?? 0),
            wash_dry_weight: data.wash_dry_weight,
            note: data.note,
            before_wash_image: data.before_wash_image,
            after_wash_image: data.after_wash_image,
            order_datetime: data.order_datetime,
            store_id: data.store_id?.id ?? null,
            store_name: storeData?.store_name ?? null,
            address_id: data.address_id?.id ?? null,
            address_text: addressData?.address ?? null,
            machine_washer_id: data.machine_washer_id?.id ?? null,
            machine_dryer_id: data.machine_dryer_id?.id ?? null,
            detergent_price: data.detergent_price ?? 0,
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
            review: review ? {
                rating: review.rating,
                comment: review.comment ?? null,
                reviewed_at: review.reviewed_at ?? null,
            } : null,
        };
        return res.json({ data: order });
    }
    catch (err) {
        console.error("GET /completed/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
exports.router.post("/review/:id", async (req, res) => {
    const orderId = req.params.id;
    const { rating, comment } = req.body;
    try {
        if (typeof rating !== "number" || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "คะแนนต้องเป็นตัวเลขระหว่าง 1-5" });
        }
        if (comment !== undefined && comment !== null && typeof comment !== "string") {
            return res.status(400).json({ error: "ความคิดเห็นต้องเป็นข้อความ" });
        }
        if (typeof comment === "string" && comment.length > 500) {
            return res.status(400).json({ error: "ความคิดเห็นยาวเกินไป (สูงสุด 500 ตัวอักษร)" });
        }
        const orderSnap = await firebase_1.db.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return res.status(404).json({ error: "ไม่พบคำสั่งซื้อ" });
        }
        const orderData = orderSnap.data();
        if (orderData.status !== "completed") {
            return res.status(400).json({ error: "ต้องดำเนินการคำสั่งซื้อเสร็จสิ้นก่อนจึงจะรีวิวได้" });
        }
        const reviewRef = firebase_1.db.collection("reviews").doc(orderId);
        const existingReview = await reviewRef.get();
        if (existingReview.exists) {
            return res.status(409).json({ error: "คำสั่งซื้อนี้ถูกรีวิวไปแล้ว" });
        }
        const reviewData = {
            review_id: orderId,
            store_id: orderData.store_id ?? null,
            order_id: firebase_1.db.collection("orders").doc(orderId),
            customer_id: orderData.customer_id ?? null,
            rating,
            comment: comment?.trim() || null,
            reviewed_at: firestore_1.Timestamp.now(),
        };
        await reviewRef.set(reviewData);
        return res.json({
            data: {
                rating: reviewData.rating,
                comment: reviewData.comment,
                reviewed_at: reviewData.reviewed_at,
            },
        });
    }
    catch (err) {
        console.error("POST /review/:id error:", err);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
    }
});
exports.router.get("/store/:id/reviews", async (req, res) => {
    const storeId = req.params.id;
    try {
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({ error: "Store not found" });
        }
        const reviewsSnap = await firebase_1.db
            .collection("reviews")
            .where("store_id", "==", storeRef)
            .orderBy("reviewed_at", "desc")
            .get();
        if (reviewsSnap.empty) {
            return res.json({
                data: {
                    avg_rating: 0,
                    review_count: 0,
                    reviews: [],
                },
            });
        }
        const customerIdSet = new Set();
        for (const doc of reviewsSnap.docs) {
            const id = doc.data().customer_id?.id;
            if (id)
                customerIdSet.add(id);
        }
        const customerIds = [...customerIdSet];
        const customerMap = new Map();
        if (customerIds.length > 0) {
            const customerSnaps = await Promise.all(customerIds.map((id) => firebase_1.db.collection("customers").doc(id).get()));
            customerSnaps.forEach((snap) => {
                if (snap.exists)
                    customerMap.set(snap.id, snap.data());
            });
        }
        let ratingSum = 0;
        const reviews = reviewsSnap.docs.map((doc) => {
            const data = doc.data();
            const customerId = data.customer_id?.id ?? null;
            const customerData = customerId ? customerMap.get(customerId) ?? null : null;
            const rating = typeof data.rating === "number" ? data.rating : 0;
            ratingSum += rating;
            return {
                review_id: doc.id,
                rating: data.rating,
                comment: data.comment ?? null,
                reviewed_at: data.reviewed_at
                    ? new Date(data.reviewed_at.seconds * 1000).toISOString()
                    : null,
                reviewer_name: customerData?.fullname ?? "ผู้ใช้ไม่ระบุชื่อ",
                reviewer_image: customerData?.profile_image ?? "",
            };
        });
        const reviewCount = reviewsSnap.size;
        const avgRating = reviewCount > 0 ? ratingSum / reviewCount : 0;
        return res.json({
            data: {
                avg_rating: Number(avgRating.toFixed(2)),
                review_count: reviewCount,
                reviews,
            },
        });
    }
    catch (err) {
        console.error("GET /store/:id/reviews error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});
exports.router.get("/store/list/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
        }
        const snap = await firebase_1.db
            .collection("orders")
            .where("store_id", "==", storeRef)
            .orderBy("order_datetime", "desc")
            .get();
        if (snap.empty) {
            return res.json({ ok: true, data: [] });
        }
        const customerIds = [
            ...new Set(snap.docs
                .map((d) => d.data().customer_id?.id)
                .filter(Boolean)),
        ];
        const addressIds = [
            ...new Set(snap.docs
                .map((d) => d.data().address_id?.id)
                .filter(Boolean)),
        ];
        const customerMap = new Map();
        if (customerIds.length > 0) {
            const customerSnaps = await Promise.all(customerIds.map((id) => firebase_1.db.collection("customers").doc(id).get()));
            customerSnaps.forEach((snap) => {
                if (snap.exists)
                    customerMap.set(snap.id, snap.data());
            });
        }
        const addressMap = new Map();
        if (addressIds.length > 0) {
            const addressSnaps = await Promise.all(addressIds.map((id) => firebase_1.db.collection("customer_addresses").doc(id).get()));
            addressSnaps.forEach((snap) => {
                if (snap.exists)
                    addressMap.set(snap.id, snap.data());
            });
        }
        const data = snap.docs.map((doc) => {
            const d = doc.data();
            const customerId = d.customer_id?.id ?? null;
            const customerData = customerId ? customerMap.get(customerId) ?? null : null;
            const addressId = d.address_id?.id ?? null;
            const addressData = addressId ? addressMap.get(addressId) ?? null : null;
            return {
                order_id: doc.id,
                customer_id: customerId,
                store_id: d.store_id?.id ?? null,
                address_id: addressId,
                rider_pickup_id: d.rider_pickup_id?.id ?? null,
                rider_delivery_id: d.rider_delivery_id?.id ?? null,
                staff_id: d.staff_id?.id ?? null,
                service_type: d.service_type,
                wash_dry_weight: d.wash_dry_weight ?? 0,
                service_price: d.service_price ?? 0,
                delivery_price: d.delivery_price ?? 0,
                total_amount: (d.service_price ?? 0) + (d.delivery_price ?? 0) + (d?.detergent_price ?? 0),
                detergent_option: d.detergent_option ?? null,
                before_wash_image: d.before_wash_image ?? "",
                after_wash_image: d.after_wash_image ?? "",
                note: d.note ?? null,
                machine_washer_id: d.machine_washer_id?.id ?? null,
                machine_dryer_id: d.machine_dryer_id?.id ?? null,
                status: d.status ?? "waiting_pickup",
                order_datetime: d.order_datetime
                    ? { _seconds: d.order_datetime.seconds }
                    : null,
                customer_fullname: customerData?.fullname ?? "-",
                customer_phone: customerData?.phone ?? "-",
                address_full: addressData?.address_text ?? "-",
            };
        });
        return res.json({ ok: true, data });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
exports.router.get("/store/completed/:id", async (req, res) => {
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
        const [riderPickupSnap, riderDeliverySnap, staffSnap, addressSnap, customerSnap] = await Promise.all([
            data.rider_pickup_id ? data.rider_pickup_id.get() : null,
            data.rider_delivery_id ? data.rider_delivery_id.get() : null,
            data.staff_id ? data.staff_id.get() : null,
            data.address_id ? data.address_id.get() : null,
            data.customer_id ? data.customer_id.get() : null,
        ]);
        const riderPickup = riderPickupSnap?.data();
        const riderDelivery = riderDeliverySnap?.data();
        const staff = staffSnap?.data();
        const address = addressSnap?.data();
        const customer = customerSnap?.data();
        const order = {
            order_id: data.order_id,
            status: data.status,
            service_type: data.service_type,
            detergent_option: data.detergent_option,
            service_price: data.service_price ?? 0,
            delivery_price: data.delivery_price ?? 0,
            total_amount: (data.service_price ?? 0) + (data.delivery_price ?? 0) + (data?.detergent_price ?? 0),
            wash_dry_weight: data.wash_dry_weight,
            note: data.note,
            before_wash_image: data.before_wash_image,
            after_wash_image: data.after_wash_image,
            order_datetime: data.order_datetime,
            store_id: data.store_id?.id ?? null,
            address_id: data.address_id?.id ?? null,
            machine_washer_id: data.machine_washer_id?.id ?? null,
            machine_dryer_id: data.machine_dryer_id?.id ?? null,
            detergent_price: data.detergent_price ?? 0,
            customer_fullname: customer?.fullname ?? "-",
            customer_phone: customer?.phone ?? "-",
            address_full: address?.address_text ?? "-",
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
