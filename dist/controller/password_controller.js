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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const bcrypt = __importStar(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const firebase_1 = require("../config/firebase");
const generateOtp_1 = __importDefault(require("../utils/generateOtp"));
const mailer_1 = require("../utils/mailer");
exports.router = (0, express_1.Router)();
function hashOtp(otp) {
    return crypto_1.default.createHash("sha256").update(otp).digest("hex");
}
function validatePasswordStrength(password) {
    if (password.length < 6) {
        return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    }
    return null;
}
async function findUserByEmail(email) {
    const checks = await Promise.all([
        firebase_1.db.collection("customers").where("email", "==", email).limit(1).get(),
        firebase_1.db.collection("stores").where("email", "==", email).limit(1).get(),
        firebase_1.db.collection("riders").where("email", "==", email).limit(1).get(),
        firebase_1.db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
    ]);
    for (const snap of checks) {
        if (!snap.empty) {
            return snap.docs[0];
        }
    }
    return null;
}
exports.router.post("/forgot_password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                ok: false,
                message: "กรุณากรอกอีเมล",
            });
        }
        const userDoc = await findUserByEmail(email);
        if (!userDoc) {
            return res.json({
                ok: true,
                message: "หากอีเมลนี้มีอยู่ในระบบ จะมี OTP ถูกส่งไป",
            });
        }
        const otp = (0, generateOtp_1.default)(6);
        const otpHash = hashOtp(otp);
        const oldSnap = await firebase_1.db
            .collection("password_resets")
            .where("email", "==", email)
            .get();
        await Promise.all(oldSnap.docs.map((doc) => doc.ref.delete()));
        const resetData = {
            email: email,
            otp: otpHash,
            used: false,
        };
        const resetRef = firebase_1.db.collection("password_resets").doc();
        await resetRef.set(resetData);
        res.json({
            ok: true,
            message: "หากอีเมลนี้มีอยู่ในระบบ จะมี OTP ถูกส่งไป",
        });
        mailer_1.mailer
            .sendMail({
            from: `"WashAndDry Support" <${process.env.MAIL_FROM}>`,
            to: email,
            subject: "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน",
            text: `รหัส OTP ของคุณคือ ${otp}`,
            html: `
    <div style="font-family: sans-serif">
      <h2>รีเซ็ตรหัสผ่าน</h2>
      <p>รหัส OTP ของคุณคือ</p>
      <h1 style="letter-spacing: 4px">${otp}</h1>
    </div>
  `,
        })
            .catch((err) => {
            console.error("send mail failed:", err);
        });
        return;
    }
    catch (e) {
        console.error("forgot-password error:", e);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.post("/verify_otp", async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({
                ok: false,
                message: "กรุณากรอกข้อมูลให้ครบ",
            });
        }
        const resetSnap = await firebase_1.db
            .collection("password_resets")
            .where("email", "==", email)
            .limit(1)
            .get();
        if (resetSnap.empty) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบคำขอรีเซ็ตรหัสผ่าน กรุณาขอ OTP ใหม่",
            });
        }
        const resetDoc = resetSnap.docs[0];
        const resetData = resetDoc.data();
        if (resetData.used) {
            return res.status(400).json({
                ok: false,
                message: "OTP นี้ถูกใช้งานไปแล้ว",
            });
        }
        const isMatch = hashOtp(otp) === resetData.otp;
        if (!isMatch) {
            return res.status(400).json({
                ok: false,
                message: "OTP ไม่ถูกต้อง",
            });
        }
        return res.json({
            ok: true,
            message: "ยืนยัน OTP สำเร็จ",
        });
    }
    catch (e) {
        console.error("verify-otp error:", e);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
exports.router.post("/reset_password", async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                ok: false,
                message: "กรุณากรอกข้อมูลให้ครบ",
            });
        }
        const passwordError = validatePasswordStrength(newPassword);
        if (passwordError) {
            return res.status(400).json({
                ok: false,
                message: passwordError,
            });
        }
        const resetSnap = await firebase_1.db
            .collection("password_resets")
            .where("email", "==", email)
            .limit(1)
            .get();
        if (resetSnap.empty) {
            return res.status(400).json({
                ok: false,
                message: "ไม่พบคำขอรีเซ็ตรหัสผ่าน",
            });
        }
        const resetDoc = resetSnap.docs[0];
        const resetData = resetDoc.data();
        if (resetData.used) {
            return res.status(400).json({
                ok: false,
                message: "OTP นี้ถูกใช้งานไปแล้ว",
            });
        }
        const isMatch = hashOtp(otp) === resetData.otp;
        if (!isMatch) {
            return res.status(400).json({
                ok: false,
                message: "OTP ไม่ถูกต้อง",
            });
        }
        const userDoc = await findUserByEmail(email);
        if (!userDoc) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบบัญชีผู้ใช้",
            });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await userDoc.ref.update({
            password: hashedPassword,
        });
        await resetDoc.ref.update({
            used: true,
        });
        return res.json({
            ok: true,
            message: "รีเซ็ตรหัสผ่านสำเร็จ",
        });
    }
    catch (e) {
        console.error("reset-password error:", e);
        return res.status(500).json({
            ok: false,
            message: "Server error",
        });
    }
});
