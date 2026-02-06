"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_js_1 = require("../config/firebase.js");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const multer_1 = __importDefault(require("multer"));
exports.router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});
exports.router.get("/profile/:customerId", async (req, res) => {
    try {
        const customerId = req.params.customerId;
        const ref = firebase_js_1.db.collection("customers").doc(customerId);
        const snap = await ref.get();
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
exports.router.put("/profile/:id", upload.single("profile_image"), async (req, res) => {
    try {
        const customerId = req.params.id;
        const ref = firebase_js_1.db.collection("customers").doc(customerId);
        const exist = await ref.get();
        if (!exist.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
        }
        const fullname = req.body.fullname;
        const email = req.body.email;
        const phone = req.body.phone;
        const gender = req.body.gender;
        const birthday = req.body.birthday;
        const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (email !== undefined && emailNorm) {
            const q = await firebase_js_1.db
                .collection("customers")
                .where("email", "==", emailNorm)
                .limit(1)
                .get();
            if (!q.empty && q.docs[0].id !== customerId) {
                return res.status(409).json({ ok: false, message: "อีเมลนี้ถูกใช้งานในระบบแล้ว" });
            }
        }
        // ✅ สำคัญ: ต้องเป็น object
        const update = {};
        if (fullname !== undefined)
            update.fullname = fullname ? String(fullname) : null;
        // ✅ email: ถ้าส่งมาแต่เป็นค่าว่าง -> set null
        if (email !== undefined)
            update.email = emailNorm ? emailNorm : null;
        if (phone !== undefined)
            update.phone = phone ? String(phone) : null;
        if (gender !== undefined)
            update.gender = gender ? String(gender) : null;
        if (birthday !== undefined)
            update.birthday = birthday ? String(birthday) : null;
        if (req.file) {
            const safeName = (req.file.originalname || "profile").replace(/[^\w.-]/g, "_");
            const objectPath = `customers/${customerId}/profile_${Date.now()}_${safeName}`;
            const file = firebase_js_1.bucket.file(objectPath);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            const [url] = await file.getSignedUrl({
                action: "read",
                expires: "2491-01-01",
            });
            update.profile_image = url;
        }
        update.updated_at = firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
        await ref.set(update, { merge: true });
        const snap = await ref.get();
        const data = snap.data();
        const birthdayOut = data.birthday?.toDate ? data.birthday.toDate().toISOString().slice(0, 10) : null;
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
                wallet_balance: Number(data.wallet_balance ?? 0),
                google_id: data.google_id ?? "",
            },
        });
    }
    catch (e) {
        console.error("PROFILE UPDATE ERROR:", e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
    }
});
exports.router.post("/:id/link-google", async (req, res) => {
    try {
        const customerId = req.params.id;
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ ok: false, message: "idToken required" });
        }
        // 1) verify google token
        const decoded = await firebase_admin_1.default.auth().verifyIdToken(idToken);
        const googleUid = decoded.uid;
        const email = decoded.email ?? null;
        // 2) กัน googleUid ถูกผูกกับ customer คนอื่นอยู่แล้ว
        const dup = await firebase_js_1.db
            .collection("customers")
            .where("google_id", "==", googleUid)
            .limit(1)
            .get();
        if (!dup.empty && dup.docs[0].id !== customerId) {
            return res.status(409).json({
                ok: false,
                message: "Google account นี้ถูกผูกกับบัญชีอื่นแล้ว",
            });
        }
        // 3) อัปเดต customer เดิมให้มี google_id
        const user = await firebase_admin_1.default.auth().getUser(googleUid);
        const displayName = user.displayName ?? null;
        const photoUrl = user.photoURL ?? null;
        const update = {
            google_id: googleUid,
            updated_at: firebase_js_1.FieldValue.serverTimestamp(),
        };
        // อัปเดต email/profile แบบไม่ทับของเดิมถ้าไม่มีค่า
        if (email)
            update.email = email.trim().toLowerCase();
        if (displayName)
            update.fullname = displayName;
        if (photoUrl)
            update.profile_image = photoUrl;
        await firebase_js_1.db.collection("customers").doc(customerId).set(update, { merge: true });
        const snap = await firebase_js_1.db.collection("customers").doc(customerId).get();
        return res.json({ ok: true, linked: true, docId: snap.id, ...snap.data() });
    }
    catch (e) {
        console.error("LINK GOOGLE ERROR:", e);
        return res.status(400).json({ ok: false, message: e.message ?? "link google failed" });
    }
});
exports.router.post("/addresses/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        const checkcustomer = firebase_js_1.db.collection("customers").doc(customerId);
        const cSnap = await checkcustomer.get();
        if (!cSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า"
            });
        }
        const { address_name, address_text, latitude, longitude, status } = req.body;
        if (!address_name || !String(address_name).trim()) {
            return res.status(400).json({
                ok: false,
                message: "address_name required"
            });
        }
        if (!address_text || !String(address_text).trim()) {
            return res.status(400).json({
                ok: false,
                message: "address_text required"
            });
        }
        const lat = latitude === undefined ? null : Number(latitude);
        const lng = longitude === undefined ? null : Number(longitude);
        if (lat !== null && Number.isNaN(lat)) {
            return res.status(400).json({ ok: false, message: "latitude invalid" });
        }
        if (lng !== null && Number.isNaN(lng)) {
            return res.status(400).json({ ok: false, message: "longitude invalid" });
        }
        // 🔥 logic ใหม่
        let st = true;
        if (status !== undefined) {
            st = status === true || status === "true";
        }
        if (st === true) {
            const snap = await firebase_js_1.db
                .collection("customer_addresses")
                .where("customer_id", "==", customerId)
                .where("status", "==", true)
                .get();
            const batch = firebase_js_1.db.batch();
            snap.docs.forEach(d => {
                batch.update(d.ref, { status: false });
            });
            await batch.commit();
        }
        const ref = firebase_js_1.db.collection("customer_addresses").doc();
        await ref.set({
            address_id: ref.id,
            customer_id: customerId,
            address_name: String(address_name).trim(),
            address_text: String(address_text).trim(),
            latitude: lat,
            longitude: lng,
            status: st,
            created_at: firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
        });
        return res.status(201).json({
            ok: true,
            address_id: ref.id
        });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({
            ok: false,
            message: e.message
        });
    }
});
exports.router.get("/addresses/:id", async (req, res) => {
    try {
        const customerId = String(req.params.id).trim();
        if (!customerId) {
            return res.status(400).json({
                ok: false,
                message: "customer_id required"
            });
        }
        const address = await firebase_js_1.db
            .collection("customer_addresses")
            .where("customer_id", "==", customerId)
            .orderBy("status", "asc")
            .get();
        const data = address.docs.map(d => {
            const doc = d.data();
            return {
                address_id: d.id,
                customer_id: doc.customer_id ?? "",
                address_name: doc.address_name ?? "",
                address_text: doc.address_text ?? "",
                latitude: doc.latitude ?? 0,
                longitude: doc.longitude ?? 0,
                status: doc.status ?? false,
            };
        });
        return res.json({
            ok: true,
            count: data.length,
            data
        });
    }
    catch (e) {
        console.error("GET ADDRESS ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: "server error"
        });
    }
});
exports.router.put("/addresses/update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { address_name, address_text, latitude, longitude, status } = req.body;
        await firebase_js_1.db.collection("customer_addresses")
            .doc(id)
            .update({
            address_name,
            address_text,
            latitude,
            longitude,
            status,
        });
        res.json({
            success: true,
            message: "Address updated"
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});
exports.router.put("/addresses/status/:id", async (req, res) => {
    const id = req.params.id;
    const ref = firebase_js_1.db.collection("customer_addresses").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
        return res.status(404).json({ ok: false });
    }
    const { status } = req.body;
    // ถ้าตั้ง default ใหม่
    if (status === true) {
        const custId = snap.data().customer_id;
        const old = await firebase_js_1.db
            .collection("customer_addresses")
            .where("customer_id", "==", custId)
            .where("status", "==", true)
            .get();
        const batch = firebase_js_1.db.batch();
        old.docs.forEach(d => {
            batch.update(d.ref, { status: false });
        });
        await batch.commit();
    }
    await ref.update(req.body);
    res.json({ ok: true });
});
exports.router.delete("/addresses/delete/:id", async (req, res) => {
    await firebase_js_1.db
        .collection("customer_addresses")
        .doc(req.params.id)
        .delete();
    res.json({ ok: true });
});
