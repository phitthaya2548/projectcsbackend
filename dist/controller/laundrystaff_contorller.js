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
        let { store_id, username, password, email, fullname, phone, } = req.body;
        store_id = store_id?.trim();
        username = username?.trim();
        email = email?.trim();
        if (!username || !password || !email || !fullname || !phone) {
            return res.status(400).json({
                ok: false,
                message: "กรอกข้อมูลไม่ครบ",
            });
        }
        const [staffCheck, customerCheck, storeCheck, riderCheck] = await Promise.all([
            firebase_1.db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
            firebase_1.db.collection("customers").where("username", "==", username).limit(1).get(),
            firebase_1.db.collection("stores").where("username", "==", username).limit(1).get(),
            firebase_1.db.collection("riders").where("username", "==", username).limit(1).get(),
        ]);
        if (!staffCheck.empty || !customerCheck.empty || !storeCheck.empty || !riderCheck.empty) {
            return res.status(409).json({
                ok: false,
                message: "username นี้ถูกใช้งานแล้ว",
            });
        }
        const [staffEmailCheck, customerEmailCheck, storeEmailCheck, riderEmailCheck] = await Promise.all([
            firebase_1.db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
            firebase_1.db.collection("customers").where("email", "==", email).limit(1).get(),
            firebase_1.db.collection("stores").where("email", "==", email).limit(1).get(),
            firebase_1.db.collection("riders").where("email", "==", email).limit(1).get(),
        ]);
        if (!staffEmailCheck.empty ||
            !customerEmailCheck.empty ||
            !storeEmailCheck.empty ||
            !riderEmailCheck.empty) {
            return res.status(409).json({
                ok: false,
                message: "email ถูกใช้แล้ว",
            });
        }
        const storeRef = firebase_1.db.collection("stores").doc(store_id);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const hashed = await bcrypt_1.default.hash(password, 10);
        let imageUrl = null;
        if (req.file) {
            const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
            const path = `laundry_staff/${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(path);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
            });
            const [url] = await file.getSignedUrl({
                action: "read",
                expires: "2491-01-01",
            });
            imageUrl = url;
        }
        const laundryRef = firebase_1.db.collection("laundry_staff").doc();
        const staff_id = laundryRef.id;
        const staff = {
            staff_id,
            store_id: storeRef,
            username,
            password: hashed,
            email,
            fullname,
            phone,
            profile_image: imageUrl,
            status: "ใช้งาน",
        };
        await laundryRef.set(staff);
        return res.json({
            ok: true,
            message: "เพิ่มพนักงานซักอบสำเร็จ",
            staff_id,
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e.message,
        });
    }
});
exports.router.put("/update/:id", upload_1.upload.single("profile_image"), async (req, res) => {
    try {
        const staff_id = req.params.id;
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบ staff_id",
            });
        }
        const staffRef = firebase_1.db.collection("laundry_staff").doc(staff_id);
        const snap = await staffRef.get();
        if (!snap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบพนักงาน",
            });
        }
        const { username, password, email, fullname, phone, status } = req.body;
        const updateData = {};
        if (username !== undefined && username.trim() !== "") {
            updateData.username = username.trim();
        }
        if (email !== undefined && email.trim() !== "") {
            updateData.email = email.trim().toLowerCase();
        }
        if (fullname !== undefined && fullname.trim() !== "") {
            updateData.fullname = fullname.trim();
        }
        if (phone !== undefined && phone.trim() !== "") {
            updateData.phone = phone.trim();
        }
        if (status !== undefined && status.trim() !== "") {
            updateData.status = status;
        }
        if (password !== undefined && password.trim() !== "") {
            updateData.password = await bcrypt_1.default.hash(password.trim(), 10);
        }
        if (req.file) {
            const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
            const path = `laundry_staff/${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(path);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            const publicUrl = `https://storage.googleapis.com/${firebase_1.bucket.name}/${file.name}`;
            updateData.profile_image = publicUrl;
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                ok: false,
                message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
            });
        }
        await staffRef.update(updateData);
        return res.json({
            ok: true,
            message: "อัปเดตสำเร็จ",
        });
    }
    catch (err) {
        return res.status(500).json({
            ok: false,
            message: err.message,
        });
    }
});
exports.router.get("/:id", async (req, res) => {
    try {
        const staff_id = req.params.id;
        const doc = await firebase_1.db.collection("laundry_staff").doc(staff_id).get();
        if (!doc.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบพนักงาน",
            });
        }
        const data = doc.data();
        return res.json({
            ok: true,
            data,
        });
    }
    catch (e) {
        res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.get("/store/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const snapshot = await firebase_1.db
            .collection("laundry_staff")
            .where("store_id", "==", storeRef)
            .get();
        const staffList = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            const staff = {
                staff_id: doc.id,
                ...data,
            };
            staffList.push(staff);
        });
        return res.json({
            ok: true,
            total: staffList.length,
            data: staffList,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.delete("/delete/:id", async (req, res) => {
    try {
        const staff_id = req.params.id;
        if (!staff_id) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบ staff_id",
            });
        }
        const staffRef = firebase_1.db.collection("laundry_staff").doc(staff_id);
        const staffsnap = await staffRef.get();
        if (!staffsnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบพนักงาน",
            });
        }
        await staffRef.delete();
        return res.json({
            ok: true,
            message: "ลบพนักงานซักอบสำเร็จ",
        });
    }
    catch (err) {
        return res.status(500).json({
            ok: false,
            message: err.message,
        });
    }
});
