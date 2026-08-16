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
        const resultcustomer = await customerref.get();
        if (!resultcustomer.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
        }
        const data = resultcustomer.data();
        return res.json({
            ok: true,
            customer_id: resultcustomer.id,
            data: {
                customer_id: data.customer_id ?? resultcustomer.id,
                username: data.username ?? '',
                fullname: data.fullname ?? '',
                email: data.email ?? '',
                phone: data.phone ?? '',
                gender: data.gender ?? '',
                birthday: (data.birthday),
                profile_image: data.profile_image ?? '',
                wallet_balance: Number(data.wallet_balance ?? 0),
                google_id: data.google_id ?? '',
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
<<<<<<< HEAD
        const customerRef = firebase_js_1.db
            .collection("customers")
            .doc(customerId);
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
=======
        const customerref = firebase_js_1.db.collection("customers").doc(customerId);
        const resultcustomer = await customerref.get();
        if (!resultcustomer.exists) {
>>>>>>> origin/main
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
<<<<<<< HEAD
        const currentData = customerSnap.data();
        const { fullname, email, phone, gender, birthday, } = req.body;
        const update = {};
        const emailNorm = typeof email === "string"
            ? email.trim().toLowerCase()
            : "";
        const currentEmailNorm = String(currentData.email ?? "")
            .trim()
            .toLowerCase();
        if (currentData.google_id &&
            email !== undefined &&
            emailNorm !== currentEmailNorm) {
=======
        const currentDatacus = resultcustomer.data();
        const { fullname, email, phone, gender, birthday } = req.body;
        const update = {};
        const emailNorm = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (currentDatacus.google_id && email !== undefined && email !== currentDatacus.email) {
>>>>>>> origin/main
            return res.status(400).json({
                ok: false,
                message: "บัญชี Google ไม่สามารถแก้ไขอีเมลได้",
            });
        }
<<<<<<< HEAD
        if (!currentData.google_id &&
            email !== undefined &&
            emailNorm) {
            const emailSnap = await firebase_js_1.db
=======
        if (!currentDatacus.google_id && email !== undefined && emailNorm) {
            const q = await firebase_js_1.db
>>>>>>> origin/main
                .collection("customers")
                .where("email", "==", emailNorm)
                .limit(1)
                .get();
            if (!emailSnap.empty &&
                emailSnap.docs[0].id !== customerId) {
                return res.status(409).json({
                    ok: false,
                    message: "อีเมลนี้ถูกใช้งานในระบบแล้ว",
                });
            }
            update.email = emailNorm;
        }
        if (phone !== undefined) {
            const phoneStr = String(phone).trim();
            if (!/^\d{10}$/.test(phoneStr)) {
                return res.status(400).json({
                    ok: false,
                    message: "เบอร์โทรต้องมี 10 หลัก",
                });
            }
            update.phone = phoneStr;
        }
        if (fullname !== undefined) {
            update.fullname =
                String(fullname).trim();
        }
        if (gender !== undefined) {
            update.gender =
                String(gender).trim();
        }
        if (birthday !== undefined) {
            update.birthday =
                birthday ? birthday : null;
        }
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
            update.profile_image =
                `https://storage.googleapis.com/${firebase_js_1.bucket.name}/${file.name}`;
        }
<<<<<<< HEAD
        await customerRef.update(update);
        const updatedSnap = await customerRef.get();
        const data = updatedSnap.data();
        const rawBirthday = data.birthday;
        const birthdayOut = typeof rawBirthday?.toDate === "function"
            ? rawBirthday
                .toDate()
                .toISOString()
                .slice(0, 10)
            : rawBirthday ?? null;
=======
        await customerref.set(update, { merge: true });
        const customerSnapshot = await customerref.get();
        const data = customerSnapshot.data();
        const birthdayOut = data.birthday?.toDate?.()
            ? data.birthday.toDate().toISOString().slice(0, 10)
            : data.birthday ?? null;
>>>>>>> origin/main
        return res.json({
            ok: true,
            customer_id: updatedSnap.id,
            data: {
                customer_id: updatedSnap.id,
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
        const customerId = req.params.id;
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
        const addressName = typeof address_name === "string"
            ? address_name.trim()
            : "";
        const addressText = typeof address_text === "string"
            ? address_text.trim()
            : "";
        if (!addressName) {
            return res.status(400).json({
                ok: false,
                message: "address_name required",
            });
        }
        if (!addressText) {
            return res.status(400).json({
                ok: false,
                message: "address_text required",
            });
        }
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (Number.isNaN(lat) ||
            lat < -90 ||
            lat > 90) {
            return res.status(400).json({
                ok: false,
                message: "latitude invalid",
            });
        }
        if (Number.isNaN(lng) ||
            lng < -180 ||
            lng > 180) {
            return res.status(400).json({
                ok: false,
                message: "longitude invalid",
            });
        }
        const isDefault = status === true || status === "true";
        const ref = firebase_js_1.db
            .collection("customer_addresses")
            .doc();
        const dataAddress = {
            customer_id: customerRef,
            address_name: addressName,
            address_text: addressText,
            latitude: lat,
            longitude: lng,
            status: isDefault,
        };
        if (isDefault) {
            const defaultAddressSnap = await firebase_js_1.db
                .collection("customer_addresses")
                .where("customer_id", "==", customerRef)
                .where("status", "==", true)
                .get();
            const batch = firebase_js_1.db.batch();
            defaultAddressSnap.docs.forEach((doc) => {
                batch.update(doc.ref, {
                    status: false,
                });
            });
            batch.set(ref, dataAddress);
            await batch.commit();
            await batch.commit();
        }
        else {
            await ref.set(dataAddress);
        }
        return res.status(201).json({
            ok: true,
            message: "เพิ่มที่อยู่สำเร็จ",
            address_id: ref.id,
        });
    }
    catch (e) {
        console.error("CREATE ADDRESS ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
exports.router.get("/addresses/active/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        if (!customerId) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ customer_id",
            });
        }
        const customerRef = firebase_js_1.db
            .collection("customers")
            .doc(customerId);
<<<<<<< HEAD
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const addressSnap = await firebase_js_1.db
=======
        const customersnap = await firebase_js_1.db
>>>>>>> origin/main
            .collection("customer_addresses")
            .where("customer_id", "==", customerRef)
            .where("status", "==", true)
            .limit(1)
            .get();
<<<<<<< HEAD
        if (addressSnap.empty) {
=======
        if (customersnap.empty) {
>>>>>>> origin/main
            return res.json({
                ok: true,
                data: null,
            });
        }
<<<<<<< HEAD
        const doc = addressSnap.docs[0];
=======
        const doc = customersnap.docs[0];
>>>>>>> origin/main
        const data = doc.data();
        return res.json({
            ok: true,
            data: {
                address_id: doc.id,
                customer_id: customerId,
                address_name: data.address_name ?? "",
                address_text: data.address_text ?? "",
                latitude: data.latitude ?? 0,
                longitude: data.longitude ?? 0,
                status: data.status ?? false,
            },
        });
    }
    catch (e) {
        console.error("GET ACTIVE ADDRESS ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "server error",
        });
    }
});
exports.router.get("/addresses/:id", async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerRef = firebase_js_1.db
            .collection("customers")
            .doc(customerId);
<<<<<<< HEAD
        const customerSnap = await customerRef.get();
        if (!customerSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบลูกค้า",
            });
        }
        const addressSnap = await firebase_js_1.db
=======
        const customersnap = await firebase_js_1.db
>>>>>>> origin/main
            .collection("customer_addresses")
            .where("customer_id", "==", customerRef)
            .orderBy("status", "desc")
            .get();
<<<<<<< HEAD
        const data = addressSnap.docs.map(doc => {
            const dataaddr = doc.data();
=======
        const data = customersnap.docs.map(doc => {
            const d = doc.data();
>>>>>>> origin/main
            return {
                address_id: doc.id,
                customer_id: dataaddr.customer_id.id,
                address_name: dataaddr.address_name,
                address_text: dataaddr.address_text,
                latitude: dataaddr.latitude,
                longitude: dataaddr.longitude,
                status: dataaddr.status,
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
<<<<<<< HEAD
        const addressSnap = await addressRef.get();
        if (!addressSnap.exists) {
=======
        const addresssnap = await addressRef.get();
        if (!addresssnap.exists) {
>>>>>>> origin/main
            return res.status(404).json({
                ok: false,
                message: "Address not found",
            });
        }
        const currentData = addressSnap.data();
        const update = {};
        if (req.body.address_name !== undefined) {
            const addressName = String(req.body.address_name).trim();
            if (!addressName) {
                return res.status(400).json({
                    ok: false,
                    message: "address_name required",
                });
            }
            update.address_name = addressName;
        }
        if (req.body.address_text !== undefined) {
            const addressText = String(req.body.address_text).trim();
            if (!addressText) {
                return res.status(400).json({
                    ok: false,
                    message: "address_text required",
                });
            }
            update.address_text = addressText;
        }
        if (req.body.latitude !== undefined) {
            const lat = Number(req.body.latitude);
            if (Number.isNaN(lat) ||
                lat < -90 ||
                lat > 90) {
                return res.status(400).json({
                    ok: false,
                    message: "latitude invalid",
                });
            }
            update.latitude = lat;
        }
        if (req.body.longitude !== undefined) {
            const lng = Number(req.body.longitude);
            if (Number.isNaN(lng) ||
                lng < -180 ||
                lng > 180) {
                return res.status(400).json({
                    ok: false,
                    message: "longitude invalid",
                });
            }
            update.longitude = lng;
        }
        let newStatus;
        if (req.body.status !== undefined) {
            newStatus =
                req.body.status === true ||
                    req.body.status === "true";
            update.status = newStatus;
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({
                ok: false,
                message: "No data to update",
            });
        }
        if (newStatus === true) {
            const customerRef = currentData.customer_id;
            const activeSnap = await firebase_js_1.db
                .collection("customer_addresses")
                .where("customer_id", "==", customerRef)
                .where("status", "==", true)
                .get();
            const batch = firebase_js_1.db.batch();
            activeSnap.docs.forEach((doc) => {
                if (doc.id !== id) {
                    batch.update(doc.ref, {
                        status: false,
                    });
                }
            });
            batch.update(addressRef, update);
            await batch.commit();
        }
        else {
            await addressRef.update(update);
        }
        return res.json({
            ok: true,
            message: "อัปเดตที่อยู่สำเร็จ",
        });
    }
    catch (e) {
        console.error("UPDATE ADDRESS ERROR:", e);
        return res.status(500).json({
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
        const addresssnap = await addressRef.get();
        if (!addresssnap.exists) {
            return res.status(404).json({ ok: false });
        }
        const data = addresssnap.data();
        const customerRef = data.customer_id;
        const defaultAddress = await firebase_js_1.db
            .collection("customer_addresses")
            .where("customer_id", "==", customerRef)
            .where("status", "==", true)
            .get();
        const batch = firebase_js_1.db.batch();
<<<<<<< HEAD
        defaultAddress.docs.forEach(d => batch.update(d.ref, { status: false }));
=======
        // ทำให้ตัวอื่นไม่ใช่ที่อยู่หลัก
        defaultAddress.docs.forEach(d => batch.update(d.ref, { status: false }));
        // ให้ตัวที่แก้ไขเป้นที่อยู่หลัก
>>>>>>> origin/main
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
// ดึงร้านค้ามาแสดงทั้หมด
exports.router.get("/getstores", async (req, res) => {
    try {
        const search = (req.query.search || "").trim();
        const customerLat = Number(req.query.lat);
        const customerLng = Number(req.query.lng);
        const storesnap = await firebase_js_1.db.collection("stores").get();
        let data = storesnap.docs.map(data => {
            const storeData = data.data();
            let distance = 0;
            if (!isNaN(customerLat) && !isNaN(customerLng)) {
                distance = haversine_js_1.DistanceService.haversineKm(customerLat, customerLng, storeData.latitude, storeData.longitude);
            }
            return {
                store_id: data.id,
                store_name: storeData.store_name ?? "",
                profile_image: storeData.profile_image ?? "",
                opening: `${storeData.opening_hours ?? ""} - ${storeData.closed_hours ?? ""}`,
                distance_km: Number(distance.toFixed(1)),
                status: storeData.status ?? "TEMP_CLOSED",
            };
        });
        if (search) {
            data = data.filter(s => s.store_name.toLowerCase().includes(search.toLowerCase()));
        }
        data = data.slice(0, 20);
        res.json({ ok: true, data });
    }
    catch (e) {
        res.status(500).json({ ok: false, message: "server error" });
    }
});
