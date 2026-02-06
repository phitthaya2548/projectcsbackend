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
const isBlank = (v) => v == null || String(v).trim() === "";
function checkProfile(data, required) {
    const missing = required.filter((k) => isBlank(data?.[k]));
    return {
        profile_complete: missing.length === 0,
        missing_fields: missing,
    };
}
function checkCustomerProfile(data) {
    return checkProfile(data, ["fullname", "phone", "email"]);
}
function checkStoreProfile(data) {
    return checkProfile(data, [
        "shop_name",
        "phone",
        "opening_hours",
        "closed_hours",
        "latitude",
        "longitude",
        "service_radius",
    ]);
}
async function getCustomerAddressSummary(customerId) {
    const col = firebase_js_1.db.collection("customer_addresses");
    const activeQ = await col
        .where("customer_id", "==", customerId)
        .where("status", "==", true)
        .limit(1)
        .get();
    const allQ = await col.where("customer_id", "==", customerId).get();
    return { address_complete: !activeQ.empty, address_count: allQ.size };
}
async function findCustomerByUsername(username) {
    const q = await firebase_js_1.db.collection("customers").where("username", "==", username).limit(1).get();
    return q.empty ? null : q.docs[0];
}
async function findStoreByUsername(username) {
    const q = await firebase_js_1.db.collection("stores").where("username", "==", username).limit(1).get();
    return q.empty ? null : q.docs[0];
}
async function findCustomerByEmail(email) {
    const q = await firebase_js_1.db.collection("customers").where("email", "==", email).limit(1).get();
    return q.empty ? null : q.docs[0];
}
exports.router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ ok: false, message: "username/password required" });
        }
        const u = username.trim();
        const cDoc = await findCustomerByUsername(u);
        if (cDoc) {
            const data = cDoc.data();
            const hash = data.password_hash ?? data.password;
            if (!hash) {
                return res.status(400).json({ ok: false, message: "บัญชีนี้ไม่มีรหัสผ่าน (สมัครผ่าน Google?)" });
            }
            const passOk = await bcrypt.compare(password, String(hash));
            if (!passOk)
                return res.status(401).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
            const [addr, profileStatus] = await Promise.all([
                getCustomerAddressSummary(cDoc.id),
                Promise.resolve(checkCustomerProfile(data)),
            ]);
            return res.json({
                ok: true,
                role: "customer",
                customer_id: data.customer_id ?? cDoc.id,
                fullname: data.fullname ?? "",
                username: data.username ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
                profile_complete: profileStatus.profile_complete,
                missing_fields: profileStatus.missing_fields,
                address_complete: addr.address_complete,
                address_count: addr.address_count,
            });
        }
        const sDoc = await findStoreByUsername(u);
        if (sDoc) {
            const data = sDoc.data();
            const hash = data.password_hash ?? data.password;
            if (!hash)
                return res.status(400).json({ ok: false, message: "บัญชีนี้ไม่มีรหัสผ่าน" });
            const passOk = await bcrypt.compare(password, String(hash));
            if (!passOk)
                return res.status(401).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
            const storeStatus = checkStoreProfile(data);
            return res.json({
                ok: true,
                role: "store",
                store_id: data.store_id,
                profile_complete: storeStatus.profile_complete,
                missing_fields: storeStatus.missing_fields,
            });
        }
        return res.status(400).json({ ok: false, message: "ไม่พบบัญชีผู้ใช้" });
    }
    catch (e) {
        console.error("LOGIN ERROR:", e);
        return res.status(500).json({ ok: false, message: e?.message ?? "Server error" });
    }
});
exports.router.post("/google", async (req, res) => {
    try {
        const { google_id } = req.body;
        if (!google_id)
            return res.status(400).json({ ok: false, message: "idToken required" });
        const decoded = await firebase_js_1.auth.verifyIdToken(google_id);
        const uid = decoded.uid;
        const email = decoded.email;
        if (!email)
            throw new Error("ไม่พบอีเมลจาก Google");
        const user = await firebase_js_1.auth.getUser(uid);
        const displayName = user.displayName ?? null;
        const photoUrl = user.photoURL ?? null;
        const doc = await findCustomerByEmail(email);
        if (doc) {
            const data = doc.data();
            const existingGoogleId = String(data.google_id ?? "");
            if (existingGoogleId) {
                await doc.ref.update({
                    fullname: displayName ?? data.fullname ?? null,
                    profile_image: photoUrl ?? data.profile_image ?? null,
                });
                const latestSnap = await doc.ref.get();
                const latest = latestSnap.data();
                const addr = await getCustomerAddressSummary(latestSnap.id);
                return res.json({
                    ok: true,
                    alreadyGoogleRegistered: true,
                    emailAlreadyExistsButNotGoogle: false,
                    isNewUser: false,
                    role: "customer",
                    customer_id: latestSnap.id,
                    ...checkCustomerProfile(latest),
                    ...addr,
                });
            }
            const addr = await getCustomerAddressSummary(doc.id);
            return res.json({
                ok: true,
                alreadyGoogleRegistered: false,
                emailAlreadyExistsButNotGoogle: true,
                isNewUser: false,
                role: "customer",
                customer_id: doc.id,
                ...checkCustomerProfile(data),
                ...addr,
            });
        }
        const docRef = firebase_js_1.db.collection("customers").doc();
        const payload = {
            customer_id: docRef.id,
            username: "",
            email,
            password: "",
            fullname: displayName,
            profile_image: photoUrl,
            wallet_balance: 0.0,
            phone: "",
            birthday: "",
            gender: "",
            google_id: uid,
        };
        await docRef.set(payload);
        const addr = await getCustomerAddressSummary(docRef.id);
        return res.json({
            ok: true,
            alreadyGoogleRegistered: false,
            emailAlreadyExistsButNotGoogle: false,
            isNewUser: true,
            role: "customer",
            customer_id: docRef.id,
            ...checkCustomerProfile(payload),
            ...addr,
        });
    }
    catch (e) {
        console.error("GOOGLE AUTH ERROR:", e);
        return res.status(400).json({ ok: false, message: e.message ?? "Google auth failed" });
    }
});
