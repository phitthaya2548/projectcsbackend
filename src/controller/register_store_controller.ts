import { Router } from "express";
import * as bcrypt from "bcrypt";
import { db } from "../config/firebase";
import { StoreData } from "../modules/store";

export const router = Router();
router.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return res
        .status(400)
        .json({ ok: false, message: "username/password required" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok:false,
        message:"รหัสผ่านต้องอย่างน้อย 6 ตัว"
      });
    }

    const u = username.trim();

    
    const storeCheck = await db
      .collection("stores")
      .where("username", "==", u)
      .limit(1)
      .get();

    if (!storeCheck.empty) {
      return res.status(400).json({
        ok:false,
        message:"Username นี้ถูกใช้แล้ว"
      });
    }


    const checkCustomer = await db
      .collection("customers")
      .where("username","==",u)
      .limit(1)
      .get();

    if (!checkCustomer.empty) {
      return res.status(400).json({
        ok:false,
        message:"Username นี้ถูกใช้แล้ว"
      });
    }


    const hashed = await bcrypt.hash(password, 12);

    const docRef = db.collection("stores").doc();

    const payload: StoreData = {
      store_id: docRef.id,
      username: u,
      password: hashed,
      store_name: '',
      phone: '',
      email: '',
      facebook: '',
      line_id: '',
      address: '',
      opening_hours: '',
      closed_hours: '',
      status: "ปิดชั่วคราว",
      service_radius: 0,
      latitude: 0,
      longitude: 0,
      profile_image: '',
      wallet_balance: 0.0,
    };

    await docRef.set(payload);

    return res.json({
      ok:true,
      store_id: docRef.id
    });

  } catch (e:any) {
    console.error("STORE SIGNUP ERROR:", e);
    return res.status(500).json({
      ok:false,
      message:e.message ?? "Server error"
    });
  }
});

