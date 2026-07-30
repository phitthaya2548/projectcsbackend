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
const firebase_1 = require("../config/firebase");
exports.router = (0, express_1.Router)();
exports.router.post("/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res
                .status(400)
                .json({ ok: false, message: "กรุณาป้อนข้อมูลให้ครบ" });
        }
        if (password.length < 6) {
            return res.status(400).json({
                ok: false,
                message: "รหัสผ่านต้องอย่างน้อย 6 ตัว"
            });
        }
        const u = username.trim();
        const usernameChecks = await Promise.all([
            firebase_1.db.collection("stores").where("username", "==", u).limit(1).get(),
            firebase_1.db.collection("customers").where("username", "==", u).limit(1).get(),
            firebase_1.db.collection("riders").where("username", "==", u).limit(1).get(),
            firebase_1.db.collection("laundry_staff").where("username", "==", u).limit(1).get(),
        ]);
        if (usernameChecks.some(check => !check.empty)) {
            return res.status(409).json({
                ok: false,
                message: "Username นี้ถูกใช้แล้ว"
            });
        }
        const hashed = await bcrypt.hash(password, 12);
        const storeRef = firebase_1.db.collection("stores").doc();
        const payload = {
            store_id: storeRef.id,
            username: u,
            password: hashed,
            store_name: '',
            phone: '',
            email: '',
            facebook: '',
            line_id: '',
            address: '',
            delivery_max: 0,
            delivery_min: 0,
            opening_hours: '',
            closed_hours: '',
            status: "ปิดชั่วคราว",
            service_radius: 0,
            latitude: 0,
            longitude: 0,
            profile_image: '',
            wallet_balance: 0.0,
        };
        await storeRef.set(payload);
        return res.json({
            ok: true,
            store_id: storeRef.id
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: "Server error"
        });
    }
});
