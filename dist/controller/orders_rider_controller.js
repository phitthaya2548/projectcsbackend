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
    let uploadedFilePath = null;
    let transactionCommitted = false;
    try {
        const order_id = req.params.id;
        const { status, rider_id } = req.body;
        if (!status) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุสถานะ",
            });
        }
        const allowedStatuses = new Set([
            "pickup_completed",
            "arrived_at_shop",
            "waiting_wash",
            "waiting_dry",
            "delivery_heading_to_shop",
            "delivery_pickup_completed",
            "delivery_in_progress",
            "completed",
        ]);
        if (!allowedStatuses.has(status)) {
            return res.status(400).json({
                ok: false,
                message: "สถานะไม่ถูกต้อง",
            });
        }
        if (!rider_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ rider_id",
            });
        }
        const orderRef = firebase_1.db.collection("orders").doc(order_id);
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const [orderSnap, riderSnap] = await Promise.all([
            orderRef.get(),
            riderRef.get(),
        ]);
        if (!orderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบออเดอร์",
            });
        }
        if (!riderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบไรเดอร์",
            });
        }
        const orderData = orderSnap.data();
        if (!orderData.store_id) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        if (orderData.status === status) {
            return res.status(200).json({
                ok: true,
                message: "ออเดอร์อยู่ในสถานะนี้แล้ว",
                data: {
                    order_id,
                    status,
                },
            });
        }
        const imageStatuses = new Set([
            "pickup_completed",
            "completed",
        ]);
        if (req.file && !imageStatuses.has(status)) {
            return res.status(400).json({
                ok: false,
                message: "สถานะนี้ไม่รองรับการอัปโหลดรูปภาพ",
            });
        }
        let publicUrl = null;
        if (req.file) {
            const safeOriginalName = req.file.originalname.replace(/[^\w.\-]/g, "_");
            const fileName = `orders/${order_id}/${Date.now()}_${safeOriginalName}`;
            uploadedFilePath = fileName;
            const file = firebase_1.bucket.file(fileName);
            await file.save(req.file.buffer, {
                metadata: {
                    contentType: req.file.mimetype,
                },
            });
            await file.makePublic();
            publicUrl =
                `https://storage.googleapis.com/${firebase_1.bucket.name}/${fileName}`;
        }
        let didUpdate = false;
        let customerId = null;
        await firebase_1.db.runTransaction(async (tx) => {
            didUpdate = false;
            const freshOrderSnap = await tx.get(orderRef);
            if (!freshOrderSnap.exists) {
                throw new Error("ORDER_NOT_FOUND");
            }
            const freshOrderData = freshOrderSnap.data();
            if (freshOrderData.status === status) {
                return;
            }
            if (!freshOrderData.store_id) {
                throw new Error("STORE_NOT_FOUND");
            }
            const updateData = {
                status: status,
                order_datetime: firebase_1.FieldValue.serverTimestamp(),
            };
            if (status === "pickup_completed") {
                if (!freshOrderData.rider_pickup_id) {
                    updateData.rider_pickup_id = riderRef;
                }
                if (publicUrl) {
                    updateData.before_wash_image = publicUrl;
                }
            }
            if (status === "arrived_at_shop") {
                if (!freshOrderData.rider_pickup_id) {
                    updateData.rider_pickup_id = riderRef;
                }
            }
            if (status === "waiting_wash" ||
                status === "waiting_dry") {
                updateData.rider_pickup_id = riderRef;
            }
            if (status === "delivery_heading_to_shop") {
                updateData.rider_delivery_id = riderRef;
            }
            if (status === "delivery_pickup_completed") {
                updateData.rider_delivery_id = riderRef;
            }
            if (status === "delivery_in_progress") {
                updateData.rider_delivery_id = riderRef;
            }
            if (status === "completed") {
                updateData.rider_delivery_id = riderRef;
                if (publicUrl) {
                    updateData.after_wash_image = publicUrl;
                }
            }
            tx.update(orderRef, updateData);
            customerId =
                freshOrderData.customer_id?.id ?? null;
            didUpdate = true;
        });
        transactionCommitted = true;
        if (!didUpdate) {
            if (uploadedFilePath) {
                try {
                    await firebase_1.bucket
                        .file(uploadedFilePath)
                        .delete();
                }
                catch (error) {
                    console.error("delete unused image error:", error);
                }
            }
            return res.status(200).json({
                ok: true,
                message: "ออเดอร์อยู่ในสถานะนี้แล้ว",
                data: {
                    order_id,
                    status,
                },
            });
        }
        const notificationMap = {
            pickup_completed: {
                title: "ไรเดอร์รับผ้าเรียบร้อยแล้ว",
                body: "ไรเดอร์รับผ้าของคุณเรียบร้อยแล้ว กำลังนำไปส่งที่ร้าน",
            },
            arrived_at_shop: {
                title: "ไรเดอร์ถึงร้านแล้ว",
                body: "ไรเดอร์กำลังเอาผ้าของคุณเข้าร้าน",
            },
            waiting_wash: {
                title: "ผ้าของคุณกำลังรอการคำนวณราคา",
                body: "ผ้าของคุณกำลังรอการคำนวณราคา",
            },
            delivery_heading_to_shop: {
                title: "ไรเดอร์กำลังไปรับผ้าของคุณที่ร้าน",
                body: "",
            },
            delivery_pickup_completed: {
                title: "ไรเดอร์รับผ้าของคุณเรียบร้อยแล้ว",
                body: "ไรเดอร์รับผ้าของคุณเรียบร้อยแล้ว กำลังนำไปส่งที่บ้านของคุณ",
            },
            delivery_in_progress: {
                title: "ไรเดอร์กำลังนำผ้าของคุณไปส่ง",
                body: "ไรเดอร์กำลังนำผ้าของคุณไปส่งที่อยู่ของคุณ",
            },
            completed: {
                title: "ส่งผ้าเรียบร้อยแล้ว",
                body: "ไรเดอร์ส่งผ้าของคุณเรียบร้อยแล้ว",
            },
        };
        const notification = notificationMap[status];
        if (customerId && notification) {
            try {
                await notification_1.NotificationService.sendToUser(customerId, "customer", notification.title, notification.body, order_id);
            }
            catch (error) {
                console.error("send notification error:", error);
            }
        }
        return res.status(200).json({
            ok: true,
            message: "อัปเดตสถานะสำเร็จ",
            data: {
                order_id,
                status,
                before_wash_image: status === "pickup_completed"
                    ? publicUrl
                    : undefined,
                after_wash_image: status === "completed"
                    ? publicUrl
                    : undefined,
            },
        });
    }
    catch (error) {
        console.error("update order status error:", error);
        if (uploadedFilePath &&
            !transactionCommitted) {
            try {
                await firebase_1.bucket
                    .file(uploadedFilePath)
                    .delete();
            }
            catch (deleteError) {
                console.error("cleanup image error:", deleteError);
            }
        }
        if (error?.message === "ORDER_NOT_FOUND") {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบออเดอร์",
            });
        }
        if (error?.message === "STORE_NOT_FOUND") {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        if (error?.message ===
            "INVALID_TOTAL_AMOUNT") {
            return res.status(500).json({
                ok: false,
                message: "ยอดเงินออเดอร์ไม่ถูกต้อง",
            });
        }
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/:id", async (req, res) => {
    try {
        const rider_id = String(req.params.id || "").trim();
        if (!rider_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ rider_id",
            });
        }
        const riderLat = parseFloat(req.query.lat);
        const riderLng = parseFloat(req.query.lng);
        const hasRiderLocation = !isNaN(riderLat) &&
            !isNaN(riderLng);
        const riderRef = firebase_1.db
            .collection("riders")
            .doc(rider_id);
        const riderSnap = await riderRef.get();
        if (!riderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบไรเดอร์",
            });
        }
        const activeStatuses = [
            "pickup_in_progress",
            "pickup_completed",
            "delivery_in_progress",
            "store_pickup_in_progress",
            "arrived_at_shop",
            "delivery_pickup_completed",
            "delivery_heading_to_shop",
        ];
        const [pickupOrdersSnap, deliveryOrdersSnap,] = await Promise.all([
            firebase_1.db
                .collection("orders")
                .where("rider_pickup_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
            firebase_1.db
                .collection("orders")
                .where("rider_delivery_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
        ]);
        const orderMap = new Map();
        for (const doc of pickupOrdersSnap.docs) {
            orderMap.set(doc.id, doc);
        }
        for (const doc of deliveryOrdersSnap.docs) {
            orderMap.set(doc.id, doc);
        }
        const orderDocs = Array.from(orderMap.values());
        if (orderDocs.length === 0) {
            return res.status(200).json({
                ok: true,
                data: [],
            });
        }
        const orders = await Promise.all(orderDocs.map(async (orderDoc) => {
            const orderData = orderDoc.data();
            const addressRef = orderData.address_id ?? null;
            const customerRef = orderData.customer_id ?? null;
            const [addressSnap, customerSnap,] = await Promise.all([
                addressRef
                    ? addressRef.get()
                    : Promise.resolve(null),
                customerRef
                    ? customerRef.get()
                    : Promise.resolve(null),
            ]);
            let addressText = null;
            let addressLat = null;
            let addressLng = null;
            if (addressSnap &&
                addressSnap.exists) {
                const addressData = addressSnap.data();
                addressText =
                    addressData?.address_text ?? null;
                addressLat =
                    addressData?.latitude ?? null;
                addressLng =
                    addressData?.longitude ?? null;
            }
            let customer = null;
            if (customerSnap &&
                customerSnap.exists) {
                const customerData = customerSnap.data();
                customer = {
                    id: customerSnap.id,
                    name: customerData?.fullname ??
                        null,
                    phone: customerData?.phone ??
                        null,
                    profile_image: customerData?.profile_image ??
                        null,
                };
            }
            let distanceKm = null;
            if (hasRiderLocation &&
                addressLat !== null &&
                addressLng !== null) {
                const distance = haversine_1.DistanceService.haversineKm(riderLat, riderLng, Number(addressLat), Number(addressLng));
                if (Number.isFinite(distance)) {
                    distanceKm =
                        Number(distance.toFixed(1));
                }
            }
            let orderDatetime = null;
            if (orderData.order_datetime) {
                orderDatetime =
                    orderData.order_datetime
                        .toDate()
                        .toISOString();
            }
            return {
                id: orderDoc.id,
                order_number: orderData.order_id ??
                    null,
                status: orderData.status ??
                    null,
                service_type: orderData.service_type ??
                    null,
                distance_km: distanceKm,
                note: orderData.note ??
                    null,
                before_wash_image: orderData.before_wash_image ??
                    null,
                after_wash_image: orderData.after_wash_image ??
                    null,
                rider_pickup_id: orderData
                    .rider_pickup_id
                    ?.id ??
                    null,
                rider_delivery_id: orderData
                    .rider_delivery_id
                    ?.id ??
                    null,
                address_lat: addressLat,
                address_lng: addressLng,
                order_datetime: orderDatetime,
                address: addressText,
                customer: customer,
            };
        }));
        return res.status(200).json({
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
        const order_id = String(req.params.id || "").trim();
        if (!order_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ order_id",
            });
        }
        const orderRef = firebase_1.db
            .collection("orders")
            .doc(order_id);
        const orderSnap = await orderRef.get();
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
            customerRef
                ? customerRef.get()
                : Promise.resolve(null),
            addressRef
                ? addressRef.get()
                : Promise.resolve(null),
            staffRef
                ? staffRef.get()
                : Promise.resolve(null),
            riderPickupRef
                ? riderPickupRef.get()
                : Promise.resolve(null),
            riderDeliveryRef
                ? riderDeliveryRef.get()
                : Promise.resolve(null),
        ]);
        let customer = null;
        if (customerSnap &&
            customerSnap.exists) {
            const customerData = customerSnap.data();
            customer = {
                customer_id: customerSnap.id,
                username: customerData.username ?? null,
                fullname: customerData.fullname ?? null,
                profile_image: customerData.profile_image ?? null,
                phone: customerData.phone ?? null,
            };
        }
        let address = null;
        if (addressSnap &&
            addressSnap.exists) {
            const addressData = addressSnap.data();
            address = {
                address_text: addressData.address_text ?? null,
                latitude: addressData.latitude ?? null,
                longitude: addressData.longitude ?? null,
            };
        }
        let staff = null;
        if (staffSnap &&
            staffSnap.exists) {
            const staffData = staffSnap.data();
            staff = {
                fullname: staffData.fullname ?? null,
                phone: staffData.phone ?? null,
                profile_image: staffData.profile_image ?? null,
            };
        }
        let rider_pickup = null;
        if (riderPickupSnap &&
            riderPickupSnap.exists) {
            const riderPickupData = riderPickupSnap.data();
            rider_pickup = {
                fullname: riderPickupData.fullname ?? null,
                phone: riderPickupData.phone ?? null,
                vehicle_type: riderPickupData.vehicle_type ?? null,
                license_plate: riderPickupData.license_plate ?? null,
                profile_image: riderPickupData.profile_image ?? null,
            };
        }
        let rider_delivery = null;
        if (riderDeliverySnap &&
            riderDeliverySnap.exists) {
            const riderDeliveryData = riderDeliverySnap.data();
            rider_delivery = {
                fullname: riderDeliveryData.fullname ?? null,
                phone: riderDeliveryData.phone ?? null,
                vehicle_type: riderDeliveryData.vehicle_type ?? null,
                license_plate: riderDeliveryData.license_plate ?? null,
                profile_image: riderDeliveryData.profile_image ?? null,
            };
        }
        let orderDatetime = null;
        if (orderData.order_datetime) {
            orderDatetime =
                orderData.order_datetime
                    .toDate()
                    .toISOString();
        }
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
        const order_id = String(req.params.id || "").trim();
        const rider_id = String(req.body.rider_id || "").trim();
        if (!order_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ order_id",
            });
        }
        if (!rider_id) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ rider_id",
            });
        }
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const orderRef = firebase_1.db.collection("orders").doc(order_id);
        const max_order = 3;
        const activeStatuses = [
            "pickup_in_progress",
            "pickup_completed",
            "arrived_at_shop",
            "store_pickup_in_progress",
            "delivery_heading_to_shop",
            "delivery_pickup_completed",
            "delivery_in_progress",
        ];
        const [riderSnap, pickupSnap, deliverySnap,] = await Promise.all([
            riderRef.get(),
            firebase_1.db.collection("orders")
                .where("rider_pickup_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
            firebase_1.db
                .collection("orders")
                .where("rider_delivery_id", "==", riderRef)
                .where("status", "in", activeStatuses)
                .get(),
        ]);
        if (!riderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบไรเดอร์",
            });
        }
        const activeOrderIds = new Set();
        for (const doc of pickupSnap.docs) {
            activeOrderIds.add(doc.id);
        }
        for (const doc of deliverySnap.docs) {
            activeOrderIds.add(doc.id);
        }
        const totalActive = activeOrderIds.size;
        if (totalActive >= max_order) {
            return res.status(400).json({
                ok: false,
                message: `คุณรับงานครบ ${max_order} งานแล้ว กรุณาจบงานก่อนรับงานใหม่`,
            });
        }
        let newStatus = "";
        let customerId = null;
        await firebase_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(orderRef);
            if (!snap.exists) {
                throw new Error("ORDER_NOT_FOUND");
            }
            const orderData = snap.data();
            const status = orderData.status;
            if (status === "waiting_pickup") {
                if (orderData.rider_pickup_id) {
                    throw new Error("ORDER_ALREADY_ACCEPTED");
                }
                newStatus =
                    "pickup_in_progress";
                tx.update(orderRef, {
                    rider_pickup_id: riderRef,
                    status: newStatus,
                    order_datetime: firebase_1.FieldValue.serverTimestamp(),
                });
            }
            else if (status === "waiting_delivery") {
                if (orderData.rider_delivery_id) {
                    throw new Error("ORDER_ALREADY_ACCEPTED");
                }
                newStatus =
                    "delivery_heading_to_shop";
                tx.update(orderRef, {
                    rider_delivery_id: riderRef,
                    status: newStatus,
                    order_datetime: firebase_1.FieldValue.serverTimestamp(),
                });
            }
            else {
                throw new Error("INVALID_ORDER_STATUS");
            }
            customerId =
                orderData.customer_id?.id ??
                    null;
        });
        if (customerId) {
            try {
                if (newStatus ===
                    "pickup_in_progress") {
                    await notification_1.NotificationService
                        .sendToUser(customerId, "customer", "ไรเดอร์รับงานแล้ว", "ไรเดอร์กำลังไปรับผ้าของคุณ", order_id);
                }
                else if (newStatus ===
                    "delivery_heading_to_shop") {
                    await notification_1.NotificationService
                        .sendToUser(customerId, "customer", "ไรเดอร์รับงานแล้ว", "ไรเดอร์กำลังไปรับผ้าของคุณที่ร้าน", order_id);
                }
            }
            catch (error) {
                console.error("send notification error:", error);
            }
        }
        return res.status(200).json({
            ok: true,
            message: `รับงานสำเร็จ! (งานที่ ${totalActive + 1}/${max_order})`,
            data: {
                order_id,
                rider_id,
                status: newStatus,
            },
        });
    }
    catch (error) {
        console.error("accept rider order error:", error);
        if (error?.message ===
            "ORDER_NOT_FOUND") {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบออเดอร์นี้",
            });
        }
        if (error?.message ===
            "ORDER_ALREADY_ACCEPTED") {
            return res.status(409).json({
                ok: false,
                message: "งานนี้ถูกรับไปแล้ว",
            });
        }
        if (error?.message ===
            "INVALID_ORDER_STATUS") {
            return res.status(400).json({
                ok: false,
                message: "สถานะงานไม่รองรับการรับงาน",
            });
        }
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
