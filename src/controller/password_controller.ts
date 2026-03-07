import { Router } from "express";
import * as bcrypt from "bcrypt";
import { db } from "../config/firebase";
import generateOtp from "../utils/generateOtp";
import { mailer } from "../utils/mailer";
import { PasswordResetData } from "../modules/reset_password";

export const router = Router();

async function findUserByEmail(email: string) {
  const checks = await Promise.all([
    db.collection("customers").where("email", "==", email).limit(1).get(),
    db.collection("stores").where("email", "==", email).limit(1).get(),
    db.collection("riders").where("email", "==", email).limit(1).get(),
    db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
  ]);

  for (const snap of checks) {
    if (!snap.empty) {
      return snap.docs[0];
    }
  }

  return null;
}

router.post("/forgot_password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        ok: false,
        message: "กรุณากรอกอีเมล",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const userDoc = await findUserByEmail(normalizedEmail);

    if (!userDoc) {
      return res.json({
        ok: true,
        message: "หากอีเมลนี้มีอยู่ในระบบ จะมี OTP ถูกส่งไป",
      });
    }

    const otp = generateOtp(6);
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const oldSnap = await db
      .collection("password_resets")
      .where("email", "==", normalizedEmail)
      .get();

    for (const doc of oldSnap.docs) {
      await doc.ref.delete();
    }

    const resetData: PasswordResetData = {
      email: normalizedEmail,
      otp: otpHash,
      expires_at: expiresAt,
      used: false,
    };

    const resetRef = db.collection("password_resets").doc();
    await resetRef.set(resetData);

    await mailer.sendMail({
      from: process.env.MAIL_FROM,
      to: normalizedEmail,
      subject: "รหัส OTP สำหรับรีเซ็ตรหัสผ่าน",
      text: `รหัส OTP ของคุณคือ ${otp} และจะหมดอายุใน 5 นาที`,
      html: `
        <div style="font-family: sans-serif">
          <h2>รีเซ็ตรหัสผ่าน</h2>
          <p>รหัส OTP ของคุณคือ</p>
          <h1 style="letter-spacing: 4px">${otp}</h1>
          <p>OTP นี้จะหมดอายุใน 5 นาที</p>
        </div>
      `,
    });

    return res.json({
      ok: true,
      message: "หากอีเมลนี้มีอยู่ในระบบ จะมี OTP ถูกส่งไป",
    });
  } catch (e) {
    console.error("forgot-password error:", e);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});

router.post("/reset_password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        ok: false,
        message: "กรุณากรอกข้อมูลให้ครบ",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "รหัสผ่านต้องอย่างน้อย 6 ตัว",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const resetSnap = await db
      .collection("password_resets")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (resetSnap.empty) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบคำขอรีเซ็ตรหัสผ่าน",
      });
    }

    const resetDoc = resetSnap.docs[0];
    const resetData = resetDoc.data() as PasswordResetData;

    if (resetData.used) {
      return res.status(400).json({
        ok: false,
        message: "OTP นี้ถูกใช้งานไปแล้ว",
      });
    }

    const expiresAt =
      resetData.expires_at instanceof Date
        ? resetData.expires_at
        : resetData.expires_at.toDate();

    if (new Date() > expiresAt) {
      return res.status(400).json({
        ok: false,
        message: "OTP หมดอายุแล้ว",
      });
    }

    const isMatch = await bcrypt.compare(otp, resetData.otp);

    if (!isMatch) {
      return res.status(400).json({
        ok: false,
        message: "OTP ไม่ถูกต้อง",
      });
    }

    const userDoc = await findUserByEmail(normalizedEmail);

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
  } catch (e) {
    console.error("reset-password error:", e);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});