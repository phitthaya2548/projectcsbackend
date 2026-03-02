import { Router } from "express";
import * as bcrypt from "bcrypt";
import { auth, db } from "../config/firebase.js";
import { CustomerData } from "../modules/customer.js";
import { StoreData } from "../modules/store.js";



export const router = Router();

const isBlank = (v: any) => v == null || String(v).trim() === "";

function checkProfile(data: any, required: string[]) {
  const missing = required.filter((k) => isBlank(data?.[k]));

  return {
    profile_complete: missing.length === 0,
    missing_fields: missing,
  };
}

function checkCustomerProfile(data: Partial<CustomerData>) {
  return checkProfile(data, ["fullname", "phone", "email"]);
}

function checkStoreProfile(data: Partial<StoreData>) {
  return checkProfile(data, [
    "store_name",
    "phone",
    "opening_hours",
    "closed_hours",
    "latitude",
    "longitude",
    "service_radius",
  ]);
}

async function getCustomerAddressSummary(customerId: string) {
  const getaddr = db.collection("customer_addresses");
  
  const customerRef = db.doc(`customers/${customerId}`);


  const allsaddr = await getaddr.get();

  
  allsaddr.docs.forEach(doc => {
    const data = doc.data();
    console.log("Address doc:", {
      id: doc.id,
      customer_id_path: data.customer_id?.path,
      customer_id_raw: data.customer_id,
      status: data.status
    });
  });

  const activeQ = await getaddr
    .where("customer_id", "==", customerRef)
    .where("status", "==", true)
    .limit(1)
    .get();

  const allQ = await getaddr
    .where("customer_id", "==", customerRef)
    .get();



  return {
    address_complete: !activeQ.empty,
    address_count: allQ.size,
  };
}

async function findCustomerByUsername(username: string) {
  const q = await db
    .collection("customers")
    .where("username", "==", username)
    .limit(1)
    .get();

  return q.empty ? null : q.docs[0];
}

async function findStoreByUsername(username: string) {
  const q = await db
    .collection("stores")
    .where("username", "==", username)
    .limit(1)
    .get();

  return q.empty ? null : q.docs[0];
}

async function findCustomerByEmail(email: string) {
  const q = await db
    .collection("customers")
    .where("email", "==", email)
    .limit(1)
    .get();

  return q.empty ? null : q.docs[0];
}


router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: "username/password required",
      });
    }

    const u = username.trim();


    const customercDoc = await findCustomerByUsername(u);

    if (customercDoc) {
      const data = customercDoc.data() as Partial<CustomerData>;

      const hash = data.password;
      if (!hash) {
        return res.status(400).json({
          ok: false,
          message: "บัญชีนี้ไม่มีรหัสผ่าน (Google login?)",
        });
      }

      const passOk = await bcrypt.compare(password, hash);
      if (!passOk)
        return res.status(401).json({
          ok: false,
          message: "รหัสผ่านไม่ถูกต้อง",
        });

      const [addr, profileStatus] = await Promise.all([
        getCustomerAddressSummary(customercDoc.id),
        Promise.resolve(checkCustomerProfile(data)),
      ]);

      return res.json({
        ok: true,
        role: "customer",
        customer_id: data.customer_id ?? customercDoc.id,
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


    const storeDoc = await findStoreByUsername(u);

    if (storeDoc) {
      const data = storeDoc.data() as Partial<StoreData>;

      const hash = data.password;
      if (!hash) {
        return res.status(400).json({
          ok: false,
          message: "บัญชีนี้ไม่มีรหัสผ่าน",
        });
      }

      const passOk = await bcrypt.compare(password, hash);
      if (!passOk)
        return res.status(401).json({
          ok: false,
          message: "รหัสผ่านไม่ถูกต้อง",
        });

      const storeStatus = checkStoreProfile(data);

      return res.json({
        ok: true,
        role: "store",
        store_id: data.store_id ?? storeDoc.id,
        store_name: data.store_name ?? "",
        username: data.username ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        profile_image: data.profile_image ?? null,

        profile_complete: storeStatus.profile_complete,
        missing_fields: storeStatus.missing_fields,
      });
    }
 const getrider= await db
      .collection("riders")
      .where("username", "==", u)
      .limit(1)
      .get();

    if (!getrider.empty) {
      const doc = getrider.docs[0];
      const data = doc.data();
      const hash = data.password;



      const passOk = await bcrypt.compare(password, hash);
      if (!passOk) {
        return res.status(401).json({
          ok: false,
          message: "รหัสผ่านไม่ถูกต้อง",
        });
      }

      return res.json({
        ok: true,
        role: "rider",
        store_id: data.store_id?.id ?? "",
        rider_id: data.rider_id ?? doc.id,
        fullname: data.fullname ?? "",
        phone: data.phone ?? "",
        profile_image: data.profile_image ?? null,
      });
    }

    const getstaff = await db
      .collection("laundry_staff")
      .where("username", "==", u)
      .limit(1)
      .get();

    if (!getstaff.empty) {
      const doc = getstaff.docs[0];
      const data = doc.data();
      const hash = data.password;

      if (!hash) {
        return res.status(400).json({
          ok: false,
          message: "บัญชีนี้ไม่มีรหัสผ่าน",
        });
      }

      const passOk = await bcrypt.compare(password, hash);
      if (!passOk) {
        return res.status(401).json({
          ok: false,
          message: "รหัสผ่านไม่ถูกต้อง",
        });
      }

      return res.json({
        ok: true,
        role: "laundry_staff",
        store_id: data.store_id?.id ?? "",
        staff_id: data.staff_id ?? doc.id,
        fullname: data.fullname ?? "",
        phone: data.phone ?? "",
        profile_image: data.profile_image ?? null,
      });
    }
    return res.status(400).json({
      ok: false,
      message: "ไม่พบบัญชีผู้ใช้",
    });

  } catch (e: any) {
    console.error("LOGIN ERROR:", e);

    return res.status(500).json({
      ok: false,
      message: e?.message ?? "Server error",
    });
  }
});

router.post("/google", async (req, res) => {
  try {
    const { google_id } = req.body as { google_id?: string };

    if (!google_id)
      return res.status(400).json({
        ok: false,
        message: "idToken required",
      });
    const decoded = await auth.verifyIdToken(google_id);
    const uid = decoded.uid;
    const email = decoded.email;
    if (!email) throw new Error("ไม่พบอีเมลจาก Google");

    const user = await auth.getUser(uid);

    const displayName = user.displayName ?? null;
    const photoUrl = user.photoURL ?? null;

    const doc = await findCustomerByEmail(email);

    if (doc) {
      const data = doc.data() as Partial<CustomerData>;
      const update: Partial<CustomerData> = {
        google_id: uid,
      };
      if (displayName && (!data.fullname || data.fullname.trim() === '')) {
        update.fullname = displayName;
      }
      if (photoUrl && (!data.profile_image || data.profile_image.trim() === '')) {
        update.profile_image = photoUrl;
      }
      await doc.ref.update(update);
      const customerlatest = (await doc.ref.get()).data() as Partial<CustomerData>;
      const addr = await getCustomerAddressSummary(doc.id);
      const birthdayOut =
        customerlatest.birthday?.toDate?.()
          ? customerlatest.birthday.toDate().toISOString().slice(0, 10)
          : customerlatest.birthday ?? null;
      return res.json({
        ok: true,
        role: "customer",
        customer_id: doc.id,
        fullname: customerlatest.fullname ?? "",
        username: customerlatest.username ?? "",
        email: customerlatest.email ?? "",
        phone: customerlatest.phone ?? "",
        gender: customerlatest.gender ?? "",
        birthday: birthdayOut,
        profile_image: customerlatest.profile_image ?? "",
        wallet_balance: customerlatest.wallet_balance ?? 0,
        google_id: customerlatest.google_id ?? "",
        ...checkCustomerProfile(customerlatest),
        ...addr,
      });
    }

    const customterRef = db.collection("customers").doc();

    const payload: CustomerData = {
      customer_id: customterRef.id,
      username: "",
      email,
      password: "",
      fullname: displayName ?? "",
      profile_image: photoUrl ?? "",
      wallet_balance: 0,
      phone: "",
      birthday: null,
      gender: "",
      google_id: uid,
    };

    await customterRef.set(payload);

    const addr = await getCustomerAddressSummary(customterRef.id);

    return res.json({
      ok: true,
      role: "customer",
      customer_id: customterRef.id,
      fullname: payload.fullname,
      username: payload.username,
      email: payload.email,
      phone: payload.phone,
      gender: payload.gender,
      birthday: payload.birthday,
      profile_image: payload.profile_image,
      wallet_balance: payload.wallet_balance,
      google_id: payload.google_id,
      isNewUser: true,
      ...checkCustomerProfile(payload),
      ...addr,
    });

  } catch (e: any) {
    console.error("GOOGLE AUTH ERROR:", e);

    return res.status(400).json({
      ok: false,
      message: e.message ?? "Google auth failed",
    });
  }
});