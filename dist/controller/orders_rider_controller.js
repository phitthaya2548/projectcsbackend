"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const upload_1 = require("../middlewares/upload");
const haversine_1 = require("../services/haversine");
const notification_1 = require("../services/notification");
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
        const storeRef = orderSnap.data()?.store_id;
        if (!storeRef) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
        }
        const orderData = orderSnap.data();
        const total_amount = orderData?.service_price + orderData?.delivery_price + (orderData?.detergent_price ?? 0);
        const updateData = {
            status,
            order_datetime: firebase_1.FieldValue.serverTimestamp(),
        };
        const updateStoreData = {
            wallet_balance: firebase_1.FieldValue.increment(total_amount),
        };
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
        if (status === "pickup_completed") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            if (!orderData?.rider_pickup_id) {
                updateData.rider_pickup_id = firebase_1.db.collection("riders").doc(rider_id);
            }
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ไรเดอร์รับผ้าเรียบร้อยแล้ว", "ไรเดอร์รับผ้าของคุณเรียบร้อยแล้ว กำลังนำไปส่งที่ร้านซัก/อบ", {
                order_id: order_id,
                status: status
            });
        }
        if (status === "arrived_at_shop") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            if (!orderData?.rider_pickup_id) {
                updateData.rider_pickup_id = firebase_1.db.collection("riders").doc(rider_id);
            }
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ไรเดอร์ถึงร้านแล้ว", "ไรเดอร์กำลังส่งผ้าของคุณเข้าร้านซัก/อบ", {
                order_id: order_id,
                status: status
            });
        }
        if (status === "waiting_wash" || status === "waiting_dry") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_pickup_id = firebase_1.db.collection("riders").doc(rider_id);
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ผ้าของคุณเข้าคิวซัก/อบแล้ว", "ผ้าของคุณเข้าคิวซัก/อบเรียบร้อยแล้ว", {
                order_id: order_id,
                status: status
            });
        }
        if (status === "delivery_heading_to_shop") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_delivery_id = firebase_1.db.collection("riders").doc(rider_id);
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ไรเดอร์กำลังไปรับผ้าของคุณที่ร้าน", "ไรเดอร์กำลังไปรับผ้าของคุณที่ร้านซัก/อบ", {
                order_id: order_id,
                status: status
            });
        }
        if (status === "delivery_pickup_completed") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_delivery_id = firebase_1.db.collection("riders").doc(rider_id);
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ไรเดอร์รับผ้าของคุณเรียบร้อยแล้ว", "ไรเดอร์รับผ้าของคุณเรียบร้อยแล้ว กำลังนำไปส่งที่บ้านของคุณ", {
                order_id: order_id,
                status: status
            });
        }
        if (status === "delivery_in_progress") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_delivery_id = firebase_1.db.collection("riders").doc(rider_id);
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ไรเดอร์กำลังนำผ้าของคุณไปส่ง", "ไรเดอร์กำลังนำผ้าของคุณไปส่งที่บ้านของคุณ", {
                order_id: order_id,
                status: status
            });
        }
        if (status === "completed") {
            if (!rider_id) {
                return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
            }
            updateData.rider_delivery_id = firebase_1.db.collection("riders").doc(rider_id);
            await notification_1.NotificationService.sendToUser(orderData.customer_id?.id ?? "", "customer", "ส่งผ้าเรียบร้อยแล้ว", "ไรเดอร์ส่งผ้าของคุณเรียบร้อยแล้ว", {
                order_id: order_id,
                status: status
            });
        }
        await orderRef.update(updateData);
        await storeRef.update(updateStoreData);
        return res.json({ ok: true, message: "อัปเดตสถานะสำเร็จ", data: updateData });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.get("/:id", async (req, res) => {
    try {
        const rider_id = req.params.id;
        const riderLat = parseFloat(req.query.lat);
        const riderLng = parseFloat(req.query.lng);
        const hasRiderLocation = !isNaN(riderLat) && !isNaN(riderLng);
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const activeStatuses = [
            "pickup_in_progress",
            "pickup_completed",
            "delivery_in_progress",
            "store_pickup_in_progress",
            "arrived_at_shop",
            "delivery_pickup_completed",
            "delivery_heading_to_shop",
        ];
        const [pickupOrdersSnap, deliveryOrdersSnap] = await Promise.all([
            firebase_1.db.collection("orders")
                .where("rider_pickup_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
            firebase_1.db.collection("orders")
                .where("rider_delivery_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
        ]);
        const orderDocs = [];
        for (const doc of pickupOrdersSnap.docs) {
            orderDocs.push(doc);
        }
        for (const doc of deliveryOrdersSnap.docs) {
            let alreadyExists = false;
            for (const savedDoc of orderDocs) {
                if (savedDoc.id === doc.id) {
                    alreadyExists = true;
                    break;
                }
            }
            if (!alreadyExists) {
                orderDocs.push(doc);
            }
        }
        if (orderDocs.length === 0) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบออเดอร์ของไรเดอร์คนนี้",
            });
        }
        const orders = await Promise.all(orderDocs.map(async (orderDoc) => {
            const orderData = orderDoc.data();
            const addressRef = orderData.address_id ?? null;
            const customerRef = orderData.customer_id ?? null;
            const [addressSnap, customerSnap] = await Promise.all([
                addressRef ? addressRef.get() : null,
                customerRef ? customerRef.get() : null,
            ]);
            let addressText = null;
            let addressLat = null;
            let addressLng = null;
            if (addressSnap && addressSnap.exists) {
                const addressData = addressSnap.data();
                addressText = addressData?.address_text ?? null;
                addressLat = addressData?.latitude ?? null;
                addressLng = addressData?.longitude ?? null;
            }
            let customer = null;
            if (customerSnap && customerSnap.exists) {
                const customerData = customerSnap.data();
                customer = {
                    id: customerSnap.id,
                    name: customerData?.fullname ?? null,
                    phone: customerData?.phone ?? null,
                    profile_image: customerData?.profile_image ?? null,
                };
            }
            let distanceKm = 0;
            if (hasRiderLocation && addressLat !== null && addressLng !== null) {
                const distance = haversine_1.DistanceService.haversineKm(riderLat, riderLng, addressLat, addressLng);
                distanceKm = Number(distance.toFixed(1));
            }
            let orderDatetime = null;
            if (orderData.order_datetime) {
                orderDatetime = {
                    _seconds: orderData.order_datetime.seconds,
                };
            }
            return {
                id: orderDoc.id,
                order_number: orderData.order_number ?? null,
                status: orderData.status ?? null,
                service_type: orderData.service_type ?? null,
                distance_km: distanceKm,
                time_slot: orderData.time_slot ?? null,
                note: orderData.note ?? null,
                before_wash_image: orderData.before_wash_image ?? null,
                after_wash_image: orderData.after_wash_image ?? null,
                rider_pickup_id: orderData.rider_pickup_id
                    ? orderData.rider_pickup_id.id
                    : null,
                rider_delivery_id: orderData.rider_delivery_id
                    ? orderData.rider_delivery_id.id
                    : null,
                address_lat: addressLat,
                address_lng: addressLng,
                order_datetime: orderDatetime,
                address: addressText,
                customer: customer,
            };
        }));
        return res.json({
            ok: true,
            data: orders,
        });
    }
    catch (error) {
        console.error("get rider orders error:", error);
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/detail/:id", async (req, res) => {
    try {
        const order_id = req.params.id;
        const orderSnap = await firebase_1.db.collection("orders").doc(order_id).get();
        if (!orderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบคำสั่งซื้อ",
            });
        }
        const orderData = orderSnap.data();
        const customerRef = orderData.customer_id ?? null;
        const addressRef = orderData.address_id ?? null;
        const staffRef = orderData.staff_id ?? null;
        const riderPickupRef = orderData.rider_pickup_id ?? null;
        const riderDeliveryRef = orderData.rider_delivery_id ?? null;
        const [customerSnap, addressSnap, staffSnap, riderPickupSnap, riderDeliverySnap,] = await Promise.all([
            customerRef ? customerRef.get() : Promise.resolve(null),
            addressRef ? addressRef.get() : Promise.resolve(null),
            staffRef ? staffRef.get() : Promise.resolve(null),
            riderPickupRef ? riderPickupRef.get() : Promise.resolve(null),
            riderDeliveryRef ? riderDeliveryRef.get() : Promise.resolve(null),
        ]);
        let customer = null;
        if (customerSnap && customerSnap.exists) {
            const customerData = customerSnap.data();
            customer = {
                customer_id: customerSnap.id,
                username: customerData.username,
                fullname: customerData.fullname,
                profile_image: customerData.profile_image,
                phone: customerData.phone,
            };
        }
        let address = null;
        if (addressSnap && addressSnap.exists) {
            const addressData = addressSnap.data();
            address = {
                address_text: addressData.address_text,
                latitude: addressData.latitude,
                longitude: addressData.longitude,
            };
        }
        let staff = null;
        if (staffSnap && staffSnap.exists) {
            const staffData = staffSnap.data();
            staff = {
                fullname: staffData.fullname,
                phone: staffData.phone,
                profile_image: staffData.profile_image,
            };
        }
        let rider_pickup = null;
        if (riderPickupSnap && riderPickupSnap.exists) {
            const riderPickupData = riderPickupSnap.data();
            rider_pickup = {
                fullname: riderPickupData.fullname,
                phone: riderPickupData.phone,
                vehicle_type: riderPickupData.vehicle_type,
                license_plate: riderPickupData.license_plate,
                profile_image: riderPickupData.profile_image,
            };
        }
        let rider_delivery = null;
        if (riderDeliverySnap && riderDeliverySnap.exists) {
            const riderDeliveryData = riderDeliverySnap.data();
            rider_delivery = {
                fullname: riderDeliveryData.fullname,
                phone: riderDeliveryData.phone,
                vehicle_type: riderDeliveryData.vehicle_type,
                license_plate: riderDeliveryData.license_plate,
                profile_image: riderDeliveryData.profile_image,
            };
        }
        return res.json({
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
                service_type: orderData.service_type,
                wash_dry_weight: orderData.wash_dry_weight,
                service_price: orderData.service_price,
                delivery_price: orderData.delivery_price,
                detergent_option: orderData.detergent_option,
                before_wash_image: orderData.before_wash_image,
                after_wash_image: orderData.after_wash_image,
                note: orderData.note,
                status: orderData.status,
                order_datetime: orderData.order_datetime,
                customer: customer,
                address: address,
                staff: staff,
                rider_pickup: rider_pickup,
                rider_delivery: rider_delivery,
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
exports.router.post("/accept/:id", async (req, res) => {
    try {
        const order_id = req.params.id;
        const { rider_id } = req.body;
        if (!rider_id) {
            return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
        }
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const max_order = 3;
        const [pickupSnap, deliverySnap] = await Promise.all([
            firebase_1.db.collection("orders")
                .where("rider_pickup_id", "==", riderRef)
                .where("status", "==", "pickup_in_progress")
                .get(),
            firebase_1.db.collection("orders")
                .where("rider_delivery_id", "==", riderRef)
                .where("status", "==", "delivery_heading_to_shop")
                .get(),
        ]);
        const totalActive = pickupSnap.size + deliverySnap.size;
        if (totalActive >= max_order) {
            return res.status(400).json({
                ok: false,
                message: `คุณรับงานครบ ${max_order} งานแล้ว กรุณาจบงานก่อนรับงานใหม่`,
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(order_id);
        await firebase_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(orderRef);
            if (!snap.exists)
                throw new Error("ไม่พบออเดอร์นี้");
            const status = snap.data()?.status;
            if (status === "waiting_pickup") {
                if (snap.data()?.rider_pickup_id)
                    throw new Error("งานนี้ถูกรับไปแล้ว");
                tx.update(orderRef, {
                    rider_pickup_id: riderRef,
                    status: "pickup_in_progress",
                    order_datetime: firebase_1.FieldValue.serverTimestamp(),
                });
            }
            else if (status === "waiting_delivery") {
                if (snap.data()?.rider_delivery_id)
                    throw new Error("งานนี้ถูกรับไปแล้ว");
                tx.update(orderRef, {
                    rider_delivery_id: riderRef,
                    status: "delivery_heading_to_shop",
                    order_datetime: firebase_1.FieldValue.serverTimestamp(),
                });
            }
            else {
                throw new Error("สถานะงานไม่รองรับการรับงาน");
            }
        });
        const orderSnap = await orderRef.get();
        const orderData = orderSnap.data();
        if (orderData?.customer_id && orderData?.status == "pickup_in_progress") {
            if (orderData?.customer_id) {
                await notification_1.NotificationService.sendToUser(orderData.customer_id.id, "customer", "ไรเดอร์รับงานแล้ว", "ไรเดอร์กำลังไปรับผ้าของคุณ", {
                    order_id: order_id,
                    status: orderData.status
                });
            }
        }
        else if (orderData?.customer_id && orderData?.status == "delivery_heading_to_shop") {
            if (orderData?.customer_id) {
                await notification_1.NotificationService.sendToUser(orderData.customer_id.id, "customer", "ไรเดอร์รับงานแล้ว", "ไรเดอร์กำลังไปรับผ้าของคุณ", {
                    order_id: order_id,
                    status: orderData.status
                });
            }
        }
        return res.json({
            ok: true,
            message: `รับงานสำเร็จ! (งานที่ ${totalActive + 1}/${max_order})`,
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
