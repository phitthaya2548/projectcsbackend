"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_js_1 = require("../config/firebase.js");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const upload_js_1 = require("../middlewares/upload.js");
const haversine_js_1 = require("../services/haversine.js");
exports.router = (0, express_1.Router)();
exports.router.get("/profile/:customerId", async (req, res) => {
    try {
        const customerId = req.params.customerId;
        const customerref = firebase_js_1.db.collection("customers").doc(customerId);
        const snap = await customerref.get();
        if (!snap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
        }
        const d = snap.data();
        return res.json({
            ok: true,
            customer_id: snap.id,
            data: {
                customer_id: d.customer_id ?? snap.id,
                username: d.username ?? '',
                fullname: d.fullname ?? '',
                email: d.email ?? '',
                phone: d.phone ?? '',
                gender: d.gender ?? '',
                birthday: (d.birthday),
                profile_image: d.profile_image ?? '',
                wallet_balance: Number(d.wallet_balance ?? 0),
                google_id: d.google_id ?? '',
            },
        });
    }
    catch (e) {
        console.error("GET PROFILE ERROR:", e);
        return res
            .status(500)
            .json({ ok: false, message: e.message ?? "Server error" });
    }
});
exports.router.put("/profile/:id", upload_js_1.upload.single("profile_image"), async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerref = firebase_js_1.db.collection("customers").doc(customerId);
        const exist = await customerref.get();
        if (!exist.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const currentData = exist.data();
        const { fullname, email, phone, gender, birthday } = req.body;
        const update = {};
        const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (currentData.google_id && email !== undefined) {
            return res.status(400).json({
                ok: false,
                message: "บัญชี Google ไม่สามารถแก้ไขอีเมลได้",
            });
        }
        if (!currentData.google_id && email !== undefined && emailNorm) {
            const q = await firebase_js_1.db
                .collection("customers")
                .where("email", "==", emailNorm)
                .limit(1)
                .get();
            if (!q.empty && q.docs[0].id !== customerId) {
                return res.status(409).json({
                    ok: false,
                    message: "อีเมลนี้ถูกใช้งานในระบบแล้ว",
                });
            }
            update.email = emailNorm;
        }
        if (phone !== undefined) {
            const phoneStr = String(phone);
            if (!/^\d{10}$/.test(phoneStr)) {
                return res.status(400).json({
                    ok: false,
                    message: "เบอร์โทรต้องมี 10 หลัก",
                });
            }
            update.phone = phoneStr;
        }
        if (fullname !== undefined)
            update.fullname = fullname ? String(fullname) : null;
        if (gender !== undefined)
            update.gender = gender ? String(gender) : null;
        if (birthday !== undefined)
            update.birthday = birthday ? birthday : null;
        if (req.file) {
            const safeName = (req.file.originalname || "profile")
                .replace(/[^\w.-]/g, "_");
            const objectPath = `customers/${customerId}/profile_${Date.now()}_${safeName}`;
            const file = firebase_js_1.bucket.file(objectPath);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${firebase_js_1.bucket.name}/${file.name}`;
            update.profile_image = publicUrl;
        }
        await customerref.set(update, { merge: true });
        const snap = await customerref.get();
        const data = snap.data();
        const birthdayOut = data.birthday?.toDate?.()
            ? data.birthday.toDate().toISOString().slice(0, 10)
            : data.birthday ?? null;
        return res.json({
            ok: true,
            customer_id: customerId,
            data: {
                customer_id: data.customer_id ?? customerId,
                username: data.username ?? "",
                fullname: data.fullname ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                gender: data.gender ?? "",
                birthday: birthdayOut,
                profile_image: data.profile_image ?? "",
                wallet_balance: data.wallet_balance ?? 0,
                google_id: data.google_id ?? "",
            },
        });
    }
    catch (e) {
        console.error("PROFILE UPDATE ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.post("/:id/link-google", async (req, res) => {
    try {
        const customerId = req.params.id;
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({
                ok: false,
                message: "idToken required",
            });
        }
        const decoded = await firebase_admin_1.default.auth().verifyIdToken(idToken);
        const googleUid = decoded.uid;
        const email = decoded.email ?? null;
        if (!email) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบอีเมลจาก Google",
            });
        }
        const checkgoogle_id = await firebase_js_1.db
            .collection("customers")
            .where("google_id", "==", googleUid)
            .limit(1)
            .get();
        if (!checkgoogle_id.empty && checkgoogle_id.docs[0].id !== customerId) {
            return res.status(409).json({
                ok: false,
                message: "Google account นี้ถูกผูกกับบัญชีอื่นแล้ว",
            });
        }
        const customerRef = firebase_js_1.db.collection("customers").doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบบัญชีลูกค้า",
            });
        }
        const customerData = customerSnap.data();
        const googleEmail = email.trim().toLowerCase();
        const dbEmail = customerData?.email?.trim().toLowerCase();
        if (dbEmail && googleEmail !== dbEmail) {
            return res.status(400).json({
                ok: false,
                message: "อีเมล Google ต้องตรงกับอีเมลที่สมัครไว้",
            });
        }
        const user = await firebase_admin_1.default.auth().getUser(googleUid);
        const displayName = user.displayName ?? null;
        const photoUrl = user.photoURL ?? null;
        const update = {
            google_id: googleUid,
            google_linked_at: new Date(),
        };
        if (!dbEmail && googleEmail) {
            update.email = googleEmail;
        }
        if (displayName && (!customerData.fullname || customerData.fullname.trim() === '')) {
            update.fullname = displayName;
        }
        // อัปเดตรูปถ้ายังไม่มีหรือเป็นค่าว่าง
        if (photoUrl && (!customerData.profile_image || customerData.profile_image.trim() === '')) {
            update.profile_image = photoUrl;
        }
        await customerRef.set(update, { merge: true });
        const snap = await customerRef.get();
        const data = snap.data();
        const birthdayOut = data.birthday?.toDate?.()
            ? data.birthday.toDate().toISOString().slice(0, 10)
            : data.birthday ?? null;
        return res.json({
            ok: true,
            message: "เชื่อม Google สำเร็จ",
            linked: true,
            data: {
                customer_id: data.customer_id ?? customerId,
                username: data.username ?? "",
                fullname: data.fullname ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                gender: data.gender ?? "",
                birthday: birthdayOut,
                profile_image: data.profile_image ?? "",
                wallet_balance: data.wallet_balance ?? 0,
                google_id: data.google_id ?? "",
            },
        });
    }
    catch (e) {
        console.error("LINK GOOGLE ERROR:", e);
        return res.status(400).json({
            ok: false,
            message: e.message ?? "link google failed",
        });
    }
});
exports.router.post("/addresses/:id", async (req, res) => {
    try {
        const customerId = String(req.params.id).trim();
        const customerRef = firebase_js_1.db
            .collection("customers")
            .doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const { address_name, address_text, latitude, longitude, status, } = req.body;
        if (!address_name?.trim()) {
            return res.status(400).json({
                ok: false,
                message: "address_name required",
            });
        }
        if (!address_text?.trim()) {
            return res.status(400).json({
                ok: false,
                message: "address_text required",
            });
        }
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (Number.isNaN(lat)) {
            return res.status(400).json({
                ok: false,
                message: "latitude invalid",
            });
        }
        if (Number.isNaN(lng)) {
            return res.status(400).json({
                ok: false,
                message: "longitude invalid",
            });
        }
        if (status === true) {
            const customersnap = await firebase_js_1.db
                .collection("customer_addresses")
                .where("customer_id", "==", customerRef)
                .where("status", "==", true)
                .get();
            const batch = firebase_js_1.db.batch();
            customersnap.docs.forEach(d => batch.update(d.ref, { status: false }));
            await batch.commit();
        }
        const ref = firebase_js_1.db.collection("customer_addresses").doc();
        const dataaddress = {
            customer_id: customerRef,
            address_name: address_name.trim(),
            address_text: address_text.trim(),
            latitude: lat,
            longitude: lng,
            status: status === true,
        };
        await ref.set(dataaddress);
        return res.status(201).json({
            ok: true,
            address_id: ref.id,
        });
    }
    catch (e) {
        res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/addresses/active/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerRef = firebase_js_1.db
            .collection("customers")
            .doc(customerId);
        const snap = await firebase_js_1.db
            .collection("customer_addresses")
            .where("customer_id", "==", customerRef)
            .where("status", "==", true)
            .limit(1)
            .get();
        if (snap.empty) {
            return res.json({
                ok: true,
                data: null,
            });
        }
        const doc = snap.docs[0];
        const data = doc.data();
        res.json({
            ok: true,
            data: {
                address_id: doc.id,
                customer_id: data.customer_id.id,
                address_name: data.address_name,
                address_text: data.address_text,
                latitude: data.latitude,
                longitude: data.longitude,
                status: data.status,
            },
        });
    }
    catch (e) {
        res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/addresses/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerRef = firebase_js_1.db
            .collection("customers")
            .doc(customerId);
        const snap = await firebase_js_1.db
            .collection("customer_addresses")
            .where("customer_id", "==", customerRef)
            .orderBy("status", "desc")
            .get();
        const data = snap.docs.map(doc => {
            const d = doc.data();
            return {
                address_id: doc.id,
                customer_id: d.customer_id.id,
                address_name: d.address_name,
                address_text: d.address_text,
                latitude: d.latitude,
                longitude: d.longitude,
                status: d.status,
            };
        });
        res.json({
            ok: true,
            count: data.length,
            data,
        });
    }
    catch (e) {
        res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.put("/addresses/update/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const addressRef = firebase_js_1.db
            .collection("customer_addresses")
            .doc(id);
        const snap = await addressRef.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "Address not found",
            });
        }
        const update = {};
        if (req.body.customer_id !== undefined) {
            const customerRef = firebase_js_1.db
                .collection("customers")
                .doc(String(req.body.customer_id));
            const customerSnap = await customerRef.get();
            if (!customerSnap.exists) {
                return res.status(400).json({
                    ok: false,
                    message: "Customer not found",
                });
            }
            update.customer_id = customerRef;
        }
        if (req.body.address_name !== undefined)
            update.address_name = String(req.body.address_name).trim();
        if (req.body.address_text !== undefined)
            update.address_text = String(req.body.address_text).trim();
        if (req.body.latitude !== undefined)
            update.latitude = Number(req.body.latitude);
        if (req.body.longitude !== undefined)
            update.longitude = Number(req.body.longitude);
        if (req.body.status !== undefined)
            update.status = Boolean(req.body.status);
        if (Object.keys(update).length === 0) {
            return res.status(400).json({
                ok: false,
                message: "No data to update",
            });
        }
        if (req.body.address_name !== undefined && !String(req.body.address_name).trim()) {
            return res.status(400).json({
                ok: false,
                message: "address_name required",
            });
        }
        await addressRef.update(update);
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.put("/addresses/status/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const addressRef = firebase_js_1.db
            .collection("customer_addresses")
            .doc(id);
        const snap = await addressRef.get();
        if (!snap.exists) {
            return res.status(404).json({ ok: false });
        }
        const data = snap.data();
        // 🔥 เป็น DocumentReference แล้ว
        const customerRef = data.customer_id;
        const defaultAddress = await firebase_js_1.db
            .collection("customer_addresses")
            .where("customer_id", "==", customerRef)
            .where("status", "==", true)
            .get();
        const batch = firebase_js_1.db.batch();
        // ปิดตัวอื่น
        defaultAddress.docs.forEach(d => batch.update(d.ref, { status: false }));
        // เปิดตัวนี้
        batch.update(addressRef, { status: true });
        await batch.commit();
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.delete("/addresses/delete/:id", async (req, res) => {
    try {
        const ref = firebase_js_1.db
            .collection("customer_addresses")
            .doc(req.params.id);
        const snap = await ref.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "Address not found",
            });
        }
        await ref.delete();
        res.json({ ok: true, message: "ลบข้อมูลที่อยู่ลูกค้าสำเร็จ" });
    }
    catch (e) {
        res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/getstores", async (req, res) => {
    try {
        const search = (req.query.search || "").trim();
        const customerLat = Number(req.query.lat);
        const customerLng = Number(req.query.lng);
        const snap = await firebase_js_1.db.collection("stores").get();
        let data = snap.docs.map(data => {
            const storeData = data.data();
            let distance = 0;
            if (!isNaN(customerLat) && !isNaN(customerLng)) {
                distance = haversine_js_1.DistanceService.haversineDistance(customerLat, customerLng, storeData.latitude, storeData.longitude);
            }
            return {
                store_id: data.id,
                store_name: storeData.store_name ?? "",
                profile_image: storeData.profile_image ?? "",
                rating: storeData.rating_avg ?? 0,
                opening: `${storeData.opening_hours ?? ""} - ${storeData.closed_hours ?? ""}`,
                services: storeData.services ?? [],
                distance_km: Number(distance.toFixed(1)),
                status: storeData.status ?? "ปิดชั่วคราว",
            };
        });
        if (search) {
            data = data.filter(s => s.store_name.toLowerCase().includes(search.toLowerCase()) ||
                s.store_name.includes(search));
        }
        data = data.slice(0, 20);
        res.json({ ok: true, data });
    }
    catch (e) {
        res.status(500).json({ ok: false, message: "server error" });
    }
});
