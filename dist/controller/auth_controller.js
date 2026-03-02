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
        "store_name",
        "phone",
        "opening_hours",
        "closed_hours",
        "latitude",
        "longitude",
        "service_radius",
    ]);
}
async function getCustomerAddressSummary(customerId) {
    const getaddr = firebase_js_1.db.collection("customer_addresses");
    const customerRef = firebase_js_1.db.doc(`customers/${customerId}`);
    const allsaddr = await getaddr.get();
    allsaddr.docs.forEach(doc => {
        const data = doc.data();
        console.log("Address doc:", {
            id: doc.id,
            customer_id_path: data.customer_id?.path,
            customer_id_raw: data.customer_id,
            status: data.status
        });
    });
    const activeQ = await getaddr
        .where("customer_id", "==", customerRef)
        .where("status", "==", true)
        .limit(1)
        .get();
    const allQ = await getaddr
        .where("customer_id", "==", customerRef)
        .get();
    return {
        address_complete: !activeQ.empty,
        address_count: allQ.size,
    };
}
async function findCustomerByUsername(username) {
    const q = await firebase_js_1.db
        .collection("customers")
        .where("username", "==", username)
        .limit(1)
        .get();
    return q.empty ? null : q.docs[0];
}
async function findStoreByUsername(username) {
    const q = await firebase_js_1.db
        .collection("stores")
        .where("username", "==", username)
        .limit(1)
        .get();
    return q.empty ? null : q.docs[0];
}
async function findCustomerByEmail(email) {
    const q = await firebase_js_1.db
        .collection("customers")
        .where("email", "==", email)
        .limit(1)
        .get();
    return q.empty ? null : q.docs[0];
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
        const u = username.trim();
        const customercDoc = await findCustomerByUsername(u);
        if (customercDoc) {
            const data = customercDoc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน (Google login?)",
                });
            }
            const passOk = await bcrypt.compare(password, hash);
            if (!passOk)
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            const [addr, profileStatus] = await Promise.all([
                getCustomerAddressSummary(customercDoc.id),
                Promise.resolve(checkCustomerProfile(data)),
            ]);
            return res.json({
                ok: true,
                role: "customer",
                customer_id: data.customer_id ?? customercDoc.id,
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
        const storeDoc = await findStoreByUsername(u);
        if (storeDoc) {
            const data = storeDoc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน",
                });
            }
            const passOk = await bcrypt.compare(password, hash);
            if (!passOk)
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            const storeStatus = checkStoreProfile(data);
            return res.json({
                ok: true,
                role: "store",
                store_id: data.store_id ?? storeDoc.id,
                store_name: data.store_name ?? "",
                username: data.username ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
                profile_complete: storeStatus.profile_complete,
                missing_fields: storeStatus.missing_fields,
            });
        }
        const getrider = await firebase_js_1.db
            .collection("riders")
            .where("username", "==", u)
            .limit(1)
            .get();
        if (!getrider.empty) {
            const doc = getrider.docs[0];
            const data = doc.data();
            const hash = data.password;
            const passOk = await bcrypt.compare(password, hash);
            if (!passOk) {
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            }
            return res.json({
                ok: true,
                role: "rider",
                store_id: data.store_id?.id ?? "",
                rider_id: data.rider_id ?? doc.id,
                fullname: data.fullname ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
            });
        }
        const getstaff = await firebase_js_1.db
            .collection("laundry_staff")
            .where("username", "==", u)
            .limit(1)
            .get();
        if (!getstaff.empty) {
            const doc = getstaff.docs[0];
            const data = doc.data();
            const hash = data.password;
            if (!hash) {
                return res.status(400).json({
                    ok: false,
                    message: "บัญชีนี้ไม่มีรหัสผ่าน",
                });
            }
            const passOk = await bcrypt.compare(password, hash);
            if (!passOk) {
                return res.status(401).json({
                    ok: false,
                    message: "รหัสผ่านไม่ถูกต้อง",
                });
            }
            return res.json({
                ok: true,
                role: "laundry_staff",
                store_id: data.store_id?.id ?? "",
                staff_id: data.staff_id ?? doc.id,
                fullname: data.fullname ?? "",
                phone: data.phone ?? "",
                profile_image: data.profile_image ?? null,
            });
        }
        return res.status(400).json({
            ok: false,
            message: "ไม่พบบัญชีผู้ใช้",
        });
    }
    catch (e) {
        console.error("LOGIN ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e?.message ?? "Server error",
        });
    }
});
exports.router.post("/google", async (req, res) => {
    try {
        const { google_id } = req.body;
        if (!google_id)
            return res.status(400).json({
                ok: false,
                message: "idToken required",
            });
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
            const update = {
                google_id: uid,
            };
            if (displayName && (!data.fullname || data.fullname.trim() === '')) {
                update.fullname = displayName;
            }
            if (photoUrl && (!data.profile_image || data.profile_image.trim() === '')) {
                update.profile_image = photoUrl;
            }
            await doc.ref.update(update);
            const customerlatest = (await doc.ref.get()).data();
            const addr = await getCustomerAddressSummary(doc.id);
            const birthdayOut = customerlatest.birthday?.toDate?.()
                ? customerlatest.birthday.toDate().toISOString().slice(0, 10)
                : customerlatest.birthday ?? null;
            return res.json({
                ok: true,
                role: "customer",
                customer_id: doc.id,
                fullname: customerlatest.fullname ?? "",
                username: customerlatest.username ?? "",
                email: customerlatest.email ?? "",
                phone: customerlatest.phone ?? "",
                gender: customerlatest.gender ?? "",
                birthday: birthdayOut,
                profile_image: customerlatest.profile_image ?? "",
                wallet_balance: customerlatest.wallet_balance ?? 0,
                google_id: customerlatest.google_id ?? "",
                ...checkCustomerProfile(customerlatest),
                ...addr,
            });
        }
        const customterRef = firebase_js_1.db.collection("customers").doc();
        const payload = {
            customer_id: customterRef.id,
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
        await customterRef.set(payload);
        const addr = await getCustomerAddressSummary(customterRef.id);
        return res.json({
            ok: true,
            role: "customer",
            customer_id: customterRef.id,
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
            ...addr,
        });
    }
    catch (e) {
        console.error("GOOGLE AUTH ERROR:", e);
        return res.status(400).json({
            ok: false,
            message: e.message ?? "Google auth failed",
        });
    }
});
