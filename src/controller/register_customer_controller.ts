import { Router } from "express";
import { db,  } from "../config/firebase";
import { CustomerData } from "../modules/customer";
import * as bcrypt from "bcrypt";
export const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: "username/password required"
      });
    }

    const u = username.trim();
    if (!u) {
      return res.status(400).json({
        ok: false,
        message: "username invalid"
      });
    }

    const hashed = await bcrypt.hash(password, 12);

    const docRef = db.collection("customers").doc();

    await db.runTransaction(async (tx) => {

      // ✅ เช็ค customers
      const custQ = db
        .collection("customers")
        .where("username","==",u)
        .limit(1);

      const custSnap = await tx.get(custQ);

      if (!custSnap.empty) {
        throw new Error("Username นี้ถูกใช้แล้ว");
      }

      // ✅ เช็ค stores
      const storeQ = db
        .collection("stores")
        .where("username","==",u)
        .limit(1);

      const storeSnap = await tx.get(storeQ);

      if (!storeSnap.empty) {
        throw new Error("Username นี้ถูกใช้แล้ว");
      }

      // ✅ สร้าง user
      const payload: CustomerData = {
        customer_id: docRef.id,
        username: u,
        email: "",
        password: hashed,
        fullname: "",
        profile_image: "",
        wallet_balance: 0.0,
        phone: "",
        birthday: "",
        gender: "",
        google_id: "",
      };

      tx.set(docRef, payload);
    });

    return res.json({
      ok: true,
      customer_id: docRef.id
    });

  } catch (e:any) {

    const msg = e?.message ?? "Signup failed";
    const status = msg.includes("ถูกใช้แล้ว") ? 400 : 500;

    console.error("SIGNUP ERROR:", e);

    return res.status(status).json({
      ok: false,
      message: msg
    });
  }
});


