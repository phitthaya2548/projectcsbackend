import { Router } from "express";
import { db, bucket } from "../config/firebase";
import { Rider } from "../modules/rider";
import { upload } from "../middlewares/upload";
import bcrypt from "bcrypt";


export const router = Router();

router.post("/register", upload.single("profile_image"), async (req, res) => {
  try {
    let {
      store_id,
      email,
      username,
      password,
      fullname,
      phone,
      vehicle_type,
      license_plate,
    } = req.body;
    store_id = store_id?.trim();
    email = email?.trim().toLowerCase();
    username = username?.trim();

    if (
      !store_id ||
      !email ||
      !username ||
      !password ||
      !fullname ||
      !phone ||
      !vehicle_type ||
      !license_plate
    ) {
      return res.status(400).json({
        ok: false,
        message: "กรอกข้อมูลไม่ครบ",
      });
    }
    
    
    const riderDoc = db.collection("riders").doc();
    const rider_id = riderDoc.id;

    
    const hashedPassword = await bcrypt.hash(password, 10);
    if(phone.length < 10 || phone.length > 10){
      return res.status(400).json({
        ok: false,
        message: "เบอร์โทรต้องมี 10 หลัก",
      });
    }
    
    const usernameChecks = await Promise.all([
  db.collection("riders").where("username", "==", username).limit(1).get(),
  db.collection("stores").where("username", "==", username).limit(1).get(),
  db.collection("customers").where("username", "==", username).limit(1).get(),
  db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
]);

if (usernameChecks.some(check => !check.empty)) {
  return res.status(409).json({
    ok: false,
    message: "username นี้ถูกใช้งานแล้ว",
  });
}


    const emailChecks = await Promise.all([
  db.collection("riders").where("email", "==", email).limit(1).get(),
  db.collection("stores").where("email", "==", email).limit(1).get(),
  db.collection("customers").where("email", "==", email).limit(1).get(),
  db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
]);

if (emailChecks.some(s => !s.empty)) {
  return res.status(409).json({
    ok: false,
    message: "email ถูกใช้แล้ว",
  });
}
    
   const storeRef = db.collection("stores").doc(store_id);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบ store",
      });
    }


    let imageUrl: string | null = null;

   if (req.file) {
  const safeName = (req.file.originalname || "profile")
    .replace(/[^\w.-]/g, "_");

  const path = `riders/${rider_id}_${Date.now()}_${safeName}`;
  const file = bucket.file(path);

  await file.save(req.file.buffer, {
    contentType: req.file.mimetype,
    resumable: false,
  });


  await file.makePublic();

  imageUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
}
    const rider: Rider = {
      rider_id,
      store_id: storeRef,
      email,
      username,
      password: hashedPassword,
      fullname,
      phone,
      vehicle_type,
      license_plate,
      profile_image: imageUrl,
      status: "ใช้งาน",
      latitude: null,
      longitude: null,
    };

    await riderDoc.set({
      ...rider,
    });

    return res.json({
      ok: true,
      message: "สมัคร Rider สำเร็จ",
      rider_id,
    });

  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: e.message,
    });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const rider_id = req.params.id;

    const ridersRef = await db.collection("riders").doc(rider_id).get();

    if (!ridersRef.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบ rider",
      });
    }

    const data = ridersRef.data();

    return res.json({
      ok: true,
      data,
    });

  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: e.message,
    });
  }
});
router.get("/store/:id", async (req, res) => {
  try {
    const store_id = req.params.id;
    
    const storeRef = db.collection("stores").doc(store_id);


    const snap = await db
      .collection("riders")
      .where("store_id", "==", storeRef)
      .get();

    if (snap.empty) {
      return res.json({
        ok: true,
        count: 0,
        data: [],
      });
    }

    const riders = snap.docs.map(doc => {
      const d = doc.data();

      return {
        rider_id: doc.id,
        email: d.email,
        username: d.username,
        full_name: d.full_name,
        phone: d.phone,
        vehicle_type: d.vehicle_type,
        license_plate: d.license_plate,
        profile_image: d.profile_image ?? null,
        status: d.status,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
      };
    });

    return res.json({
      ok: true,
      count: riders.length,
      data: riders,
    });

  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: e.message,
    });
  }
});
