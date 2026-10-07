"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const upload_1 = require("../middlewares/upload");
const bcrypt_1 = __importDefault(require("bcrypt"));
exports.router = (0, express_1.Router)();
exports.router.post("/register", upload_1.upload.single("profile_image"), async (req, res) => {
    try {
        let { email, username, password, fullname, phone, vehicle_type, license_plate, } = req.body;
        email = email?.trim().toLowerCase();
        username = username?.trim();
        if (!email ||
            !username ||
            !password ||
            !fullname ||
            !phone ||
            !vehicle_type ||
            !license_plate) {
            return res.status(400).json({
                ok: false,
                message: "กรอกข้อมูลไม่ครบ",
            });
        }
        if (phone.length !== 10) {
            return res.status(400).json({
                ok: false,
                message: "เบอร์โทรต้องมี 10 หลัก",
            });
        }
        const riderDoc = firebase_1.db.collection("riders").doc();
        const rider_id = riderDoc.id;
        const usernameQueries = await Promise.all([
            firebase_1.db.collection("riders").where("username", "==", username).limit(1).get(),
            firebase_1.db.collection("stores").where("username", "==", username).limit(1).get(),
            firebase_1.db.collection("customers").where("username", "==", username).limit(1).get(),
            firebase_1.db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
        ]);
        if (usernameQueries.some(snap => !snap.empty)) {
            return res.status(409).json({
                ok: false,
                message: "username นี้ถูกใช้งานแล้ว",
            });
        }
        const emailQueries = await Promise.all([
            firebase_1.db.collection("riders").where("email", "==", email).limit(1).get(),
            firebase_1.db.collection("stores").where("email", "==", email).limit(1).get(),
            firebase_1.db.collection("customers").where("email", "==", email).limit(1).get(),
            firebase_1.db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
        ]);
        if (emailQueries.some(snap => !snap.empty)) {
            return res.status(409).json({
                ok: false,
                message: "email ถูกใช้แล้ว",
            });
        }
        const phoneQueries = await Promise.all([
            firebase_1.db.collection("riders").where("phone", "==", phone).limit(1).get(),
            firebase_1.db.collection("stores").where("phone", "==", phone).limit(1).get(),
            firebase_1.db.collection("customers").where("phone", "==", phone).limit(1).get(),
            firebase_1.db.collection("laundry_staff").where("phone", "==", phone).limit(1).get(),
        ]);
        if (phoneQueries.some(snap => !snap.empty)) {
            return res.status(409).json({
                ok: false,
                message: "เบอร์โทรถูกใช้แล้ว",
            });
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        let imageUrl = null;
        if (req.file) {
            const safeName = (req.file.originalname || "profile")
                .replace(/[^\w.-]/g, "_");
            const filePath = `riders/${rider_id}_${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(filePath);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            imageUrl = `https://storage.googleapis.com/${firebase_1.bucket.name}/${filePath}`;
        }
        const rider = {
            rider_id,
            store_id: null,
            email,
            username,
            password: hashedPassword,
            fullname,
            phone,
            vehicle_type,
            license_plate,
            profile_image: imageUrl,
            status: "TEMP_CLOSED",
            latitude: null,
            longitude: null,
        };
        await riderDoc.set(rider);
        // แก้จาก 201 เป็น 200 ให้ตรงกับ pattern ที่ฝั่ง Flutter เช็ค
        // (res.statusCode == 200 && res.body['ok'] == true)
        return res.status(200).json({
            ok: true,
            message: "สมัคร Rider สำเร็จ",
            rider_id,
        });
    }
    catch (error) {
        console.error("RIDER REGISTER ERROR:", error);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.put("/update/:id", upload_1.upload.single("profile_image"), async (req, res) => {
    try {
        const rider_id = req.params.id;
        if (!rider_id)
            return res.status(400).json({ ok: false, message: "ไม่พบ rider_id" });
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const riderSnap = await riderRef.get();
        if (!riderSnap.exists)
            return res.status(404).json({ ok: false, message: "ไม่พบ Rider" });
        let { email, fullname, phone, vehicle_type, license_plate } = req.body;
        const updateData = {};
        if (email !== undefined && email.trim() !== "") {
            email = email.trim().toLowerCase();
            updateData.email = email;
        }
        if (fullname !== undefined && fullname.trim() !== "") {
            updateData.fullname = fullname.trim();
        }
        if (phone !== undefined && phone.trim() !== "") {
            phone = phone.trim();
            if (phone.length !== 10) {
                return res.status(400).json({
                    ok: false,
                    message: "เบอร์โทรต้องมี 10 หลัก",
                });
            }
            updateData.phone = phone;
        }
        if (vehicle_type !== undefined && vehicle_type.trim() !== "") {
            updateData.vehicle_type = vehicle_type.trim();
        }
        if (license_plate !== undefined && license_plate.trim() !== "") {
            updateData.license_plate = license_plate.trim();
        }
        if (email) {
            const [riders, stores, customers, staff] = await Promise.all([
                firebase_1.db.collection("riders").where("email", "==", email).limit(10).get(),
                firebase_1.db.collection("stores").where("email", "==", email).limit(1).get(),
                firebase_1.db.collection("customers").where("email", "==", email).limit(1).get(),
                firebase_1.db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
            ]);
            const duplicate = riders.docs.some(doc => doc.id !== rider_id);
            if (duplicate || !stores.empty || !customers.empty || !staff.empty) {
                return res.status(409).json({
                    ok: false,
                    message: "email ถูกใช้แล้ว",
                });
            }
        }
        if (phone) {
            const [riders, stores, customers, staff] = await Promise.all([
                firebase_1.db.collection("riders").where("phone", "==", phone).limit(10).get(),
                firebase_1.db.collection("stores").where("phone", "==", phone).limit(1).get(),
                firebase_1.db.collection("customers").where("phone", "==", phone).limit(1).get(),
                firebase_1.db.collection("laundry_staff").where("phone", "==", phone).limit(1).get(),
            ]);
            const duplicate = riders.docs.some(doc => doc.id !== rider_id);
            if (duplicate || !stores.empty || !customers.empty || !staff.empty) {
                return res.status(409).json({
                    ok: false,
                    message: "เบอร์โทรถูกใช้งานแล้ว",
                });
            }
        }
        if (req.file) {
            const safeName = (req.file.originalname || "profile").replace(/[^\w.-]/g, "_");
            const filePath = `riders/${rider_id}_${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(filePath);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            updateData.profile_image = `https://storage.googleapis.com/${firebase_1.bucket.name}/${filePath}`;
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                ok: false,
                message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
            });
        }
        await riderRef.update(updateData);
        return res.json({
            ok: true,
            message: "อัปเดต Rider สำเร็จ",
        });
    }
    catch (error) {
        console.error("RIDER UPDATE ERROR:", error);
        return res.status(500).json({
            ok: false,
            message: error.message || "Server error",
        });
    }
});
exports.router.get("/:id", async (req, res) => {
    try {
        const rider_id = req.params.id;
        const ridersRef = await firebase_1.db.collection("riders").doc(rider_id).get();
        if (!ridersRef.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบ rider",
            });
        }
        const data = ridersRef.data();
        return res.json({
            ok: true,
            data,
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e.message,
        });
    }
});
exports.router.get("/profile/status/:id", async (req, res) => {
    try {
        const riderId = req.params.id;
        const riderRef = firebase_1.db.collection("riders").doc(riderId);
        const snap = await riderRef.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบ rider",
            });
        }
        const data = snap.data();
        return res.json({
            ok: true,
            data: {
                rider_id: riderId,
                status: data?.status ?? "TEMP_CLOSED",
            },
        });
    }
    catch (e) {
        console.error("get rider status error:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.put("/profile/status/:id", async (req, res) => {
    try {
        const riderId = req.params.id;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุสถานะ rider",
            });
        }
        const allowedStatus = ["ONLINE", "TEMP_CLOSED"];
        if (!allowedStatus.includes(status)) {
            return res.status(400).json({
                ok: false,
                message: "สถานะไม่ถูกต้อง",
            });
        }
        const riderRef = firebase_1.db.collection("riders").doc(riderId);
        const snap = await riderRef.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบ rider",
            });
        }
        await riderRef.update({
            status: status,
        });
        return res.json({
            ok: true,
            message: "อัปเดตสถานะ rider สำเร็จ",
            data: {
                rider_id: riderId,
                status: status,
            },
        });
    }
    catch (e) {
        console.error("update rider status error:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
exports.router.delete("/delete/:id", async (req, res) => {
    try {
        const rider_id = req.params.id;
        if (!rider_id) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบ rider_id",
            });
        }
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const riderSnap = await riderRef.get();
        if (!riderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบ rider",
            });
        }
        await riderRef.delete();
        return res.json({
            ok: true,
            message: "ลบ Rider สำเร็จ",
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e.message,
        });
    }
});
