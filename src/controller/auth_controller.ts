import { Router } from "express";
import * as bcrypt from "bcrypt";
import { db } from "../config/firebase.js";

export const routes = Router();


routes.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "username/password required" });
    }

    const u = username.trim();


    const cQ = await db.collection("customers").where("username", "==", u).limit(1).get();
    if (!cQ.empty) {
      const doc = cQ.docs[0];
      const data = doc.data() as any;

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

  
    const sQ = await db.collection("stores").where("username", "==", u).limit(1).get();
    if (!sQ.empty) {
      const doc = sQ.docs[0];
      const data = doc.data() as any;

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
  } catch (e: any) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
});
