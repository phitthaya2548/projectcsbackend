import { Router } from "express";
import * as bcrypt from "bcrypt";
import { db, FieldValue } from "../config/firebase.ts";
export const router = Router();
router.post("/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res
                .status(400)
                .json({ ok: false, message: "username/password required" });
        }
        const u = username.trim();
        const dup = await db
            .collection("stores")
            .where("username", "==", u)
            .limit(1)
            .get();
        if (!dup.empty) {
            return res
                .status(400)
                .json({ ok: false, message: "Username ร้านค้านี้ถูกใช้แล้ว" });
        }
        const hashed = await bcrypt.hash(password, 12);
        const docRef = db.collection("stores").doc();
        const payload = {
            store_id: docRef.id,
            username: u,
            password: hashed,
            shop_name: '',
            phone: '',
            email: '',
            facebook_id: '',
            line_id: '',
            address: '',
            opening_hours: '',
            closed_hours: '',
            status: "TEMP_CLOSED",
            is_profile_completed: false,
            service_radius: 0,
            latitude: null,
            longitude: null,
            profile_image: '',
            wallet_balance: 0.0,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        };
        await docRef.set(payload);
        return res.json({ ok: true, store_id: docRef.id });
    }
    catch (e) {
        console.error("STORE SIGNUP ERROR:", e);
        return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
    }
});
//# sourceMappingURL=store_controller.js.map