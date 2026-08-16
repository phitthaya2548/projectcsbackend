"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
const haversine_1 = require("../services/haversine");
const notification_1 = require("../services/notification");
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
const TZ = "Asia/Bangkok";
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
exports.router.put("/cancel/:id", async (req, res) => {
    try {
        const orderId = req.params.id;
        const { customerId } = req.body;
        if (!customerId) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบออเดอร์",
            });
        }
        const orderData = orderSnap.data();
        // ตรวจสอบว่าเป็นออเดอร์ของลูกค้าคนนี้หรือไม่
        if (orderData.customer_id?.id !== customerId) {
            return res.status(403).json({
                ok: false,
                message: "ออเดอร์นี้ไม่ใช่ของคุณ",
            });
        }
        // ต้องเป็นสถานะ pending_confirmation เท่านั้น
        if (orderData.status !== "pending_confirmation") {
            return res.status(400).json({
                ok: false,
                message: "ไม่สามารถยกเลิกออเดอร์ในสถานะนี้ได้",
            });
        }
        // ตรวจสอบ order_datetime
        if (!orderData.order_datetime) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบเวลาของออเดอร์",
            });
        }
        const orderTime = orderData.order_datetime.toMillis();
        const currentTime = firestore_1.Timestamp.now().toMillis();
        const diffMs = currentTime - orderTime;
        const fiveMinutes = 5 * 60 * 1000;
        if (diffMs < fiveMinutes) {
            const remainingMinutes = Math.ceil((fiveMinutes - diffMs) / (60 * 1000));
            return res.status(400).json({
                ok: false,
                message: `ยังไม่สามารถยกเลิกได้ กรุณารออีกประมาณ ${remainingMinutes} นาที`,
            });
        }
        // ผ่าน 5 นาทีแล้ว -> ยกเลิกได้
        await orderRef.update({
            status: "cancelled",
            cancelled_at: firestore_1.Timestamp.now(),
        });
        return res.status(200).json({
            ok: true,
            message: "ยกเลิกออเดอร์สำเร็จ",
        });
    }
    catch (error) {
        console.error("Cancel order error:", error);
        return res.status(500).json({
            ok: false,
            message: "เกิดข้อผิดพลาดในการยกเลิกออเดอร์",
        });
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
        const updteData = {
            status: "waiting_pickup",
            order_datetime: firestore_1.Timestamp.now(),
        };
        await orderRef.update(updteData);
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
            service_price: data.service_price ?? 0,
            note: data.note,
            order_datetime: data.order_datetime
                ? { _seconds: data.order_datetime.seconds }
                : null,
            store_id: data.store_id?.id ?? null,
            address_id: data.address_id?.id ?? null,
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
exports.router.get("/customer/list/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerRef = firebase_1.db
            .collection("customers")
            .doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const customerData = customerSnap.data();
        const orderSnap = await firebase_1.db
            .collection("orders")
            .where("customer_id", "==", customerRef)
            .orderBy("order_datetime", "desc")
            .get();
        if (orderSnap.empty) {
            return res.status(200).json({
                ok: true,
                data: [],
            });
        }
        const addressIds = [
            ...new Set(orderSnap.docs
                .map((doc) => {
                const data = doc.data();
                return data.address_id?.id;
            })
                .filter((id) => Boolean(id))),
        ];
        const addressRefs = addressIds.map((id) => firebase_1.db.collection("customer_addresses").doc(id));
        const addressSnaps = addressRefs.length > 0
            ? await firebase_1.db.getAll(...addressRefs)
            : [];
        const addressMap = new Map();
        addressSnaps.forEach((addressSnap) => {
            if (addressSnap.exists) {
                addressMap.set(addressSnap.id, addressSnap.data());
            }
        });
        const reviewRefs = orderSnap.docs.map((doc) => firebase_1.db.collection("reviews").doc(doc.id));
        const reviewSnaps = reviewRefs.length > 0
            ? await firebase_1.db.getAll(...reviewRefs)
            : [];
        const reviewMap = new Map();
        reviewSnaps.forEach((reviewSnap) => {
            if (reviewSnap.exists) {
                reviewMap.set(reviewSnap.id, reviewSnap.data());
            }
        });
        const data = orderSnap.docs.map((doc) => {
            const order = doc.data();
            const addressId = order.address_id?.id ?? null;
            const addressData = addressId
                ? addressMap.get(addressId) ?? null
                : null;
            const reviewData = reviewMap.get(doc.id) ?? null;
            return {
                order_id: doc.id,
                customer_id: order.customer_id?.id ?? null,
                store_id: order.store_id?.id ?? null,
                address_id: addressId,
                rider_pickup_id: order.rider_pickup_id?.id ?? null,
                rider_delivery_id: order.rider_delivery_id?.id ?? null,
                staff_id: order.staff_id?.id ?? null,
                machine_washer_id: order.machine_washer_id?.id ?? null,
                machine_dryer_id: order.machine_dryer_id?.id ?? null,
                service_type: order.service_type,
                wash_dry_eight: order.wash_dry_weight ?? 0,
                service_price: order.service_price ?? 0,
                delivery_price: order.delivery_price ?? 0,
                detergent_price: order.detergent_price ?? 0,
                total_amount: (order.service_price ?? 0) +
                    (order.delivery_price ?? 0) +
                    (order.detergent_price ?? 0),
                detergent_option: order.detergent_option ?? null,
                before_wash_image: order.before_wash_image ?? "",
                after_wash_image: order.after_wash_image ?? "",
                note: order.note ?? null,
                status: order.status,
                order_datetime: order.order_datetime
                    ? {
                        _seconds: order.order_datetime.seconds,
                    }
                    : null,
                customer_fullname: customerData.fullname ?? "-",
                customer_phone: customerData.phone ?? "-",
                address_full: addressData?.address_text ?? "-",
                is_reviewed: reviewData !== null,
            };
        });
        return res.status(200).json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("Error fetching customer order list:", error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.get("/customer/completed/:id", async (req, res) => {
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
        const storeRef = firebase_1.db
            .collection("stores")
            .doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const reviewsSnap = await firebase_1.db
            .collection("reviews")
            .where("store_id", "==", storeRef)
            .orderBy("reviewed_at", "desc")
            .get();
        if (reviewsSnap.empty) {
            return res.status(200).json({
                ok: true,
                data: {
                    avg_rating: 0,
                    review_count: 0,
                    reviews: [],
                },
            });
        }
        const customerIds = [
            ...new Set(reviewsSnap.docs
                .map((doc) => doc.data().customer_id?.id)
                .filter((id) => Boolean(id))),
        ];
        const customerRefs = customerIds.map((id) => firebase_1.db.collection("customers").doc(id));
        const customerSnaps = customerRefs.length > 0
            ? await firebase_1.db.getAll(...customerRefs)
            : [];
        const customerMap = new Map();
        customerSnaps.forEach((customerSnap) => {
            if (customerSnap.exists) {
                customerMap.set(customerSnap.id, customerSnap.data());
            }
        });
        let ratingSum = 0;
        const reviews = reviewsSnap.docs.map((doc) => {
            const review = doc.data();
            const customerId = review.customer_id?.id ?? null;
            const customerData = customerId
                ? customerMap.get(customerId) ?? null
                : null;
            const rating = typeof review.rating === "number"
                ? review.rating
                : 0;
            ratingSum += rating;
            return {
                review_id: doc.id,
                rating,
                comment: review.comment ?? null,
                reviewed_at: review.reviewed_at
                    ? new Date(review.reviewed_at.seconds * 1000).toISOString()
                    : null,
                reviewer_name: customerData?.fullname ??
                    "ผู้ใช้ไม่ระบุชื่อ",
                reviewer_image: customerData?.profile_image ?? "",
            };
        });
        const reviewCount = reviewsSnap.size;
        const avgRating = reviewCount > 0
            ? ratingSum / reviewCount
            : 0;
        return res.status(200).json({
            ok: true,
            data: {
                avg_rating: Number(avgRating.toFixed(2)),
                review_count: reviewCount,
                reviews,
            },
        });
    }
    catch (error) {
        console.error("GET /store/:id/reviews error:", error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.get("/store/process/list/:id", async (req, res) => {
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
exports.router.get("/store/history/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const { day, month, year, status } = req.query;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        // =========================
        // Status filter
        // =========================
        const allowedStatuses = ["completed", "cancelled"];
        const statusFilter = status && allowedStatuses.includes(status)
            ? [status]
            : allowedStatuses;
        let query = firebase_1.db
            .collection("orders")
            .where("store_id", "==", storeRef)
            .where("status", "in", statusFilter);
        // =========================
        // Filter วัน เดือน ปี
        // =========================
        if (day || month || year) {
            if (!day || !month || !year) {
                return res.status(400).json({
                    ok: false,
                    message: "กรุณาระบุ day, month และ year ให้ครบ",
                });
            }
            const dayNumber = Number(day);
            const monthNumber = Number(month);
            const yearNumber = Number(year);
            if (!Number.isInteger(dayNumber) ||
                !Number.isInteger(monthNumber) ||
                !Number.isInteger(yearNumber) ||
                dayNumber < 1 ||
                dayNumber > 31 ||
                monthNumber < 1 ||
                monthNumber > 12) {
                return res.status(400).json({
                    ok: false,
                    message: "วัน เดือน หรือ ปี ไม่ถูกต้อง",
                });
            }
            const dateString = `${yearNumber}-` +
                `${String(monthNumber).padStart(2, "0")}-` +
                `${String(dayNumber).padStart(2, "0")}`;
            const selectedDate = dayjs_1.default.tz(`${dateString} 00:00:00`, "YYYY-MM-DD HH:mm:ss", TZ);
            // เช็กวันที่ เช่น 31/02
            if (!selectedDate.isValid() ||
                selectedDate.format("YYYY-MM-DD") !== dateString) {
                return res.status(400).json({
                    ok: false,
                    message: "วันที่ไม่ถูกต้อง",
                });
            }
            const startDate = selectedDate.startOf("day");
            // ใช้วันถัดไป 00:00 แล้ว query <
            // จะปลอดภัยกว่า endOf("day")
            const endDate = startDate.add(1, "day");
            query = query
                .where("order_datetime", ">=", firestore_1.Timestamp.fromDate(startDate.toDate()))
                .where("order_datetime", "<", firestore_1.Timestamp.fromDate(endDate.toDate()));
        }
        query = query.orderBy("order_datetime", "desc");
        const snap = await query.get();
        if (snap.empty) {
            return res.json({
                ok: true,
                data: [],
            });
        }
        // =========================
        // Customer IDs
        // =========================
        const customerIds = [
            ...new Set(snap.docs
                .map((doc) => doc.data().customer_id?.id)
                .filter(Boolean)),
        ];
        // =========================
        // Address IDs
        // =========================
        const addressIds = [
            ...new Set(snap.docs
                .map((doc) => doc.data().address_id?.id)
                .filter(Boolean)),
        ];
        // =========================
        // Customers
        // =========================
        const customerMap = new Map();
        if (customerIds.length > 0) {
            const customerSnaps = await Promise.all(customerIds.map((id) => firebase_1.db.collection("customers").doc(id).get()));
            customerSnaps.forEach((s) => {
                if (s.exists) {
                    customerMap.set(s.id, s.data());
                }
            });
        }
        // =========================
        // Addresses
        // =========================
        const addressMap = new Map();
        if (addressIds.length > 0) {
            const addressSnaps = await Promise.all(addressIds.map((id) => firebase_1.db.collection("customer_addresses").doc(id).get()));
            addressSnaps.forEach((s) => {
                if (s.exists) {
                    addressMap.set(s.id, s.data());
                }
            });
        }
        // =========================
        // Response data
        // =========================
        const data = snap.docs.map((doc) => {
            const d = doc.data();
            const customerId = d.customer_id?.id ?? null;
            const addressId = d.address_id?.id ?? null;
            const customerData = customerId
                ? customerMap.get(customerId) ?? null
                : null;
            const addressData = addressId
                ? addressMap.get(addressId) ?? null
                : null;
            return {
                order_id: doc.id,
                customer_id: customerId,
                store_id: d.store_id?.id ?? null,
                address_id: addressId,
                rider_pickup_id: d.rider_pickup_id?.id ?? null,
                rider_delivery_id: d.rider_delivery_id?.id ?? null,
                staff_id: d.staff_id?.id ?? null,
                service_type: d.service_type ?? null,
                wash_dry_weight: d.wash_dry_weight ?? 0,
                service_price: d.service_price ?? 0,
                delivery_price: d.delivery_price ?? 0,
                detergent_price: d.detergent_price ?? 0,
                total_amount: (d.service_price ?? 0) +
                    (d.delivery_price ?? 0) +
                    (d.detergent_price ?? 0),
                detergent_option: d.detergent_option ?? null,
                before_wash_image: d.before_wash_image ?? "",
                after_wash_image: d.after_wash_image ?? "",
                note: d.note ?? null,
                machine_washer_id: d.machine_washer_id?.id ?? null,
                machine_dryer_id: d.machine_dryer_id?.id ?? null,
                status: d.status ?? "waiting_pickup",
                order_datetime: d.order_datetime
                    ? {
                        _seconds: d.order_datetime.seconds,
                    }
                    : null,
                customer_fullname: customerData?.fullname ?? "-",
                customer_phone: customerData?.phone ?? "-",
                address_full: addressData?.address_text ?? "-",
            };
        });
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("store history error:", error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.get("/store/completed/detail/:id", async (req, res) => {
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
