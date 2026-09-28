import { Router } from "express";
import { db, bucket } from "../config/firebase";
import { Rider } from "../modules/rider";
import { upload } from "../middlewares/upload";
import bcrypt from "bcrypt";


export const router = Router();


router.post(
  "/register",
  upload.single("profile_image"),
  async (req, res) => {
    try {
      let {
        email,
        username,
        password,
        fullname,
        phone,
        vehicle_type,
        license_plate,
      } = req.body;

      email = email?.trim().toLowerCase();
      username = username?.trim();

      if (
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

      if (phone.length !== 10) {
        return res.status(400).json({
          ok: false,
          message: "เบอร์โทรต้องมี 10 หลัก",
        });
      }

      const riderDoc = db.collection("riders").doc();
      const rider_id = riderDoc.id;

      const usernameQueries = await Promise.all([
        db.collection("riders").where("username", "==", username).limit(1).get(),
        db.collection("stores").where("username", "==", username).limit(1).get(),
        db.collection("customers").where("username", "==", username).limit(1).get(),
        db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
      ]);

      if (usernameQueries.some(snap => !snap.empty)) {
        return res.status(409).json({
          ok: false,
          message: "username นี้ถูกใช้งานแล้ว",
        });
      }

      const emailQueries = await Promise.all([
        db.collection("riders").where("email", "==", email).limit(1).get(),
        db.collection("stores").where("email", "==", email).limit(1).get(),
        db.collection("customers").where("email", "==", email).limit(1).get(),
        db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
      ]);

      if (emailQueries.some(snap => !snap.empty)) {
        return res.status(409).json({
          ok: false,
          message: "email ถูกใช้แล้ว",
        });
      }

      const phoneQueries = await Promise.all([
        db.collection("riders").where("phone", "==", phone).limit(1).get(),
        db.collection("stores").where("phone", "==", phone).limit(1).get(),
        db.collection("customers").where("phone", "==", phone).limit(1).get(),
        db.collection("laundry_staff").where("phone", "==", phone).limit(1).get(),
      ]);

      if (phoneQueries.some(snap => !snap.empty)) {
        return res.status(409).json({
          ok: false,
          message: "เบอร์โทรถูกใช้แล้ว",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      let imageUrl: string | null = null;

      if (req.file) {
        const safeName = (req.file.originalname || "profile")
          .replace(/[^\w.-]/g, "_");

        const filePath = `riders/${rider_id}_${Date.now()}_${safeName}`;
        const file = bucket.file(filePath);

        await file.save(req.file.buffer, {
          contentType: req.file.mimetype,
          resumable: false,
        });

        await file.makePublic();

        imageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      }

      const rider: Rider = {
        rider_id,
        store_id: null,
        email,
        username,
        password: hashedPassword,
        fullname,
        phone,
        vehicle_type,
        license_plate,
        profile_image: imageUrl,
        status: "TEMP_CLOSED",
        latitude: null,
        longitude: null,
      };

      await riderDoc.set(rider);

      return res.status(201).json({
        ok: true,
        message: "สมัคร Rider สำเร็จ",
        rider_id,
      });
    } catch (error: any) {
      console.error("RIDER REGISTER ERROR:", error);

      return res.status(500).json({
        ok: false,
        message: "Server error",
      });
    }
  }
);

router.put("/update/:id", upload.single("profile_image"), async (req, res) => {
  try {
    const rider_id = req.params.id as string;
    if (!rider_id) return res.status(400).json({ ok: false, message: "ไม่พบ rider_id" });

    const riderRef = db.collection("riders").doc(rider_id);
    const riderSnap = await riderRef.get();
    if (!riderSnap.exists) return res.status(404).json({ ok: false, message: "ไม่พบ Rider" });

    let {  email, fullname, phone, vehicle_type, license_plate } = req.body;
    const updateData: Partial<Rider> = {};


    if (email !== undefined && email.trim() !== "") {
      email = email.trim().toLowerCase();
      updateData.email = email;
    }

    if (fullname !== undefined && fullname.trim() !== "") {
      updateData.fullname = fullname.trim();
    }

    if (phone !== undefined && phone.trim() !== "") {
      phone = phone.trim();

      if (phone.length !== 10) {
        return res.status(400).json({
          ok: false,
          message: "เบอร์โทรต้องมี 10 หลัก",
        });
      }

      updateData.phone = phone;
    }

    if (vehicle_type !== undefined && vehicle_type.trim() !== "") {
      updateData.vehicle_type = vehicle_type.trim();
    }

    if (license_plate !== undefined && license_plate.trim() !== "") {
      updateData.license_plate = license_plate.trim();
    }

   

    if (email) {
      const [riders, stores, customers, staff] = await Promise.all([
        db.collection("riders").where("email", "==", email).limit(10).get(),
        db.collection("stores").where("email", "==", email).limit(1).get(),
        db.collection("customers").where("email", "==", email).limit(1).get(),
        db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
      ]);

      const duplicate = riders.docs.some(doc => doc.id !== rider_id);

      if (duplicate || !stores.empty || !customers.empty || !staff.empty) {
        return res.status(409).json({
          ok: false,
          message: "email ถูกใช้แล้ว",
        });
      }
    }

    if (phone) {
      const [riders, stores, customers, staff] = await Promise.all([
        db.collection("riders").where("phone", "==", phone).limit(10).get(),
        db.collection("stores").where("phone", "==", phone).limit(1).get(),
        db.collection("customers").where("phone", "==", phone).limit(1).get(),
        db.collection("laundry_staff").where("phone", "==", phone).limit(1).get(),
      ]);

      const duplicate = riders.docs.some(doc => doc.id !== rider_id);

      if (duplicate || !stores.empty || !customers.empty || !staff.empty) {
        return res.status(409).json({
          ok: false,
          message: "เบอร์โทรถูกใช้งานแล้ว",
        });
      }
    }

    if (req.file) {
      const safeName = (req.file.originalname || "profile").replace(/[^\w.-]/g, "_");
      const filePath = `riders/${rider_id}_${Date.now()}_${safeName}`;
      const file = bucket.file(filePath);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
      });

      await file.makePublic();

      updateData.profile_image = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        ok: false,
        message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
      });
    }

    await riderRef.update(updateData);

    return res.json({
      ok: true,
      message: "อัปเดต Rider สำเร็จ",
    });
  } catch (error: any) {
    console.error("RIDER UPDATE ERROR:", error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Server error",
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
router.get("/profile/status/:id", async (req, res) => {
  try {
    const riderId = req.params.id as string;
 
    const riderRef = db.collection("riders").doc(riderId);
    const snap = await riderRef.get();
 
    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบ rider",
      });
    }
 
    const data = snap.data();
 
    return res.json({
      ok: true,
      data: {
        rider_id: riderId,
        status: data?.status ?? "TEMP_CLOSED",
      },
    });
  } catch (e: any) {
    console.error("get rider status error:", e);
    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
 
router.put("/profile/status/:id", async (req, res) => {
  try {
    const riderId = req.params.id as string;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุสถานะ rider",
      });
    }

    const allowedStatus = ["ONLINE", "TEMP_CLOSED"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: "สถานะไม่ถูกต้อง",
      });
    }

    const riderRef = db.collection("riders").doc(riderId);
    const snap = await riderRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบ rider",
      });
    }

    await riderRef.update({
      status: status,
    });

    return res.json({
      ok: true,
      message: "อัปเดตสถานะ rider สำเร็จ",
      data: {
        rider_id: riderId,
        status: status,
      },
    });

  } catch (e: any) {
    console.error("update rider status error:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const rider_id = req.params.id as string;

    if (!rider_id) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบ rider_id",
      });
    }

    const riderRef = db.collection("riders").doc(rider_id);
    const riderSnap = await riderRef.get();

    if (!riderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบ rider",
      });
    }

    await riderRef.delete();

    return res.json({
      ok: true,
      message: "ลบ Rider สำเร็จ",
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: e.message,
    });
  }
});