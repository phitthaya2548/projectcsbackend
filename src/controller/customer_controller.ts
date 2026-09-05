import { Router } from "express";

import { db, bucket} from "../config/firebase.js";
import admin from "firebase-admin";

import { CustomerAddress } from "../modules/address_customer.js";
import { CustomerData } from "../modules/customer.js";
import { upload } from "../middlewares/upload.js";
import { DistanceService } from "../services/haversine.js";
import { StoreData } from "../modules/store.js";
export const router = Router();
router.get("/profile/:customerId", async (req, res) => {
  try {
    const customerId = req.params.customerId;

    const customerref = db.collection("customers").doc(customerId);
    const resultcustomer = await customerref.get();

    if (!resultcustomer.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบลูกค้า" });
    }

    const data = resultcustomer.data() as CustomerData;

    return res.json({
      ok: true,
      customer_id: resultcustomer.id,
      data: {
        customer_id: data.customer_id ?? resultcustomer.id,
        username: data.username ?? '',
        fullname: data.fullname ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        gender: data.gender ?? '',
        birthday: (data.birthday),
        profile_image: data.profile_image ?? '',
        wallet_balance: Number(data.wallet_balance ?? 0),
        google_id: data.google_id ?? '',

      },
    });
  } catch (e: any) {
    console.error("GET PROFILE ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: e.message ?? "Server error" });
  }
});
router.put(
  "/profile/:id",
  upload.single("profile_image"),
  async (req, res) => {
    try {
      const customerId = req.params.id as string;

      const customerRef = db
        .collection("customers")
        .doc(customerId);

      const customerSnap = await customerRef.get();

      if (!customerSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบลูกค้า",
        });
      }

      const currentData =
        customerSnap.data() as CustomerData;

      const {
        fullname,
        email,
        phone,
        gender,
        birthday,
      } = req.body;

      const update: Partial<CustomerData> = {};

      const emailNorm =
        typeof email === "string"
          ? email.trim().toLowerCase()
          : "";

      const currentEmailNorm =
        String(currentData.email ?? "")
          .trim()
          .toLowerCase();

      if (
        currentData.google_id &&
        email !== undefined &&
        emailNorm !== currentEmailNorm
      ) {
        return res.status(400).json({
          ok: false,
          message: "บัญชี Google ไม่สามารถแก้ไขอีเมลได้",
        });
      }

      if (
        !currentData.google_id &&
        email !== undefined &&
        emailNorm
      ) {
        const emailSnap = await db
          .collection("customers")
          .where("email", "==", emailNorm)
          .limit(1)
          .get();

        if (
          !emailSnap.empty &&
          emailSnap.docs[0].id !== customerId
        ) {
          return res.status(409).json({
            ok: false,
            message: "อีเมลนี้ถูกใช้งานในระบบแล้ว",
          });
        }

        update.email = emailNorm;
      }

      if (phone !== undefined) {
        const phoneStr =
          String(phone).trim();

        if (!/^\d{10}$/.test(phoneStr)) {
          return res.status(400).json({
            ok: false,
            message: "เบอร์โทรต้องมี 10 หลัก",
          });
        }

        update.phone = phoneStr;
      }

      if (fullname !== undefined) {
        update.fullname =
          String(fullname).trim();
      }

      if (gender !== undefined) {
        update.gender =
          String(gender).trim();
      }

      if (birthday !== undefined) {
        update.birthday =
          birthday ? birthday : null;
      }

      if (req.file) {
        const safeName =
          (req.file.originalname || "profile")
            .replace(/[^\w.-]/g, "_");

        const objectPath =
          `customers/${customerId}/profile_${Date.now()}_${safeName}`;

        const file = bucket.file(objectPath);

        await file.save(req.file.buffer, {
          contentType: req.file.mimetype,
          resumable: false,
        });

        await file.makePublic();

        update.profile_image =
          `https://storage.googleapis.com/${bucket.name}/${file.name}`;
      }

      await customerRef.update(update);

      const updatedSnap =
        await customerRef.get();

      const data =
        updatedSnap.data() as CustomerData;

      const rawBirthday: any = data.birthday;

      const birthdayOut =
        typeof rawBirthday?.toDate === "function"
          ? rawBirthday
              .toDate()
              .toISOString()
              .slice(0, 10)
          : rawBirthday ?? null;

      return res.json({
        ok: true,
        customer_id: updatedSnap.id,
        data: {
          customer_id: updatedSnap.id,
          username: data.username ?? "",
          fullname: data.fullname ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          gender: data.gender ?? "",
          birthday: birthdayOut,
          profile_image:
            data.profile_image ?? "",
          wallet_balance:
            Number(data.wallet_balance ?? 0),
          google_id:
            data.google_id ?? "",
        },
      });
    } catch (e: any) {
      console.error(
        "PROFILE UPDATE ERROR:",
        e,
      );

      return res.status(500).json({
        ok: false,
        message:
          e.message ?? "Server error",
      });
    }
  },
);
router.post("/:id/link-google", async (req, res) => {
  try {
    const customerId = req.params.id as string;
    const { idToken } = req.body as { idToken?: string };

    if (!idToken) {
      return res.status(400).json({
        ok: false,
        message: "idToken required",
      });
    }
    const decoded = await admin.auth().verifyIdToken(idToken);

    const googleUid = decoded.uid;
    const email = decoded.email ?? null;

    if (!email) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบอีเมลจาก Google",
      });
    }
    const checkgoogle_id = await db
      .collection("customers")
      .where("google_id", "==", googleUid)
      .limit(1)
      .get();

    if (!checkgoogle_id.empty && checkgoogle_id.docs[0].id !== customerId) {
      return res.status(409).json({
        ok: false,
        message: "Google account นี้ถูกผูกกับบัญชีอื่นแล้ว",
      });
    }

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบบัญชีลูกค้า",
      });
    }

    const customerData = customerSnap.data() as Partial<CustomerData>;

    const googleEmail = email.trim().toLowerCase();
    const dbEmail = customerData?.email?.trim().toLowerCase();

    if (dbEmail && googleEmail !== dbEmail) {
      return res.status(400).json({
        ok: false,
        message: "อีเมล Google ต้องตรงกับอีเมลที่สมัครไว้",
      });
    }
    const user = await admin.auth().getUser(googleUid);

    const displayName = user.displayName ?? null;
    const photoUrl = user.photoURL ?? null;

    const update: Record<string, any> = {
      google_id: googleUid,
      google_linked_at: new Date(),
    };

    if (!dbEmail && googleEmail) {
      update.email = googleEmail;
    }


    if (displayName && (!customerData.fullname || customerData.fullname.trim() === '')) {
      update.fullname = displayName;
    }

    // อัปเดตรูปถ้ายังไม่มีหรือเป็นค่าว่าง
    if (photoUrl && (!customerData.profile_image || customerData.profile_image.trim() === '')) {
      update.profile_image = photoUrl;
    }

    await customerRef.set(update, { merge: true });

    
    const snap = await customerRef.get();
    const data = snap.data() as CustomerData;

    
    const birthdayOut =
      data.birthday?.toDate?.()
        ? data.birthday.toDate().toISOString().slice(0, 10)
        : data.birthday ?? null;

    return res.json({
      ok: true,
      message: "เชื่อม Google สำเร็จ",
      linked: true,
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
        google_id: data.google_id ?? "",
      },
    });

  } catch (e: any) {
    console.error("LINK GOOGLE ERROR:", e);
    return res.status(400).json({
      ok: false,
      message: e.message ?? "link google failed",
    });
  }
});

router.post("/addresses/:id", async (req, res) => {
  try {
    const customerId = req.params.id;

    const customerRef = db
      .collection("customers")
      .doc(customerId);

    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const {
      address_name,
      address_text,
      latitude,
      longitude,
      status,
    } = req.body;

    const addressName =
      typeof address_name === "string"
        ? address_name.trim()
        : "";

    const addressText =
      typeof address_text === "string"
        ? address_text.trim()
        : "";

    if (!addressName) {
      return res.status(400).json({
        ok: false,
        message: "address_name required",
      });
    }

    if (!addressText) {
      return res.status(400).json({
        ok: false,
        message: "address_text required",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      Number.isNaN(lat) ||
      lat < -90 ||
      lat > 90
    ) {
      return res.status(400).json({
        ok: false,
        message: "latitude invalid",
      });
    }

    if (
      Number.isNaN(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        ok: false,
        message: "longitude invalid",
      });
    }

    const isDefault =
      status === true || status === "true";

    const ref = db
      .collection("customer_addresses")
      .doc();

    const dataAddress: CustomerAddress = {
      customer_id: customerRef,
      address_name: addressName,
      address_text: addressText,
      latitude: lat,
      longitude: lng,
      status: isDefault,
    };

    if (isDefault) {
      const defaultAddressSnap = await db
        .collection("customer_addresses")
        .where("customer_id", "==", customerRef)
        .where("status", "==", true)
        .get();

      const batch = db.batch();

      defaultAddressSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: false,
        });
      });

      batch.set(ref, dataAddress);

      await batch.commit();
    } else {
      await ref.set(dataAddress);
    }

    return res.status(201).json({
      ok: true,
      message: "เพิ่มที่อยู่สำเร็จ",
      address_id: ref.id,
    });
  } catch (e) {
    console.error("CREATE ADDRESS ERROR:", e);

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});


router.get("/addresses/active/:id", async (req, res) => {
  try {
    const customerId = req.params.id;

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ customer_id",
      });
    }

    const customerRef = db
      .collection("customers")
      .doc(customerId);

    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const addressSnap = await db
      .collection("customer_addresses")
      .where("customer_id", "==", customerRef)
      .where("status", "==", true)
      .limit(1)
      .get();

    if (addressSnap.empty) {
      return res.json({
        ok: true,
        data: null,
      });
    }

    const doc = addressSnap.docs[0];
    const data = doc.data() as CustomerAddress;

    return res.json({
      ok: true,
      data: {
        address_id: doc.id,
        customer_id: customerId,
        address_name: data.address_name ?? "",
        address_text: data.address_text ?? "",
        latitude: data.latitude ?? 0,
        longitude: data.longitude ?? 0,
        status: data.status ?? false,
      },
    });
  } catch (e: any) {
    console.error("GET ACTIVE ADDRESS ERROR:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "server error",
    });
  }
});
router.get("/addresses/:id", async (req, res) => {
  try {
    const customerId = req.params.id;

    const customerRef = db
      .collection("customers")
      .doc(customerId);
  const customerSnap = await customerRef.get();
     if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const addressSnap = await db
      .collection("customer_addresses")
      .where("customer_id", "==", customerRef)
      .orderBy("status", "desc")
      .get();

    const data = addressSnap.docs.map(doc => {
      const dataaddr = doc.data() as CustomerAddress;

      return {
        address_id: doc.id,
        customer_id: dataaddr.customer_id.id,
        address_name: dataaddr.address_name,
        address_text: dataaddr.address_text,
        latitude: dataaddr.latitude,
        longitude: dataaddr.longitude,
        status: dataaddr.status,
      };
    });

    res.json({
      ok: true,
      count: data.length,
      data,
    });

  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});


router.put("/addresses/update/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const addressRef = db
      .collection("customer_addresses")
      .doc(id);

    const addressSnap = await addressRef.get();

    if (!addressSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "Address not found",
      });
    }

    const currentData =
      addressSnap.data() as CustomerAddress;

    const update: Partial<CustomerAddress> = {};

    if (req.body.address_name !== undefined) {
      const addressName =
        String(req.body.address_name).trim();

      if (!addressName) {
        return res.status(400).json({
          ok: false,
          message: "address_name required",
        });
      }

      update.address_name = addressName;
    }

    if (req.body.address_text !== undefined) {
      const addressText =
        String(req.body.address_text).trim();

      if (!addressText) {
        return res.status(400).json({
          ok: false,
          message: "address_text required",
        });
      }

      update.address_text = addressText;
    }

    if (req.body.latitude !== undefined) {
      const lat = Number(req.body.latitude);

      if (
        Number.isNaN(lat) ||
        lat < -90 ||
        lat > 90
      ) {
        return res.status(400).json({
          ok: false,
          message: "latitude invalid",
        });
      }

      update.latitude = lat;
    }

    if (req.body.longitude !== undefined) {
      const lng = Number(req.body.longitude);

      if (
        Number.isNaN(lng) ||
        lng < -180 ||
        lng > 180
      ) {
        return res.status(400).json({
          ok: false,
          message: "longitude invalid",
        });
      }

      update.longitude = lng;
    }

    let newStatus: boolean | undefined;

    if (req.body.status !== undefined) {
      newStatus =
        req.body.status === true ||
        req.body.status === "true";

      update.status = newStatus;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        ok: false,
        message: "No data to update",
      });
    }

    if (newStatus === true) {
      const customerRef =
        currentData.customer_id;

      const activeSnap = await db
        .collection("customer_addresses")
        .where("customer_id", "==", customerRef)
        .where("status", "==", true)
        .get();

      const batch = db.batch();

      activeSnap.docs.forEach((doc) => {
        if (doc.id !== id) {
          batch.update(doc.ref, {
            status: false,
          });
        }
      });

      batch.update(addressRef, update);

      await batch.commit();
    } else {
      await addressRef.update(update);
    }

    return res.json({
      ok: true,
      message: "อัปเดตที่อยู่สำเร็จ",
    });
  } catch (e) {
    console.error(
      "UPDATE ADDRESS ERROR:",
      e,
    );

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});
router.put("/addresses/status/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const addressRef = db
      .collection("customer_addresses")
      .doc(id);

    const addresssnap = await addressRef.get();

    if (!addresssnap.exists) {
      return res.status(404).json({ ok: false });
    }

    const data = addresssnap.data() as CustomerAddress;


    const customerRef = data.customer_id;

    const defaultAddress = await db
      .collection("customer_addresses")
      .where("customer_id", "==", customerRef)
      .where("status", "==", true)
      .get();

    const batch = db.batch();


    defaultAddress.docs.forEach(d =>
      batch.update(d.ref, { status: false })
    );

    batch.update(addressRef, { status: true });

    await batch.commit();

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});
router.delete("/addresses/delete/:id", async (req, res) => {
  try {
    const ref = db
      .collection("customer_addresses")
      .doc(req.params.id);

    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "Address not found",
      });
    }

    await ref.delete();

    res.json({ ok: true ,message: "ลบข้อมูลที่อยู่ลูกค้าสำเร็จ"});

  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});


router.get("/getstores", async (req, res) => {
  try {
    const search = (req.query.search as string || "").trim();

    const customerLat = Number(req.query.lat);
    const customerLng = Number(req.query.lng);

    const storesnap = await db.collection("stores").where("status","!=","PENDING").get();

    let data = storesnap.docs.map(data => {
      const storeData = data.data() as StoreData;

      let distance = 0;
      if (!isNaN(customerLat) && !isNaN(customerLng)) {
        distance = DistanceService.haversineKm(customerLat, customerLng, storeData.latitude, storeData.longitude);
      }

      return {
        store_id: data.id,
        store_name: storeData.store_name ?? "",
        profile_image: storeData.profile_image ?? "",
        opening: `${storeData.opening_hours ?? ""} - ${storeData.closed_hours ?? ""}`,
        distance_km: Number(distance.toFixed(1)),
        status: storeData.status ?? "TEMP_CLOSED",
      };
    });

    if (search) {
      data = data.filter(s =>
  s.store_name.toLowerCase().includes(search.toLowerCase())
);
    }

    data = data.slice(0, 20);

    res.json({ ok: true, data });

  } catch (e) {
    res.status(500).json({ ok: false, message: "server error" });
  }
});