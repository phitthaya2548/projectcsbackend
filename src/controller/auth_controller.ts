import { Router } from "express";
import * as bcrypt from "bcrypt";
import { auth, db } from "../config/firebase.js";

export const router = Router();

const isBlank = (v: any) => v == null || String(v).trim() === "";

function checkProfile(data: any, required: string[]) {
  const missing = required.filter((k) => isBlank(data?.[k]));
  return {
    profile_complete: missing.length === 0,
    missing_fields: missing,
  };
}


function checkCustomerProfile(data: any) {
  return checkProfile(data, ["fullname", "phone", "email"]);
}
function checkStoreProfile(data: any) {
  return checkProfile(data, [
    "shop_name",
    "phone",
    "opening_hours",
    "closed_hours",
    "latitude",
    "longitude",
    "service_radius",
  ]);
}


async function getCustomerAddressSummary(customerId: string) {
  const col = db.collection("customer_addresses");

  const activeQ = await col
    .where("customer_id", "==", customerId)
    .where("status", "==", true)
    .limit(1)
    .get();

  const allQ = await col.where("customer_id", "==", customerId).get();

  return { address_complete: !activeQ.empty, address_count: allQ.size };
}


async function findCustomerByUsername(username: string) {
  const q = await db.collection("customers").where("username", "==", username).limit(1).get();
  return q.empty ? null : q.docs[0];
}

async function findStoreByUsername(username: string) {
  const q = await db.collection("stores").where("username", "==", username).limit(1).get();
  return q.empty ? null : q.docs[0];
}

async function findCustomerByEmail(email: string) {
  const q = await db.collection("customers").where("email", "==", email).limit(1).get();
  return q.empty ? null : q.docs[0];
}


router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "username/password required" });
    }

    const u = username.trim();

    const cDoc = await findCustomerByUsername(u);
    if (cDoc) {
      const data = cDoc.data() as any;

      const hash = data.password_hash ?? data.password;
      if (!hash) {
        return res.status(400).json({ ok: false, message: "บัญชีนี้ไม่มีรหัสผ่าน (สมัครผ่าน Google?)" });
      }

      const passOk = await bcrypt.compare(password, String(hash));
      if (!passOk) return res.status(401).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });

      const [addr, profileStatus] = await Promise.all([
        getCustomerAddressSummary(cDoc.id),
        Promise.resolve(checkCustomerProfile(data)),
      ]);

      return res.json({
        ok: true,
        role: "customer",
        customer_id: data.customer_id ?? cDoc.id,
        fullname: data.fullname ?? "",
        username: data.username ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        profile_image: data.profile_image ?? null,
        profile_complete: profileStatus.profile_complete,
        missing_fields: profileStatus.missing_fields,
        address_complete: addr.address_complete,
        address_count: addr.address_count,
      });
    }

    const sDoc = await findStoreByUsername(u);
    if (sDoc) {
      const data = sDoc.data() as any;

      const hash = data.password_hash ?? data.password;
      if (!hash) return res.status(400).json({ ok: false, message: "บัญชีนี้ไม่มีรหัสผ่าน" });

      const passOk = await bcrypt.compare(password, String(hash));
      if (!passOk) return res.status(401).json({ ok: false, message: "รหัสผ่านไม่ถูกต้อง" });

      const storeStatus = checkStoreProfile(data);

      return res.json({
        ok: true,
        role: "store",
        store_id: data.store_id,
        profile_complete: storeStatus.profile_complete,
        missing_fields: storeStatus.missing_fields,
      });
    }

    return res.status(400).json({ ok: false, message: "ไม่พบบัญชีผู้ใช้" });
  } catch (e: any) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({ ok: false, message: e?.message ?? "Server error" });
  }
});



router.post("/google", async (req, res) => {
  try {
    const { google_id } = req.body as { google_id?: string };
    if (!google_id) return res.status(400).json({ ok: false, message: "idToken required" });

    const decoded = await auth.verifyIdToken(google_id);
    const uid = decoded.uid;
    const email = decoded.email;
    if (!email) throw new Error("ไม่พบอีเมลจาก Google");

    const user = await auth.getUser(uid);
    const displayName = user.displayName ?? null;
    const photoUrl = user.photoURL ?? null;

    const doc = await findCustomerByEmail(email);

    if (doc) {
      const data = doc.data() as any;
      const existingGoogleId = String(data.google_id ?? "");

      if (existingGoogleId) {
        await doc.ref.update({
          fullname: displayName ?? data.fullname ?? null,
          profile_image: photoUrl ?? data.profile_image ?? null,
        });

        const latestSnap = await doc.ref.get();
        const latest = latestSnap.data() as any;
        const addr = await getCustomerAddressSummary(latestSnap.id);

        return res.json({
          ok: true,
          alreadyGoogleRegistered: true,
          emailAlreadyExistsButNotGoogle: false,
          isNewUser: false,
          role: "customer",
          customer_id: latestSnap.id,
          ...checkCustomerProfile(latest),
          ...addr,
        });
      }

      const addr = await getCustomerAddressSummary(doc.id);
      return res.json({
        ok: true,
        alreadyGoogleRegistered: false,
        emailAlreadyExistsButNotGoogle: true,
        isNewUser: false,
        role: "customer",
        customer_id: doc.id,
        ...checkCustomerProfile(data),
        ...addr,
      });
    }

    const docRef = db.collection("customers").doc();
    const payload = {
      customer_id: docRef.id,
      username: "",
      email,
      password: "",
      fullname: displayName,
      profile_image: photoUrl,
      wallet_balance: 0.0,
      phone: "",
      birthday: "",
      gender: "",
      google_id: uid,
    };

    await docRef.set(payload);

    const addr = await getCustomerAddressSummary(docRef.id);

    return res.json({
      ok: true,
      alreadyGoogleRegistered: false,
      emailAlreadyExistsButNotGoogle: false,
      isNewUser: true,
      role: "customer",
      customer_id: docRef.id,
      ...checkCustomerProfile(payload),
      ...addr,
    });
  } catch (e: any) {
    console.error("GOOGLE AUTH ERROR:", e);
    return res.status(400).json({ ok: false, message: e.message ?? "Google auth failed" });
  }
});
