"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const bcrypt = __importStar(require("bcrypt"));
const firebase_js_1 = require("../config/firebase.js");
exports.router = (0, express_1.Router)();
const isBlank = (value) => value == null || String(value).trim() === "";
function checkProfile(data, required) {
    const missing = required.filter((key) => isBlank(data?.[key]));
    return {
        profile_complete: missing.length === 0,
        missing_fields: missing,
    };
}
function checkCustomerProfile(data) {
    return checkProfile(data, [
        "fullname",
        "phone",
        "email",
    ]);
}
async function getCustomerAddressSummary(customerId) {
    const customerRef = firebase_js_1.db
        .collection("customers")
        .doc(customerId);
    const addressCollection = firebase_js_1.db.collection("customer_addresses");
    const [activeAddress, allAddress] = await Promise.all([
        addressCollection
            .where("customer_id", "==", customerRef)
            .where("status", "==", true)
            .limit(1)
            .get(),
        addressCollection
            .where("customer_id", "==", customerRef)
            .get(),
    ]);
    return {
        address_complete: !activeAddress.empty,
        address_count: allAddress.size,
    };
}
async function findCustomerByUsername(username) {
    const query = await firebase_js_1.db
        .collection("customers")
        .where("username", "==", username)
        .limit(1)
        .get();
    return query.empty ? null : query.docs[0];
}
async function findStoreByUsername(username) {
    const query = await firebase_js_1.db
        .collection("stores")
        .where("username", "==", username)
        .limit(1)
        .get();
    return query.empty ? null : query.docs[0];
}
async function findCustomerByEmail(email) {
    const query = await firebase_js_1.db
        .collection("customers")
        .where("email", "==", email)
        .limit(1)
        .get();
    return query.empty ? null : query.docs[0];
}
exports.router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                ok: false,
                message: "username/password required",
            });
        }
        const inputUsername = username.trim();
        const customerDoc = await findCustomerByUsername(inputUsername);
        if (customerDoc) {
            const data = customerDoc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน (Google login?)",
                });
            }
            const passwordCorrect = await bcrypt.compare(password, hash);
            if (!passwordCorrect) {
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            }
            const profileStatus = checkCustomerProfile(data);
            const addressStatus = await getCustomerAddressSummary(customerDoc.id);
            return res.json({
                ok: true,
                role: "customer",
                customer_id: customerDoc.id,
                fullname: data.fullname ?? "",
                username: data.username ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                google_id: data.google_id ?? "",
                profile_image: data.profile_image ?? null,
                profile_complete: profileStatus.profile_complete,
                missing_fields: profileStatus.missing_fields,
                address_complete: addressStatus.address_complete,
                address_count: addressStatus.address_count,
            });
        }
        const storeDoc = await findStoreByUsername(inputUsername);
        if (storeDoc) {
            const data = storeDoc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน",
                });
            }
            const passwordCorrect = await bcrypt.compare(password, hash);
            if (!passwordCorrect) {
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            }
            return res.json({
                ok: true,
                role: "store",
                store_id: storeDoc.id,
                store_name: data.store_name ?? "",
                username: data.username ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
                status: data.status ?? "",
            });
        }
        const riderSnap = await firebase_js_1.db
            .collection("riders")
            .where("username", "==", inputUsername)
            .limit(1)
            .get();
        if (!riderSnap.empty) {
            const doc = riderSnap.docs[0];
            const data = doc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน",
                });
            }
            const passwordCorrect = await bcrypt.compare(password, hash);
            if (!passwordCorrect) {
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            }
            return res.json({
                ok: true,
                role: "rider",
                store_id: data.store_id?.id ?? "",
                rider_id: doc.id,
                fullname: data.fullname ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
                status: data.status ?? "",
            });
        }
        const staffSnap = await firebase_js_1.db
            .collection("laundry_staff")
            .where("username", "==", inputUsername)
            .limit(1)
            .get();
        if (!staffSnap.empty) {
            const doc = staffSnap.docs[0];
            const data = doc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน",
                });
            }
            const passwordCorrect = await bcrypt.compare(password, hash);
            if (!passwordCorrect) {
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            }
            return res.json({
                ok: true,
                role: "laundry_staff",
                store_id: data.store_id?.id ?? "",
                staff_id: doc.id,
                fullname: data.fullname ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
                status: data.status ?? "",
            });
        }
        return res.status(400).json({
            ok: false,
            message: "ไม่พบบัญชีผู้ใช้",
        });
    }
    catch (error) {
        console.error("LOGIN ERROR:", error);
        return res.status(500).json({
            ok: false,
            message: error?.message ?? "Server error",
        });
    }
});
exports.router.post("/google", async (req, res) => {
    try {
        const { google_id } = req.body;
        if (!google_id) {
            return res.status(400).json({
                ok: false,
                message: "idToken required",
            });
        }
        const decoded = await firebase_js_1.auth.verifyIdToken(google_id);
        const uid = decoded.uid;
        const email = decoded.email;
        if (!email) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบอีเมลจาก Google",
            });
        }
        const user = await firebase_js_1.auth.getUser(uid);
        const displayName = user.displayName ?? null;
        const photoUrl = user.photoURL ?? null;
        const customerDoc = await findCustomerByEmail(email);
        if (customerDoc) {
            const data = customerDoc.data();
            const updateData = {
                google_id: uid,
            };
            if (displayName &&
                (!data.fullname ||
                    data.fullname.trim() === "")) {
                updateData.fullname = displayName;
            }
            if (photoUrl &&
                (!data.profile_image ||
                    data.profile_image.trim() === "")) {
                updateData.profile_image = photoUrl;
            }
            await customerDoc.ref.update(updateData);
            const latestSnap = await customerDoc.ref.get();
            const latestData = latestSnap.data();
            const addressStatus = await getCustomerAddressSummary(customerDoc.id);
            const birthday = latestData.birthday?.toDate?.()
                ? latestData.birthday
                    .toDate()
                    .toISOString()
                    .slice(0, 10)
                : latestData.birthday ?? null;
            return res.json({
                ok: true,
                role: "customer",
                customer_id: customerDoc.id,
                fullname: latestData.fullname ?? "",
                username: latestData.username ?? "",
                email: latestData.email ?? "",
                phone: latestData.phone ?? "",
                gender: latestData.gender ?? "",
                birthday,
                profile_image: latestData.profile_image ?? "",
                wallet_balance: latestData.wallet_balance ?? 0,
                google_id: latestData.google_id ?? "",
                ...checkCustomerProfile(latestData),
                ...addressStatus,
            });
        }
        const customerRef = firebase_js_1.db.collection("customers").doc();
        const payload = {
            customer_id: customerRef.id,
            username: "",
            email,
            password: "",
            fullname: displayName ?? "",
            profile_image: photoUrl ?? "",
            wallet_balance: 0,
            phone: "",
            birthday: null,
            gender: "",
            google_id: uid,
        };
        await customerRef.set(payload);
        const addressStatus = await getCustomerAddressSummary(customerRef.id);
        return res.json({
            ok: true,
            role: "customer",
            customer_id: customerRef.id,
            fullname: payload.fullname,
            username: payload.username,
            email: payload.email,
            phone: payload.phone,
            gender: payload.gender,
            birthday: payload.birthday,
            profile_image: payload.profile_image,
            wallet_balance: payload.wallet_balance,
            google_id: payload.google_id,
            isNewUser: true,
            ...checkCustomerProfile(payload),
            ...addressStatus,
        });
    }
    catch (error) {
        console.error("GOOGLE AUTH ERROR:", error);
        return res.status(400).json({
            ok: false,
            message: error?.message ??
                "Google auth failed",
        });
    }
});
