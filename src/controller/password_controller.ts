import { Router } from "express";
import * as bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../config/firebase";
import generateOtp from "../utils/generateOtp";
import { mailer } from "../utils/mailer";
import { PasswordResetData } from "../modules/reset_password";

export const router = Router();

function hashOtp(otp: string) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  }
  if (!/[a-z]/.test(password)) {
    return "รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว";
  }
  if (!/[A-Z]/.test(password)) {
    return "รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว";
  }
  if (!/[0-9]/.test(password)) {
    return "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return "รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว (เช่น ! @ # $ %)";
  }
  return null;
}

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

    const userDoc = await findUserByEmail(email);

    if (!userDoc) {
      return res.json({
        ok: true,
        message: "หากอีเมลนี้มีอยู่ในระบบ จะมี OTP ถูกส่งไป",
      });
    }

    const otp = generateOtp(6);
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const oldSnap = await db
      .collection("password_resets")
      .where("email", "==", email)
      .get();

    await Promise.all(oldSnap.docs.map((doc) => doc.ref.delete()));

    const resetData: PasswordResetData = {
      email: email,
      otp: otpHash,
      expires_at: expiresAt,
      used: false,
    };

    const resetRef = db.collection("password_resets").doc();
    await resetRef.set(resetData);

    // แก้: await ให้ส่งเมลเสร็จ (หรือ fail ชัดเจน) ก่อนตอบ response
    // เดิมใช้ .catch() แบบ fire-and-forget ทำให้บน serverless
    // instance ถูก freeze ก่อนอีเมลจะถูกส่งจริง
    try {
      await mailer.sendMail({
        from: `"WashAndDry Support" <${process.env.MAIL_FROM}>`,
        to: email,
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
    } catch (mailErr) {
      console.error("send mail failed:", mailErr);

      // ส่งเมลไม่สำเร็จ ลบ reset doc ทิ้ง เพราะผู้ใช้จะไม่มี OTP ให้ verify อยู่ดี
      await resetRef.delete().catch(() => {});

      return res.status(500).json({
        ok: false,
        message: "ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่อีกครั้ง",
      });
    }

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

router.post("/verify_otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        ok: false,
        message: "กรุณากรอกข้อมูลให้ครบ",
      });
    }

    const resetSnap = await db
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
        : (resetData.expires_at as any).toDate();

    if (new Date() > expiresAt) {
      return res.status(400).json({
        ok: false,
        message: "OTP หมดอายุแล้ว กรุณาขอ OTP ใหม่",
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
  } catch (e) {
    console.error("verify-otp error:", e);
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

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({
        ok: false,
        message: passwordError,
      });
    }

    const resetSnap = await db
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
        : (resetData.expires_at as any).toDate();

    if (new Date() > expiresAt) {
      return res.status(400).json({
        ok: false,
        message: "OTP หมดอายุแล้ว",
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
  } catch (e) {
    console.error("reset-password error:", e);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});