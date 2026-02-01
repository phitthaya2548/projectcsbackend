import { Router } from "express";
import * as bcrypt from "bcrypt";
import { db, FieldValue ,bucket} from "../config/firebase.js";
import admin from "firebase-admin";
import multer from "multer";
export const routes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
routes.get("/profile/:customerId", async (req, res) => {
  try {
    const customerId = req.params.customerId;

    const ref = db.collection("customers").doc(customerId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
    }

    const d = snap.data() as any;

 
    const toISO = (v: any): string | null => {
      if (!v) return null;
      if (typeof v === "string") return v;
      if (typeof v?.toDate === "function") return v.toDate().toISOString();
      return null;
    };

    // birthday: Timestamp -> "YYYY-MM-DD"
    const toYYYYMMDD = (v: any): string | null => {
      if (!v) return null;
      if (typeof v === "string") return v; // ถ้าคุณเก็บเป็น string อยู่แล้ว
      if (typeof v?.toDate === "function") {
        const dt = v.toDate();
        return dt.toISOString().slice(0, 10);
      }
      return null;
    };

    // ✅ คืนข้อมูลแบบที่แอพอยากได้ (ไม่ส่ง password)
    return res.json({
      ok: true,
      customer_id: snap.id,
      data: {
        customer_id: d.customer_id ?? snap.id,
        username: d.username ?? '',
        fullname: d.fullname ?? '',
        email: d.email ?? '',
        phone: d.phone ?? '',
        gender: d.gender ?? '',
        birthday: toYYYYMMDD(d.birthday),
        profile_image: d.profile_image ?? '',
        wallet_balance: Number(d.wallet_balance ?? 0),
        google_id: d.google_id ?? '',
        created_at: toISO(d.created_at),
        updated_at: toISO(d.updated_at),
      },
    });
  } catch (e: any) {
    console.error("GET PROFILE ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: e.message ?? "Server error" });
  }
});
routes.put("/profile/:id", upload.single("profile_image"), async (req, res) => {
  try {
    const customerId = req.params.id as string;

    const fullname = req.body.fullname;
    const email = req.body.email;
    const phone = req.body.phone;
    const gender = req.body.gender;
    const birthday = req.body.birthday;

    // normalize email (กันช่องว่าง/ตัวใหญ่เล็ก)
    const emailNorm =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    const update: Record<string, any> = {
      updated_at: FieldValue.serverTimestamp(),
    };

    if (fullname !== undefined) update.fullname = fullname || null;
    if (email !== undefined) update.email = emailNorm || null; // ✅ เก็บลง Firestore แบบ normalize
    if (phone !== undefined) update.phone = phone || null;
    if (gender !== undefined) update.gender = gender || null;

    // ✅ birthday เก็บเป็น Timestamp และเช็ค format
    if (birthday !== undefined) {
      if (!birthday) {
        update.birthday = null;
      } else {
        const d = new Date(birthday);
        if (Number.isNaN(d.getTime())) {
          return res
            .status(400)
            .json({ ok: false, message: "birthday invalid (use YYYY-MM-DD)" });
        }
        update.birthday = admin.firestore.Timestamp.fromDate(d);
      }
    }

    // ✅ upload รูป (optional)
    if (req.file) {
      const safeName = (req.file.originalname || "profile").replace(/[^\w.-]/g, "_");
      const objectPath = `customers/${customerId}/profile_${Date.now()}_${safeName}`;
      const file = bucket.file(objectPath);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
      });

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "2491-01-01",
      });

      update.profile_image = url;
    }

    // ✅ อัปเดต Firestore ก่อน
    await db.collection("customers").doc(customerId).set(update, { merge: true });

    // ✅ (สำคัญ) Sync email ไป Firebase Authentication
    // ถ้าส่ง email มา และไม่ว่าง -> updateUser ถ้ามี / createUser ถ้ายังไม่มี
    if (email !== undefined && emailNorm) {
      try {
        await admin.auth().updateUser(customerId, { email: emailNorm });
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          await admin.auth().createUser({
            uid: customerId, // ✅ ผูก uid ให้ตรง customerId
            email: emailNorm,
          });
        } else if (err.code === "auth/email-already-exists") {
          return res.status(409).json({
            ok: false,
            message: "อีเมลนี้ถูกใช้งานในระบบแล้ว",
          });
        } else if (err.code === "auth/invalid-email") {
          return res.status(400).json({
            ok: false,
            message: "รูปแบบอีเมลไม่ถูกต้อง",
          });
        } else {
          throw err;
        }
      }
    }

    // ✅ ดึงข้อมูลกลับมาส่ง response
    const snap = await db.collection("customers").doc(customerId).get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
    }

    const data = snap.data() as any;

    const createdAt = data.created_at?.toDate ? data.created_at.toDate().toISOString() : null;
    const updatedAt = data.updated_at?.toDate ? data.updated_at.toDate().toISOString() : null;
    const birthdayOut = data.birthday?.toDate ? data.birthday.toDate().toISOString().slice(0, 10) : null;

    return res.json({
      ok: true,
      customer_id: customerId,
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
        google_id: data.google_id ?? " ",
        created_at: createdAt,
        updated_at: updatedAt,
      },
    });
  } catch (e: any) {
    console.error("PROFILE UPDATE ERROR:", e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
});
