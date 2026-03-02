"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const machine_1 = require("../modules/machine");
const upload_1 = require("../middlewares/upload");
exports.router = (0, express_1.Router)();
exports.router.put("/profile/:id", upload_1.upload.single("profile_image"), async (req, res) => {
    try {
        const storeId = req.params.id;
        console.log("body:", req.body);
        const ref = firebase_1.db.collection("stores").doc(storeId);
        const exist = await ref.get();
        if (!exist.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า"
            });
        }
        const { store_name, email, phone, address, opening_hours, closed_hours, service_radius, latitude, longitude, facebook, line_id, status, delivery_min, delivery_max } = req.body;
        const emailNorm = email?.trim().toLowerCase() || "";
        if (email !== undefined) {
            const q = await firebase_1.db
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
        if (delivery_min !== undefined) {
            const min = Number(delivery_min);
            if (!isNaN(min))
                update.delivery_min = min;
        }
        if (delivery_max !== undefined) {
            const max = Number(delivery_max);
            if (!isNaN(max))
                update.delivery_max = max;
        }
        if (req.file) {
            const safeName = (req.file.originalname || "profile")
                .replace(/[^\w.-]/g, "_");
            const objectPath = `stores/${storeId}/profile_${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(objectPath);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            update.profile_image =
                `https://storage.googleapis.com/${firebase_1.bucket.name}/${file.name}`;
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
                delivery_min: Number(data.delivery_min ?? 0),
                delivery_max: Number(data.delivery_max ?? 0),
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
exports.router.get("/profile/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const ref = firebase_1.db.collection("stores").doc(storeId);
        const snap = await ref.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า"
            });
        }
        const data = snap.data();
        return res.json({
            ok: true,
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
                delivery_min: Number(data.delivery_min ?? 0),
                delivery_max: Number(data.delivery_max ?? 0),
                machine_wash_count: Number(data.machine_wash_count ?? 0),
                machine_dry_count: Number(data.machine_dry_count ?? 0),
            }
        });
    }
    catch (e) {
        console.error("STORE PROFILE GET ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error"
        });
    }
});
exports.router.get("/customer/profile/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeref = firebase_1.db.collection("stores").doc(storeId);
        const snap = await storeref.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const machinestore = firebase_1.db.collection("machines").where("store_id", "==", storeref);
        let machinewashcount = 0, machinedrycount = 0;
        const machineSnap = await machinestore.get();
        machineSnap.forEach((doc) => {
            const data = doc.data();
            if (data.type === "washer") {
                machinewashcount++;
            }
            else if (data.type === "dryer") {
                machinedrycount++;
            }
        });
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
                machine_wash_count: machinewashcount,
                machine_dry_count: machinedrycount,
            },
        });
    }
    catch (e) {
        console.error("get store profile error:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.put("/profile/status/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุสถานะร้าน",
            });
        }
        const allowedStatus = ["เปิดร้าน", "ปิดชั่วคราว"];
        if (!allowedStatus.includes(status)) {
            return res.status(400).json({
                ok: false,
                message: "สถานะไม่ถูกต้อง",
            });
        }
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const snap = await storeRef.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        await storeRef.update({
            status: status,
            updated_at: new Date(),
        });
        return res.json({
            ok: true,
            message: "อัปเดตสถานะร้านสำเร็จ",
            data: {
                store_id: storeId,
                status: status,
            },
        });
    }
    catch (e) {
        console.error("update store status error:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.get("/profile/status/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const snap = await storeRef.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const storeData = snap.data();
        return res.json({
            ok: true,
            message: "ดึงสถานะร้านสำเร็จ",
            data: {
                store_id: storeId,
                status: storeData?.status ?? "ปิดชั่วคราว",
            },
        });
    }
    catch (e) {
        console.error("get store status error:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.post("/images/:id", upload_1.upload.array("store_images", 5), async (req, res) => {
    try {
        const storeId = String(req.params.id);
        const storeRef = firebase_1.db
            .collection("stores")
            .doc(storeId);
        const storedb = await storeRef.get();
        if (!storedb.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า"
            });
        }
        const imgcheck = await firebase_1.db
            .collection("store_images")
            .where("store_id", "==", storeRef)
            .get();
        const currentCount = imgcheck.size;
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
        for (const f of files) {
            const safeName = (f.originalname || "img")
                .replace(/[^\w.-]/g, "_");
            const fileName = `ads_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 8)}_${safeName}`;
            const objectPath = `stores/${storeId}/${fileName}`;
            const file = firebase_1.bucket.file(objectPath);
            await file.save(f.buffer, {
                contentType: f.mimetype,
                resumable: false
            });
            await file.makePublic();
            const url = `https://storage.googleapis.com/${firebase_1.bucket.name}/${objectPath}`;
            const data = {
                store_id: storeRef,
                image_path: url,
            };
            const storeImgRef = await firebase_1.db
                .collection("store_images")
                .add(data);
            uploaded.push({
                image_id: storeImgRef.id,
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
exports.router.put("/images/:imageId", upload_1.upload.single("store_images"), async (req, res) => {
    try {
        const imageId = String(req.params.imageId);
        const imageRef = firebase_1.db.collection("store_images").doc(imageId);
        const imageDoc = await imageRef.get();
        if (!imageDoc.exists)
            return res.status(404).json({ ok: false, message: "ไม่พบรูปภาพ" });
        if (!req.file)
            return res.status(400).json({ ok: false, message: "กรุณาอัปโหลดรูป" });
        const existingData = imageDoc.data();
        const storeId = existingData.store_id.id;
        // ลบไฟล์เก่าออกจาก Storage
        try {
            const oldPath = existingData.image_path.split(`${firebase_1.bucket.name}/`)[1];
            await firebase_1.bucket.file(oldPath).delete();
        }
        catch (err) {
            console.warn("ลบไฟล์เก่าไม่สำเร็จ:", err);
        }
        // อัปโหลดไฟล์ใหม่
        const f = req.file;
        const safeName = (f.originalname || "img").replace(/[^\w.-]/g, "_");
        const fileName = `ads_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safeName}`;
        const objectPath = `stores/${storeId}/${fileName}`;
        const file = firebase_1.bucket.file(objectPath);
        await file.save(f.buffer, { contentType: f.mimetype, resumable: false });
        await file.makePublic();
        const newUrl = `https://storage.googleapis.com/${firebase_1.bucket.name}/${objectPath}`;
        await imageRef.update({ image_path: newUrl, updated_at: new Date() });
        return res.json({
            ok: true,
            message: "แก้ไขรูปสำเร็จ",
            image: { image_id: imageId, image_path: newUrl },
        });
    }
    catch (e) {
        console.error("UPDATE IMAGE ERROR:", e);
        return res.status(500).json({ ok: false, message: "update image error" });
    }
});
exports.router.delete("/images/:id", async (req, res) => {
    try {
        const imageId = String(req.params.id);
        const imageRef = firebase_1.db.collection("store_images").doc(imageId);
        const imageDoc = await imageRef.get();
        if (!imageDoc.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบรูปภาพ" });
        }
        const data = imageDoc.data();
        // ลบไฟล์จาก Storage
        try {
            const oldPath = data.image_path.split(`${firebase_1.bucket.name}/`)[1];
            await firebase_1.bucket.file(oldPath).delete();
        }
        catch (err) {
            console.warn("ลบไฟล์จาก storage ไม่สำเร็จ:", err);
        }
        // ลบ document
        await imageRef.delete();
        return res.json({ ok: true, message: "ลบรูปสำเร็จ" });
    }
    catch (e) {
        console.error("DELETE IMAGE ERROR:", e);
        return res.status(500).json({ ok: false, message: "delete error" });
    }
});
exports.router.get("/images/:id", async (req, res) => {
    try {
        const storeId = String(req.params.id);
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storedb = await storeRef.get();
        if (!storedb.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const imgSnap = await firebase_1.db
            .collection("store_images")
            .where("store_id", "==", storeRef)
            .get();
        const images = imgSnap.docs.map((doc) => ({
            image_id: doc.id,
            image_path: doc.data().image_path,
        }));
        return res.json({
            ok: true,
            store_id: storeId,
            total_images: images.length,
            images,
        });
    }
    catch (e) {
        console.error("GET IMAGES ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.post("/machine", async (req, res) => {
    try {
        const data = req.body;
        if (!data.name ||
            !data.type ||
            !data.capacity ||
            !data.price ||
            !data.work_minutes ||
            !data.store_id) {
            return res.status(400).json({
                ok: false,
                message: "กรอกข้อมูลไม่ครบ",
            });
        }
        if (isNaN(Number(data.capacity)) ||
            isNaN(Number(data.price)) ||
            isNaN(Number(data.work_minutes))) {
            return res.status(400).json({
                ok: false,
                message: "capacity/price/work_minutes ต้องเป็นตัวเลข",
            });
        }
        if (data.status && !machine_1.MACHINE_STATUS.includes(data.status)) {
            return res.status(400).json({
                ok: false,
                message: "status ไม่ถูกต้อง",
            });
        }
        const storeRef = firebase_1.db.collection("stores").doc(data.store_id);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้าน",
            });
        }
        const docRef = firebase_1.db.collection("machines").doc();
        const machine = {
            machine_id: docRef.id,
            store_id: storeRef,
            name: data.name.trim(),
            type: data.type,
            capacity: Number(data.capacity),
            price: Number(data.price),
            work_minutes: Number(data.work_minutes),
            status: "available",
        };
        await docRef.set(machine);
        return res.json({
            ok: true,
            message: "เพิ่มเครื่องสำเร็จ",
            data: {
                ...machine,
                store_id: data.store_id,
            },
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            ok: false,
            message: err.message,
        });
    }
});
exports.router.put("/machine/update/:id", async (req, res) => {
    try {
        const machineId = req.params.id;
        const data = req.body;
        const machineref = firebase_1.db.collection("machines").doc(machineId);
        const snap = await machineref.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบเครื่อง",
            });
        }
        if (data.status !== undefined && !machine_1.MACHINE_STATUS.includes(data.status)) {
            return res.status(400).json({
                ok: false,
                message: "status ไม่ถูกต้อง",
            });
        }
        if (data.type && !["washer", "dryer"].includes(data.type)) {
            return res.status(400).json({
                ok: false,
                message: "type ต้องเป็น washer หรือ dryer",
            });
        }
        if ((data.capacity !== undefined && isNaN(Number(data.capacity))) ||
            (data.price !== undefined && isNaN(Number(data.price))) ||
            (data.work_minutes !== undefined && isNaN(Number(data.work_minutes)))) {
            return res.status(400).json({
                ok: false,
                message: "capacity/price/work_minutes ต้องเป็นตัวเลข",
            });
        }
        const update = {};
        if (data.machine_id !== undefined) {
            update.machine_id = data.machine_id.trim();
        }
        if (data.name !== undefined) {
            update.name = data.name.trim();
        }
        if (data.type !== undefined) {
            update.type = data.type;
        }
        if (data.capacity !== undefined) {
            update.capacity = Number(data.capacity);
        }
        if (data.price !== undefined) {
            update.price = Number(data.price);
        }
        if (data.work_minutes !== undefined) {
            update.work_minutes = Number(data.work_minutes);
        }
        if (data.status !== undefined) {
            update.status = data.status;
        }
        if (data.store_id !== undefined) {
            const storeRef = firebase_1.db.collection("stores").doc(data.store_id);
            const storeSnap = await storeRef.get();
            if (!storeSnap.exists) {
                return res.status(404).json({
                    ok: false,
                    message: "ไม่พบร้าน",
                });
            }
            update.store_id = storeRef;
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({
                ok: false,
                message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
            });
        }
        await machineref.update(update);
        const updatedSnap = await machineref.get();
        const result = updatedSnap.data();
        return res.json({
            ok: true,
            message: "แก้ไขเครื่องสำเร็จ",
            data: {
                ...result,
                store_id: result?.store_id?.id || null,
            },
        });
    }
    catch (e) {
        console.error("UPDATE MACHINE ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message || "Server error",
        });
    }
});
exports.router.get("/machines/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const snap = await firebase_1.db
            .collection("machines")
            .where("store_id", "==", storeRef)
            .get();
        if (snap.empty) {
            return res.json({
                ok: true,
                count: 0,
                data: [],
            });
        }
        const machines = snap.docs.map((doc) => {
            const data = doc.data();
            return {
                machine_id: data.machine_id,
                name: data.name,
                type: data.type,
                capacity: data.capacity,
                price: data.price,
                work_minutes: data.work_minutes,
                status: data.status,
            };
        });
        return res.json({
            ok: true,
            count: machines.length,
            data: machines,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
