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
        let { store_id, email, username, password, fullname, phone, vehicle_type, license_plate, } = req.body;
        email = email?.trim().toLowerCase();
        username = username?.trim();
        if (!store_id ||
            !email ||
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
        const riderDoc = firebase_1.db.collection("riders").doc();
        const rider_id = riderDoc.id;
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        if (phone.length < 10 || phone.length > 10) {
            return res.status(400).json({
                ok: false,
                message: "เบอร์โทรต้องมี 10 หลัก",
            });
        }
        const riderUsername = await firebase_1.db.collection("riders").where("username", "==", username).limit(1).get();
        const storeUsername = await firebase_1.db.collection("stores").where("username", "==", username).limit(1).get();
        const customerUsername = await firebase_1.db.collection("customers").where("username", "==", username).limit(1).get();
        const staffUsername = await firebase_1.db.collection("laundry_staff").where("username", "==", username).limit(1).get();
        if (!riderUsername.empty ||
            !storeUsername.empty ||
            !customerUsername.empty ||
            !staffUsername.empty) {
            return res.status(409).json({
                ok: false,
                message: "username นี้ถูกใช้งานแล้ว",
            });
        }
        ;
        const riderEmail = await firebase_1.db.collection("riders").where("email", "==", email).limit(1).get();
        const storeEmail = await firebase_1.db.collection("stores").where("email", "==", email).limit(1).get();
        const customerEmail = await firebase_1.db.collection("customers").where("email", "==", email).limit(1).get();
        const staffEmail = await firebase_1.db.collection("laundry_staff").where("email", "==", email).limit(1).get();
        if (!riderEmail.empty ||
            !storeEmail.empty ||
            !customerEmail.empty ||
            !staffEmail.empty) {
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
                message: "ไม่พบ store",
            });
        }
        let imageUrl = null;
        if (req.file) {
            const safeName = (req.file.originalname || "profile")
                .replace(/[^\w.-]/g, "_");
            const path = `riders/${rider_id}_${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(path);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            imageUrl = `https://storage.googleapis.com/${firebase_1.bucket.name}/${file.name}`;
        }
        const rider = {
            rider_id,
            store_id: storeRef,
            email,
            username,
            password: hashedPassword,
            fullname,
            phone,
            vehicle_type,
            license_plate,
            profile_image: imageUrl,
            status: "ใช้งาน",
            latitude: null,
            longitude: null,
        };
        await riderDoc.set({
            ...rider,
        });
        return res.json({
            ok: true,
            message: "สมัคร Rider สำเร็จ",
            rider_id,
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
        const rider_id = req.params.id;
        const riderRef = firebase_1.db.collection("riders").doc(rider_id);
        const riderSnap = await riderRef.get();
        if (!riderSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบ rider",
            });
        }
        let { store_id, email, username, password, fullname, phone, vehicle_type, license_plate, status, latitude, longitude, } = req.body;
        const updateData = {};
        if (email !== undefined) {
            email = String(email).trim().toLowerCase();
            const emailChecks = await Promise.all([
                firebase_1.db.collection("riders").where("email", "==", email).limit(1).get(),
                firebase_1.db.collection("stores").where("email", "==", email).limit(1).get(),
                firebase_1.db.collection("customers").where("email", "==", email).limit(1).get(),
                firebase_1.db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
            ]);
            const duplicated = emailChecks.some((snap) => snap.docs.some((doc) => doc.id !== rider_id));
            if (duplicated) {
                return res.status(409).json({
                    ok: false,
                    message: "email ถูกใช้แล้ว",
                });
            }
            updateData.email = email;
        }
        if (username !== undefined) {
            username = String(username).trim();
            const usernameChecks = await Promise.all([
                firebase_1.db.collection("riders").where("username", "==", username).limit(1).get(),
                firebase_1.db.collection("stores").where("username", "==", username).limit(1).get(),
                firebase_1.db.collection("customers").where("username", "==", username).limit(1).get(),
                firebase_1.db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
            ]);
            const duplicated = usernameChecks.some((snap) => snap.docs.some((doc) => doc.id !== rider_id));
            if (duplicated) {
                return res.status(409).json({
                    ok: false,
                    message: "username นี้ถูกใช้งานแล้ว",
                });
            }
            updateData.username = username;
        }
        if (password !== undefined && String(password).trim() !== "") {
            updateData.password = await bcrypt_1.default.hash(String(password), 10);
        }
        if (fullname !== undefined) {
            updateData.fullname = String(fullname).trim();
        }
        if (phone !== undefined) {
            phone = String(phone).trim();
            if (phone.length !== 10) {
                return res.status(400).json({
                    ok: false,
                    message: "เบอร์โทรต้องมี 10 หลัก",
                });
            }
            updateData.phone = phone;
        }
        if (vehicle_type !== undefined) {
            updateData.vehicle_type = String(vehicle_type).trim();
        }
        if (license_plate !== undefined) {
            updateData.license_plate = String(license_plate).trim();
        }
        if (status !== undefined) {
            updateData.status = String(status).trim();
        }
        if (latitude !== undefined) {
            updateData.latitude =
                latitude === null || latitude === "" ? null : Number(latitude);
        }
        if (longitude !== undefined) {
            updateData.longitude =
                longitude === null || longitude === "" ? null : Number(longitude);
        }
        if (store_id !== undefined) {
            const storeRef = firebase_1.db.collection("stores").doc(String(store_id));
            const storeSnap = await storeRef.get();
            if (!storeSnap.exists) {
                return res.status(404).json({
                    ok: false,
                    message: "ไม่พบ store",
                });
            }
            updateData.store_id = storeRef;
        }
        if (req.file) {
            const safeName = (req.file.originalname || "profile").replace(/[^\w.-]/g, "_");
            const path = `riders/${rider_id}_${Date.now()}_${safeName}`;
            const file = firebase_1.bucket.file(path);
            await file.save(req.file.buffer, {
                contentType: req.file.mimetype,
                resumable: false,
            });
            await file.makePublic();
            updateData.profile_image = `https://storage.googleapis.com/${firebase_1.bucket.name}/${file.name}`;
        }
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                ok: false,
                message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
            });
        }
        await riderRef.update(updateData);
        const updatedSnap = await riderRef.get();
        const updatedData = updatedSnap.data();
        return res.json({
            ok: true,
            message: "แก้ไข Rider สำเร็จ",
            data: {
                rider_id: riderRef.id,
                email: updatedData.email ?? null,
                username: updatedData.username ?? null,
                fullname: updatedData.fullname ?? null,
                phone: updatedData.phone ?? null,
                vehicle_type: updatedData.vehicle_type ?? null,
                license_plate: updatedData.license_plate ?? null,
                profile_image: updatedData.profile_image ?? null,
                status: updatedData.status ?? null,
                latitude: updatedData.latitude ?? null,
                longitude: updatedData.longitude ?? null,
                store_id: updatedData.store_id?.id ?? null,
            },
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e.message,
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
exports.router.get("/store/:id", async (req, res) => {
    try {
        const store_id = req.params.id;
        const storeRef = firebase_1.db.collection("stores").doc(store_id);
        const snap = await firebase_1.db
            .collection("riders")
            .where("store_id", "==", storeRef)
            .get();
        if (snap.empty) {
            return res.json({
                ok: true,
                count: 0,
                data: [],
            });
        }
        const riders = snap.docs.map(doc => {
            const d = doc.data();
            return {
                rider_id: doc.id,
                email: d.email,
                username: d.username,
                fullname: d.fullname,
                phone: d.phone,
                vehicle_type: d.vehicle_type,
                license_plate: d.license_plate,
                profile_image: d.profile_image ?? null,
                status: d.status,
                latitude: d.latitude ?? null,
                longitude: d.longitude ?? null,
            };
        });
        return res.json({
            ok: true,
            count: riders.length,
            data: riders,
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e.message,
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
