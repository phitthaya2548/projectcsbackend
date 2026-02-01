import { Router } from "express";
import { db, auth, FieldValue } from "../config/firebase.ts";
import * as bcrypt from "bcrypt";
export const routes = Router();
routes.post("/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ ok: false, message: "username/password required" });
        }
        const u = username.trim();
        // 1) เช็คซ้ำ
        const dup = await db
            .collection("customers")
            .where("username", "==", u)
            .limit(1)
            .get();
        if (!dup.empty) {
            return res.status(400).json({ ok: false, message: "Username นี้ถูกใช้แล้ว" });
        }
        // 2) hash password
        const hashed = await bcrypt.hash(password, 12);
        // 3) สร้าง doc ใหม่
        const docRef = db.collection("customers").doc();
        const payload = {
            customer_id: docRef.id,
            username: u,
            email: '',
            password: hashed,
            fullname: '',
            profile_image: '',
            wallet_balance: 0.0,
            phone: '',
            birthday: '',
            gender: '',
            google_id: '',
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        };
        await docRef.set(payload);
        return res.json({ ok: true, customer_id: docRef.id });
    }
    catch (e) {
        console.error("SIGNUP ERROR:", e);
        return res.status(400).json({ ok: false, message: e.message ?? "Signup failed" });
    }
});
routes.post("/google", async (req, res) => {
    try {
        const { google_id } = req.body;
        if (!google_id) {
            return res.status(400).json({ ok: false, message: "idToken required" });
        }
        // 1) verify token
        const decoded = await auth.verifyIdToken(google_id);
        const uid = decoded.uid;
        const email = decoded.email;
        // 2) ดึงชื่อ/รูปจาก Firebase Auth
        const user = await auth.getUser(uid);
        const displayName = user.displayName ?? null;
        const photoUrl = user.photoURL ?? null;
        if (!email)
            throw new Error("ไม่พบอีเมลจาก Google");
        // 3) หา customer ด้วย email
        const q = await db.collection("customers").where("email", "==", email).limit(1).get();
        // ====== เจอ email แล้ว ======
        if (!q.empty) {
            const doc = q.docs[0];
            const data = doc.data();
            const existingGoogleId = String(data["google_id"] ?? "");
            // ✅ เคยสมัครด้วย Google แล้ว -> update profile + return
            if (existingGoogleId) {
                await doc.ref.update({
                    fullname: displayName ?? data["fullname"] ?? null,
                    profile_image: photoUrl ?? data["profile_image"] ?? null,
                    updated_at: FieldValue.serverTimestamp(),
                });
                const latest = await doc.ref.get();
                return res.json({
                    ok: true,
                    alreadyGoogleRegistered: true,
                    emailAlreadyExistsButNotGoogle: false,
                    isNewUser: false,
                    docId: latest.id,
                    ...latest.data(),
                });
            }
            // ⚠️ email เคยสมัครแบบ username/password มาก่อน (ยังไม่มี google_id)
            return res.json({
                ok: true,
                alreadyGoogleRegistered: false,
                emailAlreadyExistsButNotGoogle: true,
                isNewUser: false,
                docId: doc.id,
                ...data,
            });
        }
        // ====== ไม่เจอ email -> สมัครใหม่ ======
        const docRef = db.collection("customers").doc();
        const payload = {
            customer_id: docRef.id,
            username: '',
            email,
            password: '',
            fullname: displayName,
            profile_image: photoUrl,
            wallet_balance: 0.0,
            phone: '',
            birthday: '',
            gender: '',
            google_id: uid,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        };
        await docRef.set(payload);
        const created = await docRef.get();
        return res.json({
            ok: true,
            alreadyGoogleRegistered: false,
            emailAlreadyExistsButNotGoogle: false,
            isNewUser: true,
            docId: created.id,
            ...created.data(),
        });
    }
    catch (e) {
        console.error("GOOGLE AUTH ERROR:", e);
        return res.status(400).json({ ok: false, message: e.message ?? "Google auth failed" });
    }
});
//# sourceMappingURL=register_customer_controller.js.map