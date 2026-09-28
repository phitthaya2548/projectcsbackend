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
        .json({ ok: false, message: "กรุณาป้อนข้อมูลให้ครบ" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "รหัสผ่านต้องอย่างน้อย 6 ตัว"
      });
    }

    const u = username.trim();

    
    

    const hashed = await bcrypt.hash(password, 12);

    const storeRef = db.collection("stores").doc();

    const payload: StoreData = {
      store_id: storeRef.id,
      username: u,
      password: hashed,
      store_name: '',
      phone: '',
      email: '',
      facebook: '',
      line_id: '',
      address: '',
      delivery_max:0,
      delivery_min:0,
      opening_hours: '',
      closed_hours: '',
detergent_price: 0,
      status: "PENDING",
      service_radius: 0,
      is_hiring: false,
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

  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Server error"
    });
  }
});