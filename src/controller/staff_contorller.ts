import { Router } from "express";
import { db, bucket } from "../config/firebase";
import { upload } from "../middlewares/upload";
import bcrypt from "bcrypt";
import { LaundryStaff, StaffStatus } from "../modules/LaundryStaff";


export const router = Router();

router.post("/register", upload.single("profile_image"), async (req, res) => {
  try {
    let {
      username,
      password,
      email,
      fullname,
      phone,
    } = req.body;

    username = username?.trim();
    email = email?.trim();

    if (!username || !password || !email || !fullname || !phone) {
      return res.status(400).json({
        ok: false,
        message: "กรอกข้อมูลไม่ครบ",
      });
    }

    const [staffCheck, customerCheck, storeCheck, riderCheck] = await Promise.all([
      db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
      db.collection("customers").where("username", "==", username).limit(1).get(),
      db.collection("stores").where("username", "==", username).limit(1).get(),
      db.collection("riders").where("username", "==", username).limit(1).get(),
    ]);

    if (!staffCheck.empty || !customerCheck.empty || !storeCheck.empty || !riderCheck.empty) {
      return res.status(409).json({
        ok: false,
        message: "username นี้ถูกใช้งานแล้ว",
      });
    }

    const [staffEmailCheck, customerEmailCheck, storeEmailCheck, riderEmailCheck] = await Promise.all([
      db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
      db.collection("customers").where("email", "==", email).limit(1).get(),
      db.collection("stores").where("email", "==", email).limit(1).get(),
      db.collection("riders").where("email", "==", email).limit(1).get(),
    ]);

    if (
      !staffEmailCheck.empty ||
      !customerEmailCheck.empty ||
      !storeEmailCheck.empty ||
      !riderEmailCheck.empty
    ) {
      return res.status(409).json({
        ok: false,
        message: "email ถูกใช้แล้ว",
      });
    }
     const [staffPhoneCheck, customerPhoneCheck, storePhoneCheck, riderPhoneCheck] = await Promise.all([
      db.collection("laundry_staff").where("phone", "==", phone).limit(1).get(),
      db.collection("customers").where("phone", "==", phone).limit(1).get(),
      db.collection("stores").where("phone", "==", phone).limit(1).get(),
      db.collection("riders").where("phone", "==", phone).limit(1).get(),
    ]);

    if (
      !staffPhoneCheck.empty ||
      !customerPhoneCheck.empty ||
      !storePhoneCheck.empty ||
      !riderPhoneCheck.empty
    ) {
      return res.status(409).json({
        ok: false,
        message: "เบอร์โทร ถูกใช้แล้ว",
      });
    }
    const hashed = await bcrypt.hash(password, 10);
    let imageUrl: string | null = null;

    if (req.file) {
      const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
      const path = `laundry_staff/${Date.now()}_${safeName}`;

      const file = bucket.file(path);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
      });

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "2491-01-01",
      });

      imageUrl = url;
    }
    const laundryRef = db.collection("laundry_staff").doc();
    const staff_id = laundryRef.id;

    const staff: LaundryStaff = {
      staff_id,
      store_id: null,
      username,
      password: hashed,
      email,
      fullname,
      phone,
      profile_image: imageUrl,
      status: "TEMP_CLOSED" as StaffStatus,
    };

    await laundryRef.set(staff);

    return res.json({
      ok: true,
      message: "เพิ่มพนักงานซักอบสำเร็จ",
      staff_id,
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});router.post("/register", upload.single("profile_image"), async (req, res) => {
  try {
    let {
      username,
      password,
      email,
      fullname,
      phone,
    } = req.body;

    username = username?.trim();
    email = email?.trim();

    if (!username || !password || !email || !fullname || !phone) {
      return res.status(400).json({
        ok: false,
        message: "กรอกข้อมูลไม่ครบ",
      });
    }

    const [staffCheck, customerCheck, storeCheck, riderCheck] = await Promise.all([
      db.collection("laundry_staff").where("username", "==", username).limit(1).get(),
      db.collection("customers").where("username", "==", username).limit(1).get(),
      db.collection("stores").where("username", "==", username).limit(1).get(),
      db.collection("riders").where("username", "==", username).limit(1).get(),
    ]);

    if (!staffCheck.empty || !customerCheck.empty || !storeCheck.empty || !riderCheck.empty) {
      return res.status(409).json({
        ok: false,
        message: "username นี้ถูกใช้งานแล้ว",
      });
    }

    const [staffEmailCheck, customerEmailCheck, storeEmailCheck, riderEmailCheck] = await Promise.all([
      db.collection("laundry_staff").where("email", "==", email).limit(1).get(),
      db.collection("customers").where("email", "==", email).limit(1).get(),
      db.collection("stores").where("email", "==", email).limit(1).get(),
      db.collection("riders").where("email", "==", email).limit(1).get(),
    ]);

    if (
      !staffEmailCheck.empty ||
      !customerEmailCheck.empty ||
      !storeEmailCheck.empty ||
      !riderEmailCheck.empty
    ) {
      return res.status(409).json({
        ok: false,
        message: "email ถูกใช้แล้ว",
      });
    }
     const [staffPhoneCheck, customerPhoneCheck, storePhoneCheck, riderPhoneCheck] = await Promise.all([
      db.collection("laundry_staff").where("phone", "==", phone).limit(1).get(),
      db.collection("customers").where("phone", "==", phone).limit(1).get(),
      db.collection("stores").where("phone", "==", phone).limit(1).get(),
      db.collection("riders").where("phone", "==", phone).limit(1).get(),
    ]);

    if (
      !staffPhoneCheck.empty ||
      !customerPhoneCheck.empty ||
      !storePhoneCheck.empty ||
      !riderPhoneCheck.empty
    ) {
      return res.status(409).json({
        ok: false,
        message: "เบอร์โทร ถูกใช้แล้ว",
      });
    }
    const hashed = await bcrypt.hash(password, 10);
    let imageUrl: string | null = null;

    if (req.file) {
      const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
      const path = `laundry_staff/${Date.now()}_${safeName}`;

      const file = bucket.file(path);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
      });

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "2491-01-01",
      });

      imageUrl = url;
    }
    const laundryRef = db.collection("laundry_staff").doc();
    const staff_id = laundryRef.id;

    const staff: LaundryStaff = {
      staff_id,
      store_id: null,
      username,
      password: hashed,
      email,
      fullname,
      phone,
      profile_image: imageUrl,
      status: "TEMP_CLOSED" as StaffStatus,
    };

    await laundryRef.set(staff);

    return res.json({
      ok: true,
      message: "เพิ่มพนักงานซักอบสำเร็จ",
      staff_id,
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
router.put("/update/:id", upload.single("profile_image"), async (req, res) => {
  try {
    const staff_id = req.params.id as string;
    if (!staff_id) return res.status(400).json({ ok: false, message: "ไม่พบ staff_id" });

    const staffRef = db.collection("laundry_staff").doc(staff_id);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) return res.status(404).json({ ok: false, message: "ไม่พบพนักงาน" });

    let { email, fullname, phone } = req.body;
    const updateData: Partial<LaundryStaff> = {};

    

    if (email?.trim()) {
      email = email.trim().toLowerCase();
      updateData.email = email;
    }

    if (fullname?.trim()) updateData.fullname = fullname.trim();
    if (phone?.trim()) {
      phone = phone.trim();
      updateData.phone = phone;
    }

  
    if (email) {
      const [staff, customer, store, rider] = await Promise.all([
        db.collection("laundry_staff").where("email", "==", email).limit(10).get(),
        db.collection("customers").where("email", "==", email).limit(1).get(),
        db.collection("stores").where("email", "==", email).limit(1).get(),
        db.collection("riders").where("email", "==", email).limit(1).get(),
      ]);

      const duplicate = staff.docs.some(doc => doc.id !== staff_id);
      if (duplicate || !customer.empty || !store.empty || !rider.empty) {
        return res.status(409).json({ ok: false, message: "email นี้ถูกใช้งานแล้ว" });
      }
    }

    if (phone) {
      const [staff, customer, store, rider] = await Promise.all([
        db.collection("laundry_staff").where("phone", "==", phone).limit(10).get(),
        db.collection("customers").where("phone", "==", phone).limit(1).get(),
        db.collection("stores").where("phone", "==", phone).limit(1).get(),
        db.collection("riders").where("phone", "==", phone).limit(1).get(),
      ]);

      const duplicate = staff.docs.some(doc => doc.id !== staff_id);
      if (duplicate || !customer.empty || !store.empty || !rider.empty) {
        return res.status(409).json({ ok: false, message: "เบอร์โทรนี้ถูกใช้งานแล้ว" });
      }
    }

    if (req.file) {
      const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
      const filePath = `laundry_staff/${Date.now()}_${safeName}`;
      const file = bucket.file(filePath);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
      });

      await file.makePublic();
      updateData.profile_image = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ ok: false, message: "ไม่มีข้อมูลที่ต้องการแก้ไข" });
    }

    await staffRef.update(updateData);

    return res.json({ ok: true, message: "อัปเดตสำเร็จ" });
  } catch (err: any) {
    console.error("Update laundry staff error:", err);
    return res.status(500).json({ ok: false, message: err.message || "Server error" });
  }
});
router.put("/profile/status/:id", async (req, res) => {
  try {
    const staffId = req.params.id as string;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุสถานะพนักงานซักอบ",
      });
    }

    const allowedStatus = ["ONLINE", "TEMP_CLOSED"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: "สถานะไม่ถูกต้อง",
      });
    }

    const staffRef = db.collection("laundry_staff").doc(staffId);
    const snap = await staffRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    await staffRef.update({
      status: status,
      updated_at: new Date(),
    });

    return res.json({
      ok: true,
      message: "อัปเดตสถานะพนักงานซักอบสำเร็จ",
      data: {
        staff_id: staffId,
        status: status,
      },
    });

  } catch (e: any) {
    console.error("update laundry staff status error:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.get("/profile/status/:id", async (req, res) => {
  try {
    const staffId = req.params.id as string;
 
    const staffRef = db.collection("laundry_staff").doc(staffId);
    const snap = await staffRef.get();
 
    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }
 
    const data = snap.data();
 
    return res.json({
      ok: true,
      data: {
        staff_id: staffId,
        status: data?.status ?? "TEMP_CLOSED",
      },
    });
  } catch (e: any) {
    console.error("get laundry staff status error:", e);
    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const staff_id = req.params.id;

    const doc = await db.collection("laundry_staff").doc(staff_id).get();

    if (!doc.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    const data = doc.data();

    return res.json({
      ok: true,
      data,
    });

  } catch (e) {
    res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
router.get("/store/:id", async (req, res) => {
  try {
    const storeId = req.params.id;
    const storeRef = db.collection("stores").doc(storeId);

    const snapshot = await db
      .collection("laundry_staff")
      .where("store_id", "==", storeRef)
      .get();

    const staffList: LaundryStaff[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as Omit<LaundryStaff, "staff_id">;

      const staff: LaundryStaff = {
        staff_id: doc.id,
        ...data,
      };

      staffList.push(staff);
    });

    return res.json({
      ok: true,
      total: staffList.length,
      data: staffList,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
router.delete("/delete/:id", async (req, res) => {
  try {
    const staff_id = req.params.id as string;

    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบ staff_id",
      });
    }

    const staffRef = db.collection("laundry_staff").doc(staff_id);
    const staffsnap = await staffRef.get();

    if (!staffsnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    await staffRef.delete();

    return res.json({
      ok: true,
      message: "ลบพนักงานซักอบสำเร็จ",
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
});