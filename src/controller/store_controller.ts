import { Router } from "express";

import { db, bucket} from "../config/firebase";
import admin from "firebase-admin";

import { Machine, MACHINE_STATUS} from "../modules/machine";
import { StoreImage } from "../modules/image_store";
import { upload } from "../middlewares/upload";
import { StoreData,StoreStatus } from "../modules/store";

export const router = Router();

router.put("/profile/:id", upload.single("profile_image"), async (req, res) => {
  try {
    const storeId = req.params.id as string;
    const ref = db.collection("stores").doc(storeId);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
    }

    const oldData = doc.data() || {};
    const {
      store_name,
      email,
      phone,
      address,
      opening_hours,
      closed_hours,
      service_radius,
      latitude,
      longitude,
      facebook,
      line_id,
      status,
      delivery_min,
      delivery_max,
      detergent_price
    } = req.body;

    const collections = ["stores", "customers", "riders", "laundry_staff"];

    if (store_name == null || store_name.trim() === "") {
      return res.status(400).json({ ok: false, message: "โปรดกรอกชื่อร้าน" });
    }

    if (email == null || email.trim() === "") {
      return res.status(400).json({ ok: false, message: "โปรดกรอกอีเมล" });
    }

    if (phone == null || phone.trim() === "") {
      return res.status(400).json({ ok: false, message: "โปรดกรอกเบอร์โทร" });
    }
    if (phone.trim().length < 9 || phone.trim().length > 10) {
      return res.status(400).json({ ok: false, message: "เบอร์โทรไม่ถูกต้อง" });
    }

    const storeNameValue = store_name.trim();
    const emailValue = email.trim().toLowerCase();
    const phoneValue = phone.trim();

    if (phoneValue !== (oldData.phone || "")) {
      for (const collection of collections) {
        const result = await db.collection(collection).where("phone", "==", phoneValue).limit(1).get();

        if (!result.empty) {
          const foundId = result.docs[0].id;

          if (collection === "stores" && foundId === storeId) {
            continue;
          }

          return res.status(409).json({ ok: false, message: "เบอร์โทรนี้ถูกใช้งานแล้ว" });
        }
      }
    }

    if (emailValue !== (oldData.email || "")) {
      for (const collection of collections) {
        const result = await db.collection(collection).where("email", "==", emailValue).limit(1).get();

        if (!result.empty) {
          const foundId = result.docs[0].id;

          if (collection === "stores" && foundId === storeId) {
            continue;
          }

          return res.status(409).json({ ok: false, message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
      }
    }

    const update: any = {};

    update.store_name = storeNameValue;
    update.email = emailValue;
    update.phone = phoneValue;

    if (address != null && address.trim() !== "") {
      update.address = address.trim();
    }

    if (opening_hours != null && opening_hours.trim() !== "") {
      update.opening_hours = opening_hours.trim();
    }

    if (closed_hours != null && closed_hours.trim() !== "") {
      update.closed_hours = closed_hours.trim();
    }

    if (facebook != null && facebook.trim() !== "") {
      update.facebook = facebook.trim();
    }

    if (line_id != null && line_id.trim() !== "") {
      update.line_id = line_id.trim();
    }

    if (status != null && status !== "") {
      update.status = status;
    } else if (oldData.status === "PENDING") {
      update.status = "TEMP_CLOSED";
    }

    if (service_radius != null && service_radius !== "") {
      const value = Number(service_radius);

      if (Number.isNaN(value)) {
        return res.status(400).json({ ok: false, message: "service_radius ต้องเป็นตัวเลข" });
      }

      if (value < 0) {
        return res.status(400).json({ ok: false, message: "ไม่กรอกตัวเลขติดลบ" });
      }

      update.service_radius = value;
    }

    if (latitude != null && latitude !== "") {
      const value = Number(latitude);

      if (Number.isNaN(value)) {
        return res.status(400).json({ ok: false, message: "latitude ต้องเป็นตัวเลข" });
      }

      update.latitude = value;
    }

    if (longitude != null && longitude !== "") {
      const value = Number(longitude);

      if (Number.isNaN(value)) {
        return res.status(400).json({ ok: false, message: "longitude ต้องเป็นตัวเลข" });
      }

      update.longitude = value;
    }

    if (delivery_min != null && delivery_min !== "") {
      const value = Number(delivery_min);

      if (Number.isNaN(value)) {
        return res.status(400).json({ ok: false, message: "ระยะทางขั้นต่ำต้องเป็นตัวเลข" });
      }

      if (value < 0) {
        return res.status(400).json({ ok: false, message: "ไม่กรอกตัวเลขติดลบ" });
      }

      update.delivery_min = value;
    }

    if (delivery_max != null && delivery_max !== "") {
      const value = Number(delivery_max);

      if (Number.isNaN(value)) {
        return res.status(400).json({ ok: false, message: "ระยะทางสูงสุดต้องเป็นตัวเลข" });
      }

      if (value < 0) {
        return res.status(400).json({ ok: false, message: "ไม่กรอกตัวเลขติดลบ" });
      }

      update.delivery_max = value;
    }

    if (
      delivery_min != null &&
      delivery_min !== "" &&
      delivery_max != null &&
      delivery_max !== "" &&
      Number(delivery_min) > Number(delivery_max)
    ) {
      return res.status(400).json({
        ok: false,
        message: "ระยะทางขั้นต่ำต้องไม่มากกว่าระยะทางสูงสุด"
      });
    }

    if (detergent_price != null && detergent_price !== "") {
      const value = Number(detergent_price);

      if (Number.isNaN(value)) {
        return res.status(400).json({ ok: false, message: "ราคาน้ำยาต้องเป็นตัวเลข" });
      }

      if (value < 0) {
        return res.status(400).json({ ok: false, message: "ไม่กรอกตัวเลขติดลบ" });
      }

      update.detergent_price = value;
    }

    if (req.file) {
      const fileName = `stores/${storeId}/profile_${Date.now()}_${req.file.originalname}`;
      const file = bucket.file(fileName);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false
      });

      await file.makePublic();

      update.profile_image = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    }

    update.updated_at = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(update, { merge: true });

    const newDoc = await ref.get();
    const data = newDoc.data() || {};

    return res.json({
      ok: true,
      store_id: storeId,
      data: {
        store_id: data.store_id ?? storeId,
        username: data.username ?? "",
        store_name: data.store_name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        facebook: data.facebook ?? "",
        line_id: data.line_id ?? "",
        address: data.address ?? "",
        opening_hours: data.opening_hours ?? "",
        closed_hours: data.closed_hours ?? "",
        service_radius: Number(data.service_radius ?? 0),
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        status: data.status ?? "OPEN",
        profile_image: data.profile_image ?? "",
        wallet_balance: Number(data.wallet_balance ?? 0),
        delivery_min: Number(data.delivery_min ?? 0),
        delivery_max: Number(data.delivery_max ?? 0),
        detergent_price: Number(data.detergent_price ?? 0)
      }
    });
  } catch (error: any) {
    console.error("STORE PROFILE UPDATE ERROR:", error);
    return res.status(500).json({
      ok: false,
      message: error.message || "Server error"
    });
  }
});



router.get("/profile/:id", async (req, res) => {
  try {
    const storeId = req.params.id as string;

    const ref = db.collection("stores").doc(storeId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า"
      });
    }

    const data = snap.data() as any;

    return res.json({
      ok: true,
      data: {
        store_id:       data.store_id       ?? storeId,
        username:       data.username       ?? "",
        store_name:     data.store_name     ?? "",
        email:          data.email          ?? "",
        phone:          data.phone          ?? "",
        facebook:       data.facebook       ?? "",
        line_id:        data.line_id        ?? "",
        address:        data.address        ?? "",
        opening_hours:  data.opening_hours  ?? "",
        closed_hours:   data.closed_hours   ?? "",
        service_radius: Number(data.service_radius  ?? 0),
        latitude:       Number(data.latitude        ?? 0),
        longitude:      Number(data.longitude       ?? 0),
        status:         data.status         ?? "OPEN",
        profile_image:  data.profile_image  ?? "",
        wallet_balance: Number(data.wallet_balance  ?? 0),
        delivery_min:   Number(data.delivery_min    ?? 0),
        delivery_max:   Number(data.delivery_max    ?? 0),
        machine_wash_count: Number(data.machine_wash_count ?? 0),
        machine_dry_count:  Number(data.machine_dry_count  ?? 0),
        detergent_price: Number(data.detergent_price ?? 0),
      }
    });

  } catch (e: any) {
    console.error("STORE PROFILE GET ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error"
    });
  }
});
//รายละเอียดร้านค้าฝั่งลุกค้า
router.get("/customer/profile/:id", async (req, res) => {
  try {
    const storeId = req.params.id as string;

    const storeref = db.collection("stores").doc(storeId);
    const snap = await storeref.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }
    const machinestore = db.collection("machines").where("store_id","==",storeref);
    let machinewashcount = 0,machinedrycount = 0;
    

    const machineSnap = await machinestore.get();
    machineSnap.forEach((doc) => {
      const data = doc.data();
      if (data.type === "washer") {
        machinewashcount++;
      } else if (data.type === "dryer") {
        machinedrycount++;
      }
    });

    const data = snap.data() as Partial<StoreData>;

    return res.json({
      ok: true,
      store_id: storeId,
      data: {
        store_id: data.store_id ?? storeId,
        username: data.username ?? "",
        store_name: data.store_name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        facebook: data.facebook ?? "",
        line_id: data.line_id ?? "",
        address: data.address ?? "",
        min_delivery: Number(data.delivery_min ?? 0),
        max_delivery: Number(data.delivery_max ?? 0),
        opening_hours: data.opening_hours ?? "",
        closed_hours: data.closed_hours ?? "",
        service_radius: Number(data.service_radius ?? 0),
        detergent_price: Number(data.detergent_price ?? 0),
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        status: data.status ?? "OPEN",
        profile_image: data.profile_image ?? "",
        machine_wash_count: machinewashcount,
        machine_dry_count: machinedrycount,
      },
    });

  } catch (e: any) {
    console.error("get store profile error:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.put("/profile/status/:id", async (req, res) => {
  try {
    const storeId = req.params.id as string;
    const { status } = req.body;


    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุสถานะร้าน",
      });
    }

    if (!StoreStatus.includes(status)) {
      return res.status(400).json({
        ok: false,
        message: "สถานะไม่ถูกต้อง",
      });
    }

    const storeRef = db.collection("stores").doc(storeId);
    const snap = await storeRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    await storeRef.update({
      status: status,
      updated_at: new Date(),
    });

    return res.json({
      ok: true,
      message: "อัปเดตสถานะร้านสำเร็จ",
      data: {
        store_id: storeId,
        status: status,
      },
    });

  } catch (e: any) {
    console.error("update store status error:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.get("/profile/status/:id", async (req, res) => {
  try {
    const storeId = req.params.id as string;

    const storeRef = db.collection("stores").doc(storeId);
    const snap = await storeRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const storeData = snap.data();

    return res.json({
      ok: true,
      message: "ดึงสถานะร้านสำเร็จ",
      data: {
        store_id: storeId,
        status: storeData?.status ?? "TEMP_CLOSED",
      },
    });

  } catch (e: any) {
    console.error("get store status error:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.post(
  "/images/:id",
  upload.array("store_images", 5),
  async (req, res) => {
    try {
      const storeId = String(req.params.id);

      const storeRef = db.collection("stores").doc(storeId);
      const storeSnap = await storeRef.get();

      if (!storeSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบร้านค้า",
        });
      }

      const imgcheck = await db
        .collection("store_images")
        .where("store_id", "==", storeRef)
        .get();

      const currentCount = imgcheck.size;

      if (currentCount >= 5) {
        return res.status(400).json({
          ok: false,
          message: "ร้านมีรูปครบ 5 รูปแล้ว",
        });
      }

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({
          ok: false,
          message: "กรุณาอัปโหลดรูป",
        });
      }

      const files = req.files as Express.Multer.File[];

      if (currentCount + files.length > 5) {
        return res.status(400).json({
          ok: false,
          message: `อัปโหลดได้อีก ${5 - currentCount} รูป`,
        });
      }

      const uploaded: any[] = [];

      for (const f of files) {
        const safeName = (f.originalname || "img").replace(/[^\w.-]/g, "_");

        const fileName = `store_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 8)}_${safeName}`;

        const objectPath = `stores/${storeId}/${fileName}`;
        const file = bucket.file(objectPath);

        await file.save(f.buffer, {
          contentType: f.mimetype,
          resumable: false,
        });

        await file.makePublic();

        const url = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;

        const storeImgRef = db.collection("store_images").doc();

        const data: StoreImage = {
          image_id: storeImgRef.id,
          store_id: storeRef,
          image_path: url,
        };

        await storeImgRef.set(data);

        uploaded.push({
          image_id: storeImgRef.id,
          image_path: url,
        });
      }

      return res.json({
        ok: true,
        message: "อัปโหลดสำเร็จ",
        total_images: currentCount + uploaded.length,
        images: uploaded,
      });
    } catch (e) {
      console.error("UPLOAD ERROR:", e);

      return res.status(500).json({
        ok: false,
        message: "upload error",
      });
    }
  }
);

router.put(
  "/images/:imageId",
  upload.single("store_images"),
  async (req, res) => {
    try {
      const imageId = String(req.params.imageId);
      const imageRef = db.collection("store_images").doc(imageId);
      const imageDoc = await imageRef.get();

      if (!imageDoc.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบรูปภาพ",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: "กรุณาอัปโหลดรูป",
        });
      }

      const existingData = imageDoc.data() as StoreImage;
      const storeId = existingData.store_id.id;

      try {
        const oldPath = existingData.image_path.split(`${bucket.name}/`)[1];
        await bucket.file(oldPath).delete();
      } catch (err) {
        console.warn("ลบไฟล์เก่าไม่สำเร็จ:", err);
      }

      const f = req.file;
      const safeName = (f.originalname || "img").replace(/[^\w.-]/g, "_");
      const fileName = `ads_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}_${safeName}`;

      const objectPath = `stores/${storeId}/${fileName}`;
      const file = bucket.file(objectPath);

      await file.save(f.buffer, {
        contentType: f.mimetype,
        resumable: false,
      });

      await file.makePublic();

      const newUrl = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;

      await imageRef.update({
        image_id: imageId,
        image_path: newUrl,
        updated_at: new Date(),
      });

      return res.json({
        ok: true,
        message: "แก้ไขรูปสำเร็จ",
        image: {
          image_id: imageId,
          image_path: newUrl,
        },
      });
    } catch (e) {
      console.error("UPDATE IMAGE ERROR:", e);
      return res.status(500).json({
        ok: false,
        message: "update image error",
      });
    }
  }
);
router.delete("/images/:id", async (req, res) => {
  try {
    const imageId = String(req.params.id);
    const imageRef = db.collection("store_images").doc(imageId);
    const imageDoc = await imageRef.get();

    if (!imageDoc.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบรูปภาพ",
      });
    }

    const data = imageDoc.data() as StoreImage;

    // ลบไฟล์จาก Storage
    try {
      const oldPath = data.image_path.split(`${bucket.name}/`)[1];
      await bucket.file(oldPath).delete();
    } catch (err) {
      console.warn("ลบไฟล์จาก storage ไม่สำเร็จ:", err);
    }

    // ลบ document
    await imageRef.delete();

    return res.json({
      ok: true,
      message: "ลบรูปสำเร็จ",
      data: {
        image_id: imageId,
      },
    });
  } catch (e) {
    console.error("DELETE IMAGE ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: "delete error",
    });
  }
});
router.get("/images/:id", async (req, res) => {
  try {
    const storeId = String(req.params.id);

    const storeRef = db.collection("stores").doc(storeId);
    const storedb = await storeRef.get();

    if (!storedb.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const imgSnap = await db
      .collection("store_images")
      .where("store_id", "==", storeRef)
      .get();

    const images = imgSnap.docs.map((doc) => {
      const data = doc.data() as StoreImage;

      return {
        image_id: data.image_id ?? doc.id,
        image_path: data.image_path,
      };
    });

    return res.json({
      ok: true,
      store_id: storeId,
      total_images: images.length,
      images,
    });
  } catch (e: any) {
    console.error("GET IMAGES ERROR:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.post("/machine", async (req, res) => {
  try {
    const data = req.body;

    if (
      !data.name ||
      !data.type ||
      !data.capacity ||
      !data.price ||
      !data.work_minutes ||
      !data.store_id
    ) {
      return res.status(400).json({
        ok: false,
        message: "กรอกข้อมูลไม่ครบ",
      });
    }

    if (
      isNaN(Number(data.capacity)) ||
      isNaN(Number(data.price)) ||
      isNaN(Number(data.work_minutes))
    ) {
      return res.status(400).json({
        ok: false,
        message: "ต้องเป็นตัวเลข",
      });
    }
    if(data.capacity < 0 || data.price < 0 || data.work_minutes < 0){
      return res.status(400).json({
        ok: false,
        message: "ห้ามกรอกตัวเลขติดลบ",
      });
    }


    if (data.status && !MACHINE_STATUS.includes(data.status)) {
      return res.status(400).json({
        ok: false,
        message: "status ไม่ถูกต้อง",
      });
    }

    
    const storeRef = db.collection("stores").doc(data.store_id);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้าน",
      });
    }

    const docRef = db.collection("machines").doc();

    const machine: Machine = {
      machine_id: docRef.id,
      store_id: storeRef,
      name: data.name.trim(),
      type: data.type,
      capacity: Number(data.capacity),
      price: Number(data.price),
      work_minutes: Number(data.work_minutes),
      status: "available",
    };

    await docRef.set(machine);

    return res.json({
      ok: true,
      message: "เพิ่มเครื่องสำเร็จ",
      data: {
        ...machine,
        store_id: data.store_id,
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
});



router.put("/machine/update/:id", async (req, res) => {
  try {
    const machineId = req.params.id;
    const data = req.body;

    const machineref = db.collection("machines").doc(machineId);
    const snap = await machineref.get();

    if (!snap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบเครื่อง",
      });
    }

    if (data.type && !["washer", "dryer"].includes(data.type)) {
      return res.status(400).json({
        ok: false,
        message: "type ต้องเป็น washer หรือ dryer",
      });
    }

    if (
      (data.capacity !== undefined && data.capacity !== "" && isNaN(Number(data.capacity))) ||
      (data.price !== undefined && data.price !== "" && isNaN(Number(data.price))) ||
      (data.work_minutes !== undefined && data.work_minutes !== "" && isNaN(Number(data.work_minutes)))
    ) {
      return res.status(400).json({
        ok: false,
        message: " ต้องเป็นตัวเลข",
      });
    }

    if (Number(data.capacity) < 0 || Number(data.price) < 0 || Number(data.work_minutes) < 0) {
      return res.status(400).json({
        ok: false,
        message: "ห้ามกรอกตัวเลขติดลบ",
      });
    }

    const update: Partial<Machine> = {};

    if (data.machine_id !== undefined && data.machine_id !== "") {
      update.machine_id = data.machine_id.trim();
    }

    if (data.name !== undefined && data.name !== "") {
      update.name = data.name.trim();
    }

    if (data.type !== undefined && data.type !== "") {
      update.type = data.type;
    }

    if (data.capacity !== undefined && data.capacity !== "") {
      update.capacity = Number(data.capacity);
    }

    if (data.price !== undefined && data.price !== "") {
      update.price = Number(data.price);
    }

    if (data.work_minutes !== undefined && data.work_minutes !== "") {
      update.work_minutes = Number(data.work_minutes);
    }

    if (data.status !== undefined && data.status !== "") {
      if (!MACHINE_STATUS.includes(data.status)) {
        return res.status(400).json({
          ok: false,
          message: "status ไม่ถูกต้อง",
        });
      }
      update.status = data.status;
    }

    if (data.store_id !== undefined && data.store_id !== "") {
      const storeRef = db.collection("stores").doc(data.store_id);
      const storeSnap = await storeRef.get();

      if (!storeSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบร้าน",
        });
      }

      update.store_id = storeRef;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        ok: false,
        message: "ไม่มีข้อมูลที่ต้องการแก้ไข",
      });
    }

    await machineref.update(update);

    const updatedSnap = await machineref.get();
    const result = updatedSnap.data() as Machine;

    return res.json({
      ok: true,
      message: "แก้ไขเครื่องสำเร็จ",
      data: {
        ...result,
        store_id: result?.store_id?.id || null,
      },
    });
  } catch (e: any) {
    console.error("UPDATE MACHINE ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: e.message || "Server error",
    });
  }
});
router.get("/machines/:id", async (req, res) => {
  try {
    const storeId = req.params.id;

    const storeRef = db.collection("stores").doc(storeId);

    const snap = await db
      .collection("machines")
      .where("store_id", "==", storeRef)
      .get();

    if (snap.empty) {
      return res.json({
        ok: true,
        count: 0,
        data: [],
      });
    }

    const machines = snap.docs.map((doc) => {
      const data = doc.data() as   Machine
      return {
        machine_id: data .machine_id,
        name: data.name,
        type: data.type,
        capacity: data.capacity,
        price: data.price,
        work_minutes: data .work_minutes,
        status: data.status,
      };
    });

    return res.json({
      ok: true,
      count: machines.length,
      data: machines,
    });

  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
