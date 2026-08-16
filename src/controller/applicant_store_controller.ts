import { Router } from "express";
import { db, FieldValue } from "../config/firebase";
import { StoreImage } from "../modules/image_store";
import { AggregateField, Timestamp } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { StoreData } from "../modules/store";
import { Rider } from "../modules/rider";
import { LaundryStaff } from "../modules/LaundryStaff";
import { Order } from "../modules/order";
export const router = Router();

const isBlank = (v: any) => v == null || String(v).trim() === "";


router.get("/stores/list", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().toLowerCase()
        : "";

    const storeSnap = await db
      .collection("stores")
      .where("is_hiring", "==", true)
      .get();

    if (storeSnap.empty) {
      return res.json({
        ok: true,
        total: 0,
        data: [],
      });
    }

    const filteredStores = storeSnap.docs.filter((doc) => {
      const store = doc.data() as StoreData;

      if (!search) return true;

      const storeName = String(
        store.store_name ?? ""
      ).toLowerCase();

      const address = String(
        store.address ?? ""
      ).toLowerCase();

      const phone = String(
        store.phone ?? ""
      ).toLowerCase();

      return (
        storeName.includes(search) ||
        address.includes(search) ||
        phone.includes(search)
      );
    });

    const stores = await Promise.all(
      filteredStores.map(async (doc) => {
        const store = doc.data() as StoreData;

        const reviewSnap = await db
          .collection("reviews")
          .where("store_id", "==", doc.ref)
          .aggregate({
            total: AggregateField.count(),
            avg: AggregateField.average("rating"),
          })
          .get();

        const reviewData = reviewSnap.data();

        return {
          store_id: doc.id,
          store_name: store.store_name ?? "",
          phone: store.phone ?? "",
          email: store.email ?? "",
          facebook: store.facebook ?? "",
          line_id: store.line_id ?? "",
          address: store.address ?? "",

          latitude: Number(store.latitude ?? 0),
          longitude: Number(store.longitude ?? 0),
          service_radius: Number(store.service_radius ?? 0),

          opening_hours: store.opening_hours ?? "",
          closed_hours: store.closed_hours ?? "",

          delivery_min: Number(store.delivery_min ?? 0),
          delivery_max: Number(store.delivery_max ?? 0),

          profile_image: store.profile_image ?? "",
          status: store.status ?? "TEMP_CLOSED",
          is_hiring: true,

          total_reviews:
            reviewData.total ?? 0,

          avg_rating: Number(
            Number(reviewData.avg ?? 0).toFixed(1)
          ),
        };
      })
    );

    return res.json({
      ok: true,
      total: stores.length,
      data: stores,
    });
  } catch (error: any) {
    console.error(
      "GET STORES LIST ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
}); 

router.put("/rider/store/:id", async (req, res) => {
  try {
    const riderId = req.params.id;
    const { store_id } = req.body;

    if (isBlank(store_id)) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ store_id",
      });
    }

    const targetStoreId = String(store_id).trim();


    const riderRef = db.collection("riders").doc(riderId);
    const riderSnap = await riderRef.get();

    if (!riderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบไรเดอร์",
      });
    }

    const riderData = riderSnap.data();

    if (riderData?.store_id) {
      const currentStoreId = riderData.store_id.id;

 
      if (
        riderData.status === "pending" &&
        currentStoreId === targetStoreId
      ) {
        return res.status(409).json({
          ok: false,
          message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
        });
      }

      if (riderData.status === "pending") {
        return res.status(409).json({
          ok: false,
          message:
            "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
        });
      }


      return res.status(409).json({
        ok: false,
        message: "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
      });
    }

    const storeRef = db
      .collection("stores")
      .doc(targetStoreId);

    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้าที่เลือก",
      });
    }

    const storeData = storeSnap.data();


    if (storeData?.is_hiring !== true) {
      return res.status(400).json({
        ok: false,
        message: "ร้านนี้ปิดรับสมัครพนักงานอยู่ในขณะนี้",
      });
    }

const updateData: Partial<Rider> = {
  store_id: storeRef,
  status: "pending",
};

await riderRef.update(updateData);

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

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
router.put("/staff/store/:id", async (req, res) => {
  try {
    const staffId = req.params.id;
    const { store_id } = req.body;

  
    if (isBlank(store_id)) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ store_id",
      });
    }

    const targetStoreId = String(store_id).trim();


    const staffRef = db
      .collection("laundry_staff")
      .doc(staffId);

    const staffSnap = await staffRef.get();

    if (!staffSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    const staffData = staffSnap.data();

    if (staffData?.store_id) {
      const currentStoreId = staffData.store_id.id;

      if (
        staffData.status === "pending" &&
        currentStoreId === targetStoreId
      ) {
        return res.status(409).json({
          ok: false,
          message: "คุณสมัครร้านนี้ไปแล้ว กรุณารอร้านค้ายืนยัน",
        });
      }

      if (staffData.status === "pending") {
        return res.status(409).json({
          ok: false,
          message:
            "คุณมีคำขอสมัครร้านค้าอื่นที่รอการยืนยันอยู่แล้ว กรุณายกเลิกก่อนสมัครใหม่",
        });
      }


      return res.status(409).json({
        ok: false,
        message:
          "คุณสังกัดร้านค้าอยู่แล้ว ไม่สามารถสมัครร้านใหม่ได้",
      });
    }

  
    const storeRef = db
      .collection("stores")
      .doc(targetStoreId);

    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้าที่เลือก",
      });
    }

    const storeData = storeSnap.data();

    if (storeData?.is_hiring !== true) {
      return res.status(400).json({
        ok: false,
        message: "ร้านนี้ปิดรับสมัครพนักงานอยู่ในขณะนี้",
      });
    }

    
    const updateData: Partial<LaundryStaff> = {
      store_id: storeRef,
      status: "pending",
    };

    await staffRef.update(updateData);

    return res.json({
      ok: true,
      message:
        "ส่งคำขอผูกร้านค้าสำเร็จ กรุณารอร้านค้ายืนยัน",
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
      message: "Server error",
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
      const data = doc.data();

      return {
        rider_id: doc.id,
        fullname: data.fullname ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        profile_image: data.profile_image ?? "",
        vehicle_type: data.vehicle_type ?? "",
        license_plate: data.license_plate ?? "",
        applied_at: data.updated_at
          ? {
              _seconds: data.updated_at.seconds,
              _nanoseconds: data.updated_at.nanoseconds,
            }
          : null,
        role: "rider",
      };
    });

    const staff = staffSnap.docs.map((doc) => {
      const data = doc.data();

      return {
        staff_id: doc.id,
        fullname: data.fullname ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        profile_image: data.profile_image ?? "",
        applied_at: data.updated_at
          ? {
              _seconds: data.updated_at.seconds,
              _nanoseconds: data.updated_at.nanoseconds,
            }
          : null,
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


router.put("/store/:storeId/applicant/:userId/status", async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const userId = req.params.userId;

    const { role, action } = req.body;

    if (role !== "rider" && role !== "laundry_staff") {
      return res.status(400).json({
        ok: false,
        message: "role ไม่ถูกต้อง",
      });
    }

    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({
        ok: false,
        message: "action ไม่ถูกต้อง",
      });
    }

    let collectionName = "";

    if (role === "rider") {
      collectionName = "riders";
    } else {
      collectionName = "laundry_staff";
    }

    const userRef = db
      .collection(collectionName)
      .doc(userId);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบผู้สมัคร",
      });
    }

    const userData = userSnap.data();

    if (userData?.store_id?.id !== storeId) {
      return res.status(403).json({
        ok: false,
        message: "ผู้สมัครไม่ได้สมัครร้านนี้",
      });
    }

    if (userData?.status !== "pending") {
      return res.status(400).json({
        ok: false,
        message: "ผู้สมัครไม่ได้อยู่ในสถานะรออนุมัติ",
      });
    }

    if (action === "approve") {
      await userRef.update({
        status: "ONLINE",
        updated_at: Timestamp.now(),
      });

      return res.json({
        ok: true,
        message: "ยืนยันผู้สมัครสำเร็จ",
        data: {
          user_id: userId,
          status: "ONLINE",
        },
      });
    }


    await userRef.update({
      status: null,
      store_id: null,

    });

    return res.json({
      ok: true,
      message: "ปฏิเสธผู้สมัครสำเร็จ",
      data: {
        user_id: userId,
        status: null,
      },
    });

  } catch (error) {
    console.error("UPDATE APPLICANT STATUS ERROR:", error);

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
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


    const storeRef = db
      .collection("stores")
      .doc(storeId);

    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const updateStore: Partial<StoreData> = {
      is_hiring: isHiring,
    };

  
    await storeRef.update(updateStore);

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
      message: "Server error",
    });
  }
});

router.get("/store/:id/hiring-status", async (req, res) => {
  try {
    const storeId = req.params.id;

    const storeRef = db
      .collection("stores")
      .doc(storeId);

    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const data = storeSnap.data() as StoreData;

    return res.json({
      ok: true,
      data: {
        store_id: storeId,
        status: data.status ?? "TEMP_CLOSED",
        is_hiring: data.is_hiring ?? false,
      },
    });
  } catch (e: any) {
    console.error(
      "GET HIRING STATUS ERROR:",
      e
    );

    return res.status(500).json({
      ok: false,
      message: "Server error",
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
    const userId = req.params.id as string;

   if (!userId) {
  return res.status(400).json({
    ok: false,
    message: "ไม่พบ id",
  });
}


  const userRef = db
  .collection(collection)
  .doc(userId);

    const userSnap = await userRef.get();

 
    if (!userSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: notFoundMessage,
      });
    }

    const userData = userSnap.data();

  
    if (!userData?.store_id) {
      return res.json({
        ok: true,
        data: null,
      });
    }


    const storeRef = userData.store_id;

    const storeSnap = await storeRef.get();


    if (!storeSnap.exists) {
      return res.json({
        ok: true,
        data: null,
      });
    }

    const storeData = storeSnap.data() as StoreData;

    return res.json({
      ok: true,
      data: {
        store_id: storeSnap.id,
        store_name: storeData?.store_name ?? "",
        phone: storeData?.phone ?? "",
        address: storeData?.address ?? "",
        profile_image: storeData?.profile_image ?? "",
        status: userData.status ?? null,
      },
    });

  } catch (error) {
    console.error(
      `GET APPLIED STORE ERROR [${collection}]:`,
      error
    );

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
}



router.get("/rider/:id/applied/store", (req, res) => {
  return getAppliedStore(
    req,
    res,
    "riders",
    "ไม่พบไรเดอร์"
  );
});



router.get("/staff/:id/applied/store", (req, res) => {
  return getAppliedStore(
    req,
    res,
    "laundry_staff",
    "ไม่พบพนักงาน"
  );
});
async function editAppliedStore(
  req: Request,
  res: Response,
  collection: string,
  notFoundMessage: string
) {
  try {
    const userId = req.params.id as string;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบ id",
      });
    }


    const userRef = db
      .collection(collection)
      .doc(userId);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: notFoundMessage,
      });
    }

    const userData = userSnap.data();


    if (userData?.status !== "pending") {
      return res.status(400).json({
        ok: false,
        message: "สามารถยกเลิกได้เฉพาะคำขอที่รออนุมัติ",
      });
    }

    await userRef.update({
      status: null,
      store_id: null,
    });

    return res.json({
      ok: true,
      message: "ยกเลิกการสมัครร้านสำเร็จ",
    });

  } catch (error) {
    console.error(
      `EDIT APPLIED STORE ERROR [${collection}]:`,
      error
    );

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
}


router.put("/rider/:id/applied/store", (req, res) => {
  return editAppliedStore(
    req,
    res,
    "riders",
    "ไม่พบไรเดอร์"
  );
});



router.put("/staff/:id/applied/store", (req, res) => {
  return editAppliedStore(
    req,
    res,
    "laundry_staff",
    "ไม่พบพนักงาน"
  );
});