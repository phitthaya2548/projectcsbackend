import { Router } from "express";
import { db, FieldValue } from "../config/firebase";
import { StoreImage } from "../modules/image_store";
import { AggregateField, Timestamp } from "firebase-admin/firestore";
import { Request, Response } from "express";
export const router = Router();

const isBlank = (v: any) => v == null || String(v).trim() === "";


router.get("/stores/list", async (req, res) => {
  try {
    const searchTerm =
      typeof req.query.search === "string"
        ? req.query.search.trim().toLowerCase()
        : "";

    const snapStore = await db
      .collection("stores")
      .where("is_hiring", "==", true)
      .get();

    if (snapStore.empty) {
      return res.json({ ok: true, total: 0, data: [] });
    }

  
    const filteredDocs = searchTerm
  ? snapStore.docs.filter((doc) => {
      const data = doc.data();
      const storeName = String(data.store_name ?? "").toLowerCase();
      const address = String(data.address ?? "").toLowerCase();
      const phone = String(data.phone ?? "").toLowerCase();
      return (
        storeName.includes(searchTerm) ||
        address.includes(searchTerm) ||
        phone.includes(searchTerm)
      );
    })
  : snapStore.docs;
    if (filteredDocs.length === 0) {
      return res.json({ ok: true, total: 0, data: [] });
    }

    const storeDocs = filteredDocs;

    const ratingResults = await Promise.all(
      storeDocs.map(async (doc) => {
        const reviewsQuery = db
          .collection("reviews")
          .where("store_id", "==", doc.ref);

        const aggSnap = await reviewsQuery
          .aggregate({
            total: AggregateField.count(),
            avg: AggregateField.average("rating"),
          })
          .get();

        return {
          storeId: doc.id,
          total: aggSnap.data().total ?? 0,
          avg: aggSnap.data().avg ?? 0,
        };
      })
    );

    const ratingMap: Record<string, { total: number; avg: number }> = {};
    ratingResults.forEach((r) => {
      ratingMap[r.storeId] = { total: r.total, avg: r.avg };
    });

    const stores = storeDocs.map((doc) => {
      const data = doc.data();
      const updatedAtOut =
        data.updated_at instanceof Timestamp
          ? data.updated_at.toDate().toISOString()
          : data.updated_at ?? null;

      const totalReviews = ratingMap[doc.id]?.total ?? 0;
      const avgRating = ratingMap[doc.id]?.avg ?? 0;

      return {
        store_id: data.store_id ?? doc.id,
        store_name: data.store_name ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        facebook: data.facebook ?? "",
        line_id: data.line_id ?? "",
        address: data.address ?? "",
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        service_radius: Number(data.service_radius ?? 0),
        opening_hours: data.opening_hours ?? "",
        closed_hours: data.closed_hours ?? "",
        delivery_min: Number(data.delivery_min ?? 0),
        delivery_max: Number(data.delivery_max ?? 0),
        profile_image: data.profile_image ?? "",
        status: data.status ?? "TEMP_CLOSED",
        is_hiring: data.is_hiring ?? false,
        updated_at: updatedAtOut,
        total_reviews: totalReviews,
        avg_rating: Number(Number(avgRating).toFixed(1)),
      };
    });

    return res.json({ ok: true, total: stores.length, data: stores });
  } catch (e: any) {
    console.error("GET STORES LIST ERROR:", e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
});

router.get("/store/:id/applicants", async (req, res) => {
  try {
    const storeId = req.params.id;
    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    
    const [ridersSnap, staffSnap] = await Promise.all([
      db
        .collection("riders")
        .where("store_id", "==", storeRef)
        .where("status", "==", "pending")
        .get(),
      db
        .collection("laundry_staff")
        .where("store_id", "==", storeRef)
        .where("status", "==", "pending")
        .get(),
    ]);

    const riders = ridersSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        rider_id: doc.id,
        fullname: d.fullname ?? "",
        phone: d.phone ?? "",
        profile_image: d.profile_image ?? "",
        vehicle_plate: d.vehicle_plate ?? null,
        applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
        role: "rider",
      };
    });

    const staff = staffSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        staff_id: doc.id,
        fullname: d.fullname ?? "",
        phone: d.phone ?? "",
        profile_image: d.profile_image ?? "",
        applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
        role: "laundry_staff",
      };
    });

    return res.json({
      ok: true,
      data: {
        riders,
        staff,
        total: riders.length + staff.length,
      },
    });
  } catch (e: any) {
    console.error("GET STORE APPLICANTS ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});

router.put("/rider/store/:id", async (req, res) => {
  try {
    const riderId = req.params.id;
    const { store_id } = req.body;

    if (isBlank(store_id)) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ store_id" });
    }

    const riderRef = db.collection("riders").doc(riderId);
    
    const riderSnap = await riderRef.get();

    if (!riderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบไรเดอร์" });
    }
    
    const riderData = riderSnap.data();
    const targetStoreId = (store_id as string).trim();

 
    if (riderData?.store_id) {
  const currentStoreId = riderData.store_id.id;

  if (riderData.status === "pending" && currentStoreId === targetStoreId) {
    return res.status(409).json({
      ok: false,
      message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
    });
  }

  if (riderData.status === "pending") {
    return res.status(409).json({
      ok: false,
      message: "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
    });
  }

  return res.status(409).json({
    ok: false,
    message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
  });
}if (riderData?.store_id) {
  const currentStoreId = riderData.store_id.id;

  if (riderData.status === "pending" && currentStoreId === targetStoreId) {
    return res.status(409).json({
      ok: false,
      message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
    });
  }

  if (riderData.status === "pending") {
    return res.status(409).json({
      ok: false,
      message: "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
    });
  }

  return res.status(409).json({
    ok: false,
    message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
  });
}
    const storeRef = db.collection("stores").doc(targetStoreId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านค้าที่เลือก" });
    }

    const storeData = storeSnap.data();
    if (storeData?.is_hiring === false) {
      return res.status(400).json({
        ok: false,
        message: "ร้านนี้ปิดรับสมัครพนักงานอยู่ในขณะนี้",
      });
    }

    await riderRef.update({
      store_id: storeRef,
      status: "pending",

    });

    return res.json({
      ok: true,
      message: "ส่งคำขอผูกร้านค้าสำเร็จ กรุณารอร้านค้ายืนยัน",
      data: {
        rider_id: riderId,
        store_id: storeRef.id,
        store_name: storeData?.store_name ?? "",
        status: "pending",
      },
    });
  } catch (e: any) {
    console.error("RIDER LINK STORE ERROR:", e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
});
router.put("/staff/store/:id", async (req, res) => {
  try {
    const staffId = req.params.id;
    const { store_id } = req.body ;

    if (isBlank(store_id)) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ store_id",
      });
    }

    const staffRef = db.collection("laundry_staff").doc(staffId);
    const staffSnap = await staffRef.get();

    if (!staffSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    const staffData = staffSnap.data();
     const targetStoreId = (store_id as string).trim();

    
    if (staffData?.store_id) {
  const currentStoreId = staffData.store_id.id;

  if (staffData.status === "pending" && currentStoreId === targetStoreId) {
    return res.status(409).json({
      ok: false,
      message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
    });
  }

  if (staffData.status === "pending") {
    return res.status(409).json({
      ok: false,
      message: "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
    });
  }

  return res.status(409).json({
    ok: false,
    message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
  });
}
  
    const storeRef = db.collection("stores").doc(targetStoreId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้าที่เลือก",
      });
    }

    
    const storeData = storeSnap.data();
    if (storeData?.is_hiring === false) {
      return res.status(400).json({
        ok: false,
        message: "ร้านนี้ปิดรับสมัครพนักงานอยู่ในขณะนี้",
      });
    }

    
    await staffRef.update({
      store_id: storeRef,
      status: "pending", 
    });

    return res.json({
      ok: true,
      message: "ส่งคำขอผูกร้านค้าสำเร็จ กรุณารอร้านค้ายืนยัน",
      data: {
        staff_id: staffId,
        store_id: storeRef.id,
        store_name: storeData?.store_name ?? "",
        status: "pending",
      },
    });
  } catch (e: any) {
    console.error("STAFF LINK STORE ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
router.get("/store/:id/applicants", async (req, res) => {
  try {
    const storeId = req.params.id;
    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const [ridersSnap, staffSnap] = await Promise.all([
      db
        .collection("riders")
        .where("store_id", "==", storeRef)
        .where("status", "==", "pending")
        .get(),
      db
        .collection("laundry_staff")
        .where("store_id", "==", storeRef)
        .where("status", "==", "pending")
        .get(),
    ]);

    const riders = ridersSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        rider_id: doc.id,
        fullname: d.fullname ?? "",
        email: d.email ?? "",
        phone: d.phone ?? "",
        profile_image: d.profile_image ?? "",
        vehicle_type: d.vehicle_type ?? "",
        license_plate: d.license_plate ?? "", 
        applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
        role: "rider",
      };
    });

    const staff = staffSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        staff_id: doc.id,
        fullname: d.fullname ?? "",
        email: d.email ?? "",
        phone: d.phone ?? "",
        profile_image: d.profile_image ?? "",
        applied_at: d.updated_at ? { _seconds: d.updated_at.seconds } : null,
        role: "laundry_staff",
      };
    });

    return res.json({
      ok: true,
      data: {
        riders,
        staff,
        total: riders.length + staff.length,
      },
    });
  } catch (e: any) {
    console.error("GET STORE APPLICANTS ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});


async function updateApplicantStatus(
  req: any,
  res: any,
  collection: string,
  idField: string,
  notFoundMessage: string
) {
  try {
    const storeId = req.params.storeId;
    const employeeId = req.params.userId;
    const { role, action } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ ok: false, message: "action ไม่ถูกต้อง" });
    }

    const employeeRef = db.collection(collection).doc(employeeId);
    const employeeSnap = await employeeRef.get();

    if (!employeeSnap.exists) {
      return res.status(404).json({ ok: false, message: notFoundMessage });
    }

    const d = employeeSnap.data();
    if (d?.store_id?.id !== storeId) {
      return res.status(403).json({ ok: false, message: "ไม่มีสิทธิ์ดำเนินการกับผู้สมัครนี้" });
    }

    if (action === "approve") {

      await employeeRef.update({
        status: "TEMP_CLOSED",
        updated_at: new Date(),
      });
    } else {

      await employeeRef.update({
        status: null,
        store_id: null,
        updated_at: new Date(),
      });
    }

    return res.json({
      ok: true,
      message: action === "approve" ? "ยืนยันผู้สมัครสำเร็จ" : "ปฏิเสธผู้สมัครสำเร็จ",
      data: {
        [idField]: employeeId,
        status: action === "approve" ? "TEMP_CLOSED" : null,
      },
    });
  } catch (e: any) {
    console.error("UPDATE APPLICANT STATUS ERROR:", e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
}

router.put("/store/:storeId/applicant/:userId/status", (req, res) => {
  const { role } = req.body;
  if (role === "rider") {
    return updateApplicantStatus(req, res, "riders", "rider_id", "ไม่พบไรเดอร์");
  } else if (role === "laundry_staff") {
    return updateApplicantStatus(req, res, "laundry_staff", "staff_id", "ไม่พบพนักงาน");
  }
  return res.status(400).json({ ok: false, message: "role ไม่ถูกต้อง" });
});

router.put("/store/:id/hiring", async (req, res) => {
  try {
    const storeId = req.params.id;
    const { isHiring } = req.body;

    if (typeof isHiring !== "boolean") {
      return res.status(400).json({
        ok: false,
        message: "isHiring ต้องเป็น true หรือ false",
      });
    }

    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    await storeRef.update({
      is_hiring: isHiring,
      updated_at: new Date(),
    });

    return res.json({
      ok: true,
      message: isHiring
        ? "เปิดรับสมัครพนักงานแล้ว"
        : "ปิดรับสมัครพนักงานแล้ว",
      data: {
        store_id: storeId,
        is_hiring: isHiring,
      },
    });
  } catch (e: any) {
    console.error("UPDATE HIRING ERROR:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});

router.get("/store/:id/hiring-status", async (req, res) => {
  try {
    const storeId = req.params.id;

    const storeSnap = await db.collection("stores").doc(storeId).get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "Store not found",
      });
    }

    const d = storeSnap.data();

    return res.json({
      ok: true,
      data: {
        store_id: storeId,
        status: d?.status ?? "TEMP_CLOSED",
        is_hiring: d?.is_hiring ?? true,
      },
    });
  } catch (e: any) {
    console.error("GET HIRING STATUS ERROR:", e);

    return res.status(500).json({
      ok: false,
      message: e.message ?? "Server error",
    });
  }
});
async function getAppliedStore(
  req: Request,
  res: Response,
  collection: string,
  notFoundMessage: string
) {
  try {
    const userIdParam = req.params.id;

    if (typeof userIdParam !== "string" || !userIdParam) {
      return res.status(400).json({ ok: false, message: "Invalid or missing id" });
    }

    const userId = userIdParam;
    const userSnap = await db.collection(collection).doc(userId).get();

    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, message: notFoundMessage });
    }

    const d = userSnap.data();

    if (!d?.store_id) {
      return res.json({ ok: true, data: null });
    }

    if (typeof d.store_id?.get !== "function") {
      console.error(`Invalid store_id in [${collection}] doc ${userId}:`, d.store_id);
      return res.json({ ok: true, data: null });
    }

    const storeSnap = await d.store_id.get();

    if (!storeSnap.exists) {
      return res.json({ ok: true, data: null });
    }

    const s = storeSnap.data();

    return res.json({
      ok: true,
      data: {
        store_id: storeSnap.id,
        store_name: s?.store_name ?? "",
        phone: s?.phone ?? "",
        address: s?.address ?? "",
        profile_image: s?.profile_image ?? "",
        status: d?.status ?? null,
      },
    });
  } catch (e: any) {
    console.error(`GET APPLIED STORE ERROR [${collection}]:`, e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
}

router.get("/rider/:id/applied/store", (req, res) => {
  return getAppliedStore(req, res, "riders", "ไม่พบไรเดอร์");
});

router.get("/staff/:id/applied/store", (req, res) => {
  return getAppliedStore(req, res, "laundry_staff", "ไม่พบพนักงาน");
});
async function editAppliedStore(
  req: Request,
  res: Response,
  collection: string,
  notFoundMessage: string
) {
  try {
    const userIdParam = req.params.id;

    if (typeof userIdParam !== "string" || !userIdParam) {
      return res.status(400).json({ ok: false, message: "Invalid or missing id" });
    }

    const userId = userIdParam;
    const userRef = db.collection(collection).doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ ok: false, message: notFoundMessage });
    }

    await userRef.update({
      status: null,
      store_id: null,
    });

    return res.json({
      ok: true,
      message: "ลบเสร็จแล้ว",
    });
  } catch (e: any) {
    console.error(`EDIT APPLIED STORE ERROR [${collection}]:`, e);
    return res.status(500).json({ ok: false, message: e.message ?? "Server error" });
  }
}

router.put("/rider/:id/applied/store", (req, res) => {
  return editAppliedStore(req, res, "riders", "ไม่พบไรเดอร์");
});

router.put("/staff/:id/applied/store", (req, res) => {
  return editAppliedStore(req, res, "laundry_staff", "ไม่พบพนักงาน");
});