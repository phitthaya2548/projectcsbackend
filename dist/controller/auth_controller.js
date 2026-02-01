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
exports.routes = void 0;
const express_1 = require("express");
const bcrypt = __importStar(require("bcrypt"));
const firebase_js_1 = require("../config/firebase.js");
exports.routes = (0, express_1.Router)();
exports.routes.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ ok: false, message: "username/password required" });
        }
        const u = username.trim();
        const cQ = await firebase_js_1.db.collection("customers").where("username", "==", u).limit(1).get();
        if (!cQ.empty) {
            const doc = cQ.docs[0];
            const data = doc.data();
            if (!data.password) {
                return res.status(400).json({ ok: false, message: "บัญชีนี้ไม่มีรหัสผ่าน (สมัครผ่าน Google?)" });
            }
            const passOk = await bcrypt.compare(password, String(data.password));
            if (!passOk) {
                return res.status(400).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
            }
            return res.json({
                ok: true,
                role: "customer",
                docId: doc.id,
            });
        }
        const sQ = await firebase_js_1.db.collection("stores").where("username", "==", u).limit(1).get();
        if (!sQ.empty) {
            const doc = sQ.docs[0];
            const data = doc.data();
            if (!data.password) {
                return res.status(400).json({ ok: false, message: "บัญชีนี้ไม่มีรหัสผ่าน" });
            }
            const passOk = await bcrypt.compare(password, String(data.password));
            if (!passOk) {
                return res.status(400).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });
            }
            return res.json({
                ok: true,
                role: "store",
                docId: doc.id,
            });
        }
        return res.status(400).json({ ok: false, message: "ไม่พบบัญชีผู้ใช้" });
    }
    catch (e) {
        console.error("LOGIN ERROR:", e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
    }
});
