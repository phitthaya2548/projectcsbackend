"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
exports.router = (0, express_1.Router)();
const isBlank = (v) => v == null || String(v).trim() === "";
exports.router.get("/stores/list", async (req, res) => {
    try {
<<<<<<< HEAD
        const search = typeof req.query.search === "string"
            ? req.query.search.trim().toLowerCase()
            : "";
        const storeSnap = await firebase_1.db
            .collection("stores")
            .where("is_hiring", "==", true)
            .get();
        if (storeSnap.empty) {
            return res.json({
                ok: true,
                total: 0,
                data: [],
            });
        }
        const filteredStores = storeSnap.docs.filter((doc) => {
            const store = doc.data();
            if (!search)
                return true;
            const storeName = String(store.store_name ?? "").toLowerCase();
            const address = String(store.address ?? "").toLowerCase();
            const phone = String(store.phone ?? "").toLowerCase();
            return (storeName.includes(search) ||
                address.includes(search) ||
                phone.includes(search));
        });
        const stores = await Promise.all(filteredStores.map(async (doc) => {
            const store = doc.data();
            const reviewSnap = await firebase_1.db
                .collection("reviews")
                .where("store_id", "==", doc.ref)
=======
        const searchTerm = typeof req.query.search === "string"
            ? req.query.search.trim().toLowerCase()
            : "";
        const snapStore = await firebase_1.db
            .collection("stores")
            .where("is_hiring", "==", true)
            .get();
        if (snapStore.empty) {
            return res.json({ ok: true, total: 0, data: [] });
        }
        const filteredDocs = searchTerm
            ? snapStore.docs.filter((doc) => {
                const data = doc.data();
                const storeName = String(data.store_name ?? "").toLowerCase();
                const address = String(data.address ?? "").toLowerCase();
                const phone = String(data.phone ?? "").toLowerCase();
                return (storeName.includes(searchTerm) ||
                    address.includes(searchTerm) ||
                    phone.includes(searchTerm));
            })
            : snapStore.docs;
        if (filteredDocs.length === 0) {
            return res.json({ ok: true, total: 0, data: [] });
        }
        const storeDocs = filteredDocs;
        const ratingResults = await Promise.all(storeDocs.map(async (doc) => {
            const reviewsQuery = firebase_1.db
                .collection("reviews")
                .where("store_id", "==", doc.ref);
            const aggSnap = await reviewsQuery
>>>>>>> origin/main
                .aggregate({
                total: firestore_1.AggregateField.count(),
                avg: firestore_1.AggregateField.average("rating"),
            })
                .get();
<<<<<<< HEAD
            const reviewData = reviewSnap.data();
            return {
                store_id: doc.id,
                store_name: store.store_name ?? "",
                phone: store.phone ?? "",
                email: store.email ?? "",
                facebook: store.facebook ?? "",
                line_id: store.line_id ?? "",
                address: store.address ?? "",
                latitude: Number(store.latitude ?? 0),
                longitude: Number(store.longitude ?? 0),
                service_radius: Number(store.service_radius ?? 0),
                opening_hours: store.opening_hours ?? "",
                closed_hours: store.closed_hours ?? "",
                delivery_min: Number(store.delivery_min ?? 0),
                delivery_max: Number(store.delivery_max ?? 0),
                profile_image: store.profile_image ?? "",
                status: store.status ?? "TEMP_CLOSED",
                is_hiring: true,
                total_reviews: reviewData.total ?? 0,
                avg_rating: Number(Number(reviewData.avg ?? 0).toFixed(1)),
            };
        }));
        return res.json({
            ok: true,
            total: stores.length,
            data: stores,
        });
    }
    catch (error) {
        console.error("GET STORES LIST ERROR:", error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
=======
            return {
                storeId: doc.id,
                total: aggSnap.data().total ?? 0,
                avg: aggSnap.data().avg ?? 0,
            };
        }));
        const ratingMap = {};
        ratingResults.forEach((r) => {
            ratingMap[r.storeId] = { total: r.total, avg: r.avg };
        });
        const stores = storeDocs.map((doc) => {
            const data = doc.data();
            const updatedAtOut = data.updated_at instanceof firestore_1.Timestamp
                ? data.updated_at.toDate().toISOString()
                : data.updated_at ?? null;
            const totalReviews = ratingMap[doc.id]?.total ?? 0;
            const avgRating = ratingMap[doc.id]?.avg ?? 0;
            return {
                store_id: data.store_id ?? doc.id,
                store_name: data.store_name ?? "",
                phone: data.phone ?? "",
                email: data.email ?? "",
                facebook: data.facebook ?? "",
                line_id: data.line_id ?? "",
                address: data.address ?? "",
                latitude: Number(data.latitude ?? 0),
                longitude: Number(data.longitude ?? 0),
                service_radius: Number(data.service_radius ?? 0),
                opening_hours: data.opening_hours ?? "",
                closed_hours: data.closed_hours ?? "",
                delivery_min: Number(data.delivery_min ?? 0),
                delivery_max: Number(data.delivery_max ?? 0),
                profile_image: data.profile_image ?? "",
                status: data.status ?? "TEMP_CLOSED",
                is_hiring: data.is_hiring ?? false,
                updated_at: updatedAtOut,
                total_reviews: totalReviews,
                avg_rating: Number(Number(avgRating).toFixed(1)),
            };
        });
        return res.json({ ok: true, total: stores.length, data: stores });
    }
    catch (e) {
        console.error("GET STORES LIST ERROR:", e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
    }
});
exports.router.get("/store/:id/applicants", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const [ridersSnap, staffSnap] = await Promise.all([
            firebase_1.db
                .collection("riders")
                .where("store_id", "==", storeRef)
                .where("status", "==", "pending")
                .get(),
            firebase_1.db
                .collection("laundry_staff")
                .where("store_id", "==", storeRef)
                .where("status", "==", "pending")
                .get(),
        ]);
        const riders = ridersSnap.docs.map((doc) => {
            const d = doc.data();
            return {
                rider_id: doc.id,
                fullname: d.fullname ?? "",
                phone: d.phone ?? "",
                profile_image: d.profile_image ?? "",
                vehicle_plate: d.vehicle_plate ?? null,
                applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
                role: "rider",
            };
        });
        const staff = staffSnap.docs.map((doc) => {
            const d = doc.data();
            return {
                staff_id: doc.id,
                fullname: d.fullname ?? "",
                phone: d.phone ?? "",
                profile_image: d.profile_image ?? "",
                applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
                role: "laundry_staff",
            };
        });
        return res.json({
            ok: true,
            data: {
                riders,
                staff,
                total: riders.length + staff.length,
            },
        });
    }
    catch (e) {
        console.error("GET STORE APPLICANTS ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
>>>>>>> origin/main
        });
    }
});
exports.router.put("/rider/store/:id", async (req, res) => {
    try {
        const riderId = req.params.id;
        const { store_id } = req.body;
        if (isBlank(store_id)) {
<<<<<<< HEAD
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ store_id",
            });
        }
        const targetStoreId = String(store_id).trim();
        const riderRef = firebase_1.db.collection("riders").doc(riderId);
        const riderSnap = await riderRef.get();
        if (!riderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบไรเดอร์",
            });
        }
        const riderData = riderSnap.data();
        if (riderData?.store_id) {
            const currentStoreId = riderData.store_id.id;
            if (riderData.status === "pending" &&
                currentStoreId === targetStoreId) {
=======
            return res.status(400).json({ ok: false, message: "กรุณาระบุ store_id" });
        }
        const riderRef = firebase_1.db.collection("riders").doc(riderId);
        const riderSnap = await riderRef.get();
        if (!riderSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบไรเดอร์" });
        }
        const riderData = riderSnap.data();
        const targetStoreId = store_id.trim();
        if (riderData?.store_id) {
            const currentStoreId = riderData.store_id.id;
            if (riderData.status === "pending" && currentStoreId === targetStoreId) {
>>>>>>> origin/main
                return res.status(409).json({
                    ok: false,
                    message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
                });
            }
            if (riderData.status === "pending") {
                return res.status(409).json({
                    ok: false,
                    message: "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
                });
            }
            return res.status(409).json({
                ok: false,
                message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
            });
        }
<<<<<<< HEAD
        const storeRef = firebase_1.db
            .collection("stores")
            .doc(targetStoreId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้าที่เลือก",
            });
        }
        const storeData = storeSnap.data();
        if (storeData?.is_hiring !== true) {
=======
        if (riderData?.store_id) {
            const currentStoreId = riderData.store_id.id;
            if (riderData.status === "pending" && currentStoreId === targetStoreId) {
                return res.status(409).json({
                    ok: false,
                    message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
                });
            }
            if (riderData.status === "pending") {
                return res.status(409).json({
                    ok: false,
                    message: "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
                });
            }
            return res.status(409).json({
                ok: false,
                message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
            });
        }
        const storeRef = firebase_1.db.collection("stores").doc(targetStoreId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้าที่เลือก" });
        }
        const storeData = storeSnap.data();
        if (storeData?.is_hiring === false) {
>>>>>>> origin/main
            return res.status(400).json({
                ok: false,
                message: "ร้านนี้ปิดรับสมัครพนักงานอยู่ในขณะนี้",
            });
        }
<<<<<<< HEAD
        const updateData = {
            store_id: storeRef,
            status: "pending",
        };
        await riderRef.update(updateData);
=======
        await riderRef.update({
            store_id: storeRef,
            status: "pending",
        });
>>>>>>> origin/main
        return res.json({
            ok: true,
            message: "ส่งคำขอผูกร้านค้าสำเร็จ กรุณารอร้านค้ายืนยัน",
            data: {
                rider_id: riderId,
                store_id: storeRef.id,
                store_name: storeData?.store_name ?? "",
                status: "pending",
            },
        });
    }
    catch (e) {
        console.error("RIDER LINK STORE ERROR:", e);
<<<<<<< HEAD
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
=======
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
>>>>>>> origin/main
    }
});
exports.router.put("/staff/store/:id", async (req, res) => {
    try {
        const staffId = req.params.id;
        const { store_id } = req.body;
        if (isBlank(store_id)) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ store_id",
            });
        }
<<<<<<< HEAD
        const targetStoreId = String(store_id).trim();
        const staffRef = firebase_1.db
            .collection("laundry_staff")
            .doc(staffId);
=======
        const staffRef = firebase_1.db.collection("laundry_staff").doc(staffId);
>>>>>>> origin/main
        const staffSnap = await staffRef.get();
        if (!staffSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบพนักงาน",
            });
        }
        const staffData = staffSnap.data();
<<<<<<< HEAD
        if (staffData?.store_id) {
            const currentStoreId = staffData.store_id.id;
            if (staffData.status === "pending" &&
                currentStoreId === targetStoreId) {
=======
        const targetStoreId = store_id.trim();
        if (staffData?.store_id) {
            const currentStoreId = staffData.store_id.id;
            if (staffData.status === "pending" && currentStoreId === targetStoreId) {
>>>>>>> origin/main
                return res.status(409).json({
                    ok: false,
                    message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
                });
            }
            if (staffData.status === "pending") {
                return res.status(409).json({
                    ok: false,
                    message: "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
                });
            }
            return res.status(409).json({
                ok: false,
                message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
            });
        }
<<<<<<< HEAD
        const storeRef = firebase_1.db
            .collection("stores")
            .doc(targetStoreId);
=======
        const storeRef = firebase_1.db.collection("stores").doc(targetStoreId);
>>>>>>> origin/main
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้าที่เลือก",
            });
        }
        const storeData = storeSnap.data();
<<<<<<< HEAD
        if (storeData?.is_hiring !== true) {
=======
        if (storeData?.is_hiring === false) {
>>>>>>> origin/main
            return res.status(400).json({
                ok: false,
                message: "ร้านนี้ปิดรับสมัครพนักงานอยู่ในขณะนี้",
            });
        }
<<<<<<< HEAD
        const updateData = {
            store_id: storeRef,
            status: "pending",
        };
        await staffRef.update(updateData);
=======
        await staffRef.update({
            store_id: storeRef,
            status: "pending",
        });
>>>>>>> origin/main
        return res.json({
            ok: true,
            message: "ส่งคำขอผูกร้านค้าสำเร็จ กรุณารอร้านค้ายืนยัน",
            data: {
                staff_id: staffId,
                store_id: storeRef.id,
                store_name: storeData?.store_name ?? "",
                status: "pending",
            },
        });
    }
    catch (e) {
        console.error("STAFF LINK STORE ERROR:", e);
        return res.status(500).json({
            ok: false,
<<<<<<< HEAD
            message: "Server error",
=======
            message: e.message ?? "Server error",
>>>>>>> origin/main
        });
    }
});
exports.router.get("/store/:id/applicants", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const [ridersSnap, staffSnap] = await Promise.all([
            firebase_1.db
                .collection("riders")
                .where("store_id", "==", storeRef)
                .where("status", "==", "pending")
                .get(),
            firebase_1.db
                .collection("laundry_staff")
                .where("store_id", "==", storeRef)
                .where("status", "==", "pending")
                .get(),
        ]);
        const riders = ridersSnap.docs.map((doc) => {
<<<<<<< HEAD
            const data = doc.data();
            return {
                rider_id: doc.id,
                fullname: data.fullname ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? "",
                vehicle_type: data.vehicle_type ?? "",
                license_plate: data.license_plate ?? "",
                applied_at: data.updated_at
                    ? {
                        _seconds: data.updated_at.seconds,
                        _nanoseconds: data.updated_at.nanoseconds,
                    }
                    : null,
=======
            const d = doc.data();
            return {
                rider_id: doc.id,
                fullname: d.fullname ?? "",
                email: d.email ?? "",
                phone: d.phone ?? "",
                profile_image: d.profile_image ?? "",
                vehicle_type: d.vehicle_type ?? "",
                license_plate: d.license_plate ?? "",
                applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
>>>>>>> origin/main
                role: "rider",
            };
        });
        const staff = staffSnap.docs.map((doc) => {
<<<<<<< HEAD
            const data = doc.data();
            return {
                staff_id: doc.id,
                fullname: data.fullname ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? "",
                applied_at: data.updated_at
                    ? {
                        _seconds: data.updated_at.seconds,
                        _nanoseconds: data.updated_at.nanoseconds,
                    }
                    : null,
=======
            const d = doc.data();
            return {
                staff_id: doc.id,
                fullname: d.fullname ?? "",
                email: d.email ?? "",
                phone: d.phone ?? "",
                profile_image: d.profile_image ?? "",
                applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
>>>>>>> origin/main
                role: "laundry_staff",
            };
        });
        return res.json({
            ok: true,
            data: {
                riders,
                staff,
                total: riders.length + staff.length,
            },
        });
    }
    catch (e) {
        console.error("GET STORE APPLICANTS ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
<<<<<<< HEAD
exports.router.put("/store/:storeId/applicant/:userId/status", async (req, res) => {
    try {
        const storeId = req.params.storeId;
        const userId = req.params.userId;
        const { role, action } = req.body;
        if (role !== "rider" && role !== "laundry_staff") {
            return res.status(400).json({
                ok: false,
                message: "role ไม่ถูกต้อง",
            });
        }
        if (action !== "approve" && action !== "reject") {
            return res.status(400).json({
                ok: false,
                message: "action ไม่ถูกต้อง",
            });
        }
        let collectionName = "";
        if (role === "rider") {
            collectionName = "riders";
        }
        else {
            collectionName = "laundry_staff";
        }
        const userRef = firebase_1.db
            .collection(collectionName)
            .doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบผู้สมัคร",
            });
        }
        const userData = userSnap.data();
        if (userData?.store_id?.id !== storeId) {
            return res.status(403).json({
                ok: false,
                message: "ผู้สมัครไม่ได้สมัครร้านนี้",
            });
        }
        if (userData?.status !== "pending") {
            return res.status(400).json({
                ok: false,
                message: "ผู้สมัครไม่ได้อยู่ในสถานะรออนุมัติ",
            });
        }
        if (action === "approve") {
            await userRef.update({
                status: "ONLINE",
                updated_at: firestore_1.Timestamp.now(),
            });
            return res.json({
                ok: true,
                message: "ยืนยันผู้สมัครสำเร็จ",
                data: {
                    user_id: userId,
                    status: "ONLINE",
                },
            });
        }
        await userRef.update({
            status: null,
            store_id: null,
        });
        return res.json({
            ok: true,
            message: "ปฏิเสธผู้สมัครสำเร็จ",
            data: {
                user_id: userId,
                status: null,
            },
        });
    }
    catch (error) {
        console.error("UPDATE APPLICANT STATUS ERROR:", error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
=======
async function updateApplicantStatus(req, res, collection, idField, notFoundMessage) {
    try {
        const storeId = req.params.storeId;
        const employeeId = req.params.userId;
        const { role, action } = req.body;
        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({ ok: false, message: "action ไม่ถูกต้อง" });
        }
        const employeeRef = firebase_1.db.collection(collection).doc(employeeId);
        const employeeSnap = await employeeRef.get();
        if (!employeeSnap.exists) {
            return res.status(404).json({ ok: false, message: notFoundMessage });
        }
        const d = employeeSnap.data();
        if (d?.store_id?.id !== storeId) {
            return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์ดำเนินการกับผู้สมัครนี้" });
        }
        if (action === "approve") {
            await employeeRef.update({
                status: "TEMP_CLOSED",
                updated_at: new Date(),
            });
        }
        else {
            await employeeRef.update({
                status: null,
                store_id: null,
                updated_at: new Date(),
            });
        }
        return res.json({
            ok: true,
            message: action === "approve" ? "ยืนยันผู้สมัครสำเร็จ" : "ปฏิเสธผู้สมัครสำเร็จ",
            data: {
                [idField]: employeeId,
                status: action === "approve" ? "TEMP_CLOSED" : null,
            },
        });
    }
    catch (e) {
        console.error("UPDATE APPLICANT STATUS ERROR:", e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
    }
}
exports.router.put("/store/:storeId/applicant/:userId/status", (req, res) => {
    const { role } = req.body;
    if (role === "rider") {
        return updateApplicantStatus(req, res, "riders", "rider_id", "ไม่พบไรเดอร์");
    }
    else if (role === "laundry_staff") {
        return updateApplicantStatus(req, res, "laundry_staff", "staff_id", "ไม่พบพนักงาน");
    }
    return res.status(400).json({ ok: false, message: "role ไม่ถูกต้อง" });
>>>>>>> origin/main
});
exports.router.put("/store/:id/hiring", async (req, res) => {
    try {
        const storeId = req.params.id;
        const { isHiring } = req.body;
        if (typeof isHiring !== "boolean") {
            return res.status(400).json({
                ok: false,
                message: "isHiring ต้องเป็น true หรือ false",
            });
        }
<<<<<<< HEAD
        const storeRef = firebase_1.db
            .collection("stores")
            .doc(storeId);
=======
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
>>>>>>> origin/main
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
<<<<<<< HEAD
        const updateStore = {
            is_hiring: isHiring,
        };
        await storeRef.update(updateStore);
=======
        await storeRef.update({
            is_hiring: isHiring,
            updated_at: new Date(),
        });
>>>>>>> origin/main
        return res.json({
            ok: true,
            message: isHiring
                ? "เปิดรับสมัครพนักงานแล้ว"
                : "ปิดรับสมัครพนักงานแล้ว",
            data: {
                store_id: storeId,
                is_hiring: isHiring,
            },
        });
    }
    catch (e) {
        console.error("UPDATE HIRING ERROR:", e);
        return res.status(500).json({
            ok: false,
<<<<<<< HEAD
            message: "Server error",
=======
            message: e.message ?? "Server error",
>>>>>>> origin/main
        });
    }
});
exports.router.get("/store/:id/hiring-status", async (req, res) => {
    try {
        const storeId = req.params.id;
<<<<<<< HEAD
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
        const data = storeSnap.data();
=======
        const storeSnap = await firebase_1.db.collection("stores").doc(storeId).get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "Store not found",
            });
        }
        const d = storeSnap.data();
>>>>>>> origin/main
        return res.json({
            ok: true,
            data: {
                store_id: storeId,
<<<<<<< HEAD
                status: data.status ?? "TEMP_CLOSED",
                is_hiring: data.is_hiring ?? false,
=======
                status: d?.status ?? "TEMP_CLOSED",
                is_hiring: d?.is_hiring ?? true,
>>>>>>> origin/main
            },
        });
    }
    catch (e) {
        console.error("GET HIRING STATUS ERROR:", e);
        return res.status(500).json({
            ok: false,
<<<<<<< HEAD
            message: "Server error",
=======
            message: e.message ?? "Server error",
>>>>>>> origin/main
        });
    }
});
async function getAppliedStore(req, res, collection, notFoundMessage) {
    try {
<<<<<<< HEAD
        const userId = req.params.id;
        if (!userId) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบ id",
            });
        }
        const userRef = firebase_1.db
            .collection(collection)
            .doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: notFoundMessage,
            });
        }
        const userData = userSnap.data();
        if (!userData?.store_id) {
            return res.json({
                ok: true,
                data: null,
            });
        }
        const storeRef = userData.store_id;
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.json({
                ok: true,
                data: null,
            });
        }
        const storeData = storeSnap.data();
=======
        const userIdParam = req.params.id;
        if (typeof userIdParam !== "string" || !userIdParam) {
            return res.status(400).json({ ok: false, message: "Invalid or missing id" });
        }
        const userId = userIdParam;
        const userSnap = await firebase_1.db.collection(collection).doc(userId).get();
        if (!userSnap.exists) {
            return res.status(404).json({ ok: false, message: notFoundMessage });
        }
        const d = userSnap.data();
        if (!d?.store_id) {
            return res.json({ ok: true, data: null });
        }
        if (typeof d.store_id?.get !== "function") {
            console.error(`Invalid store_id in [${collection}] doc ${userId}:`, d.store_id);
            return res.json({ ok: true, data: null });
        }
        const storeSnap = await d.store_id.get();
        if (!storeSnap.exists) {
            return res.json({ ok: true, data: null });
        }
        const s = storeSnap.data();
>>>>>>> origin/main
        return res.json({
            ok: true,
            data: {
                store_id: storeSnap.id,
<<<<<<< HEAD
                store_name: storeData?.store_name ?? "",
                phone: storeData?.phone ?? "",
                address: storeData?.address ?? "",
                profile_image: storeData?.profile_image ?? "",
                status: userData.status ?? null,
            },
        });
    }
    catch (error) {
        console.error(`GET APPLIED STORE ERROR [${collection}]:`, error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
=======
                store_name: s?.store_name ?? "",
                phone: s?.phone ?? "",
                address: s?.address ?? "",
                profile_image: s?.profile_image ?? "",
                status: d?.status ?? null,
            },
        });
    }
    catch (e) {
        console.error(`GET APPLIED STORE ERROR [${collection}]:`, e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
>>>>>>> origin/main
    }
}
exports.router.get("/rider/:id/applied/store", (req, res) => {
    return getAppliedStore(req, res, "riders", "ไม่พบไรเดอร์");
});
exports.router.get("/staff/:id/applied/store", (req, res) => {
    return getAppliedStore(req, res, "laundry_staff", "ไม่พบพนักงาน");
});
async function editAppliedStore(req, res, collection, notFoundMessage) {
    try {
<<<<<<< HEAD
        const userId = req.params.id;
        if (!userId) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบ id",
            });
        }
        const userRef = firebase_1.db
            .collection(collection)
            .doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: notFoundMessage,
            });
        }
        const userData = userSnap.data();
        if (userData?.status !== "pending") {
            return res.status(400).json({
                ok: false,
                message: "สามารถยกเลิกได้เฉพาะคำขอที่รออนุมัติ",
            });
=======
        const userIdParam = req.params.id;
        if (typeof userIdParam !== "string" || !userIdParam) {
            return res.status(400).json({ ok: false, message: "Invalid or missing id" });
        }
        const userId = userIdParam;
        const userRef = firebase_1.db.collection(collection).doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return res.status(404).json({ ok: false, message: notFoundMessage });
>>>>>>> origin/main
        }
        await userRef.update({
            status: null,
            store_id: null,
        });
        return res.json({
            ok: true,
<<<<<<< HEAD
            message: "ยกเลิกการสมัครร้านสำเร็จ",
        });
    }
    catch (error) {
        console.error(`EDIT APPLIED STORE ERROR [${collection}]:`, error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
=======
            message: "ลบเสร็จแล้ว",
        });
    }
    catch (e) {
        console.error(`EDIT APPLIED STORE ERROR [${collection}]:`, e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
>>>>>>> origin/main
    }
}
exports.router.put("/rider/:id/applied/store", (req, res) => {
    return editAppliedStore(req, res, "riders", "ไม่พบไรเดอร์");
});
exports.router.put("/staff/:id/applied/store", (req, res) => {
    return editAppliedStore(req, res, "laundry_staff", "ไม่พบพนักงาน");
});
