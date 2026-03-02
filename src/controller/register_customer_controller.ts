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

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "รหัสผ่านต้องอย่างน้อย 6 ตัว"
      });
    }

    const usernameChecks = await Promise.all([
      db.collection("customers").where("username", "==", u).limit(1).get(),
      db.collection("stores").where("username", "==", u).limit(1).get(),
      db.collection("riders").where("username", "==", u).limit(1).get(),
      db.collection("laundry_staff").where("username", "==", u).limit(1).get(),
    ]);

    if (usernameChecks.some(check => !check.empty)) {
      return res.status(409).json({
        ok: false,
        message: "Username นี้ถูกใช้แล้ว"
      });
    }

    const hashed = await bcrypt.hash(password, 12);
    const docRef = db.collection("customers").doc();

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

    await docRef.set(payload);

    return res.json({
      ok: true,
      customer_id: docRef.id
    });

  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: e?.message ?? "Signup failed"
    });
  }
});