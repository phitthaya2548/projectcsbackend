import { Router } from "express";
import { db, bucket } from "../config/firebase";
import { upload } from "../middlewares/upload";
import bcrypt from "bcrypt";
import { LaundryStaff } from "../modules/LaundryStaff";


export const router = Router();

router.post("/register", upload.single("profile_image"), async (req, res) => {
  try {
    let {
      store_id,
      username,
      password,
      email,
      fullname,
      phone,
    } = req.body;

    store_id = store_id?.trim();
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
    const storeRef = db.collection("stores").doc(store_id);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
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
      store_id: storeRef,
      username,
      password: hashed,
      email,
      fullname,
      phone,
      profile_image: imageUrl,
      status: "ใช้งาน",
    };

    await laundryRef.set(staff);

    return res.json({
      ok: true,
      message: "เพิ่มพนักงานซักอบสำเร็จ",
      staff_id,
    });

  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: e.message,
    });
  }
});
router.put("/update/:id", upload.single("profile_image"), async (req, res) => {
  try {
    const staff_id = req.params.id as string;
    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบ staff_id",
      });
    }

    const staffRef = db.collection("laundry_staff").doc(staff_id);
    const snap = await staffRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    const { username, password, email, fullname, phone, status } = req.body;

    const updateData: Partial<LaundryStaff> = {};

    if (username !== undefined && username.trim() !== "") {
      updateData.username = username.trim();
    }

    if (email !== undefined && email.trim() !== "") {
      updateData.email = email.trim().toLowerCase();
    }

    if (fullname !== undefined && fullname.trim() !== "") {
      updateData.fullname = fullname.trim();
    }

    if (phone !== undefined && phone.trim() !== "") {
      updateData.phone = phone.trim();
    }

    if (status !== undefined && status.trim() !== "") {
      updateData.status = status;
    }

    if (password !== undefined && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    if (req.file) {
      const safeName = req.file.originalname.replace(/[^\w.-]/g, "_");
      const path = `laundry_staff/${Date.now()}_${safeName}`;
      const file = bucket.file(path);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
      });

      await file.makePublic();

      const publicUrl =
        `https://storage.googleapis.com/${bucket.name}/${file.name}`;

      updateData.profile_image = publicUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        ok: false,
        message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
      });
    }

    await staffRef.update(updateData);

    return res.json({
      ok: true,
      message: "อัปเดตสำเร็จ",
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      message: err.message,
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