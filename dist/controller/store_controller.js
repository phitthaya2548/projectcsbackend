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
exports.router.put("/profile/:id", upload.single("profile_image"), async (req, res) => {
    try {
        const storeId = req.params.id;
        const ref = firebase_js_1.db.collection("stores").doc(storeId);
        const exist = await ref.get();
        if (!exist.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า"
            });
        }
        const { store_name, email, phone, address, opening_hours, closed_hours, service_radius, latitude, longitude, facebook, line_id, status } = req.body;
        const emailNorm = email?.trim().toLowerCase() || "";
        if (email !== undefined) {
            const q = await firebase_js_1.db
                .collection("stores")
                .where("email", "==", emailNorm)
                .limit(1)
                .get();
            if (!q.empty && q.docs[0].id !== storeId) {
                return res.status(409).json({
                    ok: false,
                    message: "อีเมลนี้ถูกใช้แล้ว"
                });
            }
        }
        const update = {};
        if (store_name !== undefined)
            update.store_name = store_name || null;
        if (email !== undefined)
            update.email = emailNorm || null;
        if (phone !== undefined)
            update.phone = phone || null;
        if (address !== undefined)
            update.address = address || null;
        if (opening_hours !== undefined)
            update.opening_hours = opening_hours || null;
        if (closed_hours !== undefined)
            update.closed_hours = closed_hours || null;
        if (facebook !== undefined)
            update.facebook = facebook || null;
        if (line_id !== undefined)
            update.line_id = line_id || null;
        if (status !== undefined)
            update.status = status;
        if (service_radius !== undefined) {
            const sr = Number(service_radius);
            if (!isNaN(sr))
                update.service_radius = sr;
        }
        if (latitude !== undefined) {
            const lat = Number(latitude);
            if (!isNaN(lat))
                update.latitude = lat;
        }
        if (longitude !== undefined) {
            const lng = Number(longitude);
            if (!isNaN(lng))
                update.longitude = lng;
        }
        // ✅ upload รูป
        if (req.file) {
            const safeName = (req.file.originalname || "profile")
                .replace(/[^\w.-]/g, "_");
            const objectPath = `stores/${storeId}/profile_${Date.now()}_${safeName}`;
            const file = firebase_js_1.bucket.file(objectPath);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false
            });
            const [url] = await file.getSignedUrl({
                action: "read",
                expires: "2491-01-01"
            });
            update.profile_image = url;
        }
        update.updated_at =
            firebase_admin_1.default.firestore.FieldValue.serverTimestamp();
        await ref.set(update, { merge: true });
        const snap = await ref.get();
        const data = snap.data();
        return res.json({
            ok: true,
            store_id: storeId,
            data: {
                store_id: data.store_id ?? storeId,
                username: data.username ?? "",
                store_name: data.store_name ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                facebook: data.facebook ?? "",
                line_id: data.line_id ?? "",
                address: data.address ?? "",
                opening_hours: data.opening_hours ?? "",
                closed_hours: data.closed_hours ?? "",
                service_radius: Number(data.service_radius ?? 0),
                latitude: Number(data.latitude ?? 0),
                longitude: Number(data.longitude ?? 0),
                status: data.status ?? "เปิดร้าน",
                profile_image: data.profile_image ?? "",
                wallet_balance: Number(data.wallet_balance ?? 0),
            }
        });
    }
    catch (e) {
        console.error("STORE PROFILE UPDATE ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error"
        });
    }
});
exports.router.post("/images/:id", upload.array("store_images", 5), async (req, res) => {
    try {
        const storeId = req.params.id;
        // 🔹 เช็คร้าน
        const storeRef = firebase_js_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า"
            });
        }
        // 🔹 นับรูปของร้านนี้จาก collection กลาง
        const imgSnap = await firebase_js_1.db
            .collection("store_images")
            .where("store_id", "==", storeId)
            .limit(6)
            .get();
        const currentCount = imgSnap.size;
        if (currentCount >= 5) {
            return res.status(400).json({
                ok: false,
                message: "ร้านมีรูปครบ 5 รูปแล้ว"
            });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาอัปโหลดรูป"
            });
        }
        const files = req.files;
        if (currentCount + files.length > 5) {
            return res.status(400).json({
                ok: false,
                message: `อัปโหลดได้อีก ${5 - currentCount} รูป`
            });
        }
        const uploaded = [];
        // 🔹 loop upload
        for (const f of files) {
            const safeName = (f.originalname || "img")
                .replace(/[^\w.-]/g, "_");
            const objectPath = `stores/${storeId}/ads_${Date.now()}_${safeName}`;
            const file = firebase_js_1.bucket.file(objectPath);
            await file.save(f.buffer, {
                contentType: f.mimetype,
                resumable: false
            });
            const [url] = await file.getSignedUrl({
                action: "read",
                expires: "2491-01-01"
            });
            // ✅ save ลง collection กลาง
            const docRef = await firebase_js_1.db
                .collection("store_images")
                .add({
                store_id: storeId,
                image_path: url,
            });
            uploaded.push({
                image_id: docRef.id,
                image_path: url
            });
        }
        return res.json({
            ok: true,
            message: "อัปโหลดสำเร็จ",
            total_images: currentCount + uploaded.length,
            images: uploaded
        });
    }
    catch (e) {
        console.error("UPLOAD ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: "upload error"
        });
    }
});
