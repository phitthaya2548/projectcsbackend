import { Router } from "express";
import { bucket, db, FieldValue } from "../config/firebase";
import { Order, OrderStatus, } from "../modules/order";
import { upload } from "../middlewares/upload";
import { DistanceService } from "../services/haversine";
import { LaundryStaff } from "../modules/LaundryStaff";
import { CustomerAddress } from "../modules/address_customer";
import { CustomerData } from "../modules/customer";
import { Rider } from "../modules/rider";
import { Timestamp, UpdateData } from "firebase-admin/firestore";
import { StoreData } from "../modules/store";
import { NotificationService } from "../services/notification";


export const router = Router();


router.put(
  "/update/status/:id",
  upload.single("image"),
  async (req, res) => {
    let uploadedFilePath: string | null = null;
    let transactionCommitted = false;

    try {
      const order_id = req.params.id as string;
      const { status, rider_id } = req.body;

      if (!status) {
        return res.status(400).json({
          ok: false,
          message: "กรุณาระบุสถานะ",
        });
      }

      const allowedStatuses = new Set([
        "pickup_completed",
        "arrived_at_shop",
        "waiting_wash",
        "waiting_dry",

        "delivery_pickup_completed",
        "delivery_in_progress",
        "completed",
      ]);

      if (!allowedStatuses.has(status)) {
        return res.status(400).json({
          ok: false,
          message: "สถานะไม่ถูกต้อง",
        });
      }

      if (!rider_id) {
        return res.status(400).json({
          ok: false,
          message: "กรุณาระบุ rider_id",
        });
      }

      const orderRef = db.collection("orders").doc(order_id);
      const riderRef = db.collection("riders").doc(rider_id);

      const [orderSnap, riderSnap] = await Promise.all([
        orderRef.get(),
        riderRef.get(),
      ]);

      if (!orderSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบออเดอร์",
        });
      }

      if (!riderSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบพนักงานรับส่ง",
        });
      }

      const orderData = orderSnap.data() as Order;

      if (!orderData.store_id) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบร้านค้า",
        });
      }

      if (orderData.status === status) {
        return res.status(200).json({
          ok: true,
          message: "ออเดอร์อยู่ในสถานะนี้แล้ว",
          data: {
            order_id,
            status,
          },
        });
      }

      const imageStatuses = new Set([
        "pickup_completed",
        "completed",
      ]);

      if (req.file && !imageStatuses.has(status)) {
        return res.status(400).json({
          ok: false,
          message: "สถานะนี้ไม่รองรับการอัปโหลดรูปภาพ",
        });
      }

      let publicUrl: string | null = null;

      if (req.file) {
        const safeOriginalName = req.file.originalname.replace(
          /[^\w.-]/g,
          "_"
        );

        const fileName = `orders/${order_id}/${Date.now()}_${safeOriginalName}`;

        uploadedFilePath = fileName;

        const file = bucket.file(fileName);

        await file.save(req.file.buffer, {
          metadata: {
            contentType: req.file.mimetype,
          },
        });

        await file.makePublic();

        publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      }

      let didUpdate = false;
      let customerId: string | null = null;

      await db.runTransaction(async (tx) => {
        didUpdate = false;

        const freshOrderSnap = await tx.get(orderRef);

        if (!freshOrderSnap.exists) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const freshOrderData = freshOrderSnap.data() as Order;

        if (freshOrderData.status === status) {
          return;
        }

        if (!freshOrderData.store_id) {
          throw new Error("STORE_NOT_FOUND");
        }

        const updateData: UpdateData<Order> = {
          status: status as OrderStatus,
          order_datetime: FieldValue.serverTimestamp(),
        };

        if (status === "pickup_completed") {
          if (!freshOrderData.rider_pickup_id) {
            updateData.rider_pickup_id = riderRef;
          }

          if (publicUrl) {
            updateData.before_wash_image = publicUrl;
          }
        }

        if (status === "arrived_at_shop") {
          if (!freshOrderData.rider_pickup_id) {
            updateData.rider_pickup_id = riderRef;
          }
        }

        if (status === "waiting_wash" ||status === "waiting_dry"
) {
          updateData.rider_pickup_id = riderRef;
        }

        if (status === "delivery_heading_to_shop") {
          updateData.rider_delivery_id = riderRef;
        }

        if (status === "delivery_pickup_completed") {
          updateData.rider_delivery_id = riderRef;
        }

        if (status === "delivery_in_progress") {
          updateData.rider_delivery_id = riderRef;
        }

        if (status === "completed") {
          updateData.rider_delivery_id = riderRef;

          if (publicUrl) {
            updateData.after_wash_image = publicUrl;
          }
        }

        tx.update(orderRef, updateData);

        customerId = freshOrderData.customer_id?.id ?? null;
        didUpdate = true;
      });

      transactionCommitted = true;

      if (!didUpdate) {
        if (uploadedFilePath) {
          try {
            await bucket.file(uploadedFilePath).delete();
          } catch (error) {
            console.error(
              "delete unused image error:",
              error
            );
          }
        }

        return res.status(200).json({
          ok: true,
          message: "ออเดอร์อยู่ในสถานะนี้แล้ว",
          data: {
            order_id,
            status,
          },
        });
      }

      const notificationMap: Record<
        string,
        {
          title: string;
          body: string;
        }
      > = {
        pickup_completed: {
          title: "พนักงานรับส่งรับผ้าเรียบร้อยแล้ว",
          body:
            "พนักงานรับส่งรับผ้าของคุณเรียบร้อยแล้ว กำลังนำไปส่งที่ร้าน",
        },

        arrived_at_shop: {
          title: "พนักงานรับส่งถึงร้านแล้ว",
          body: "พนักงานรับส่งกำลังเอาผ้าของคุณเข้าร้าน",
        },

        waiting_wash: {
          title: "ผ้าของคุณกำลังรอนำเข้าคิว",
          body: "ผ้าของคุณกำลังรอนำเข้าคิว",
        },

        delivery_heading_to_shop: {
          title: "พนักงานรับส่งกำลังไปรับผ้าของคุณที่ร้าน",
          body: "",
        },

        delivery_pickup_completed: {
          title: "พนักงานรับส่งรับผ้าของคุณเรียบร้อยแล้ว",
          body:
            "พนักงานรับส่งรับผ้าของคุณเรียบร้อยแล้ว กำลังนำไปส่งที่บ้านของคุณ",
        },

        delivery_in_progress: {
          title: "พนักงานรับส่งกำลังนำผ้าของคุณไปส่ง",
          body:
            "พนักงานรับส่งกำลังนำผ้าของคุณไปส่งที่อยู่ของคุณ",
        },

        completed: {
          title: "ส่งผ้าเรียบร้อยแล้ว",
          body: "พนักงานรับส่งส่งผ้าของคุณเรียบร้อยแล้ว",
        },
      };

      const notification = notificationMap[status];

      if (customerId && notification) {
        try {
          await NotificationService.sendToUser(
            customerId,
            "customer",
            notification.title,
            notification.body,
            order_id
          );
        } catch (error) {
          console.error(
            "send notification error:",
            error
          );
        }
      }

      return res.status(200).json({
        ok: true,
        message: "อัปเดตสถานะสำเร็จ",
        data: {
          order_id,
          status,
          before_wash_image:
            status === "pickup_completed"
              ? publicUrl
              : undefined,
          after_wash_image:
            status === "completed"
              ? publicUrl
              : undefined,
        },
      });
    } catch (error: any) {
      console.error(
        "update order status error:",
        error
      );

      if (
        uploadedFilePath &&
        !transactionCommitted
      ) {
        try {
          await bucket
            .file(uploadedFilePath)
            .delete();
        } catch (deleteError) {
          console.error(
            "cleanup image error:",
            deleteError
          );
        }
      }

      if (error?.message === "ORDER_NOT_FOUND") {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบออเดอร์",
        });
      }

      if (error?.message === "STORE_NOT_FOUND") {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบร้านค้า",
        });
      }

      if (error?.message === "INVALID_TOTAL_AMOUNT") {
        return res.status(500).json({
          ok: false,
          message: "ยอดเงินออเดอร์ไม่ถูกต้อง",
        });
      }

      return res.status(500).json({
        ok: false,
        message: "server error",
      });
    }
  }
);

router.put("/cancel/:id", async (req, res) => {
  try {
    const order_id = req.params.id;

    if (!order_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ order_id",
      });
    }

    const orderRef = db.collection("orders").doc(order_id);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบคำสั่งซื้อ",
      });
    }

    const orderData = orderSnap.data() as Order;

    if (orderData.status === "cancelled") {
      return res.status(200).json({
        ok: true,
        message: "คำสั่งซื้อถูกยกเลิกแล้ว",
      });
    }

    if (orderData.status !== "pickup_in_progress") {
      return res.status(400).json({
        ok: false,
        message: "ยกเลิกได้เฉพาะคำสั่งซื้อที่อยู่ระหว่างรอรับผ้า",
      });
    }

    await orderRef.update({
      status: "cancelled",
      cancelled_at: FieldValue.serverTimestamp(),
    });

    try {
      const customerId = orderData.customer_id?.id;

      if (customerId) {
        await NotificationService.sendToUser(
          customerId,
          "customer",
          "คำสั่งซื้อถูกยกเลิก",
          "คำสั่งซื้อของคุณถูกยกเลิก เนื่องจากไม่พบตะกร้าผ้าในที่อยู่ที่ระบุ",
          order_id
        );
      }
    } catch (e) {
      console.error("send notification error:", e);
    }

    return res.status(200).json({
      ok: true,
      message: "ยกเลิกคำสั่งซื้อสำเร็จ",
    });
  } catch (e) {
    console.error("cancel order error:", e);

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const rider_id = req.params.id;

    if (!rider_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ rider_id",
      });
    }

    const riderLat = parseFloat(req.query.lat as string);
    const riderLng = parseFloat(req.query.lng as string);
    const hasRiderLocation = !isNaN(riderLat) && !isNaN(riderLng);

    const riderRef = db.collection("riders").doc(rider_id);
    const riderSnap = await riderRef.get();

    if (!riderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงานรับส่ง",
      });
    }

    const activeStatuses = [
      "pickup_in_progress",
      "pickup_completed",
      "delivery_in_progress",
      "store_pickup_in_progress",
      "arrived_at_shop",
      "delivery_pickup_completed",
      "delivery_heading_to_shop",
    ];

    const doneStatuses = [
      "completed",
      "cancelled",
      "waiting_payment",
      "payment_completed",
      "waiting_machine",
      "waiting_wash",
      "washing",
      "waiting_dry",
      "drying",
    ];

    const isDoneMode = req.query.mode === "done";
    const statuses = isDoneMode ? doneStatuses : activeStatuses;

    // ---- ตัวกรองวัน/เดือน/ปี (ใช้เฉพาะ mode=done) ----
    const TH_OFFSET_HOURS = 7; // Asia/Bangkok
    const offsetMs = TH_OFFSET_HOURS * 3600 * 1000;
    const nowTh = new Date(Date.now() + offsetMs);

    const day = req.query.day ? parseInt(req.query.day as string, 10) : null;
    const month = req.query.month
      ? parseInt(req.query.month as string, 10)
      : null;
    const year = req.query.year
      ? parseInt(req.query.year as string, 10)
      : nowTh.getUTCFullYear();

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (isDoneMode && (day !== null || month !== null)) {
      if (month === null || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({
          ok: false,
          message: "กรุณาระบุเดือน (month) ให้ถูกต้อง 1-12",
        });
      }

      if (day !== null && (isNaN(day) || day < 1 || day > 31)) {
        return res.status(400).json({
          ok: false,
          message: "วัน (day) ไม่ถูกต้อง",
        });
      }

      if (isNaN(year)) {
        return res.status(400).json({
          ok: false,
          message: "ปี (year) ไม่ถูกต้อง",
        });
      }

      if (day !== null) {
        // กรองรายวัน
        rangeStart = new Date(Date.UTC(year, month - 1, day) - offsetMs);
        rangeEnd = new Date(Date.UTC(year, month - 1, day + 1) - offsetMs);
      } else {
        // กรองรายเดือน
        rangeStart = new Date(Date.UTC(year, month - 1, 1) - offsetMs);
        rangeEnd = new Date(Date.UTC(year, month, 1) - offsetMs);
      }
    }

    const [pickupSnap, deliverySnap] = await Promise.all([
      db.collection("orders")
        .where("rider_pickup_id", "==", riderRef)
        .where("status", "in", statuses)
        .get(),

      db.collection("orders")
        .where("rider_delivery_id", "==", riderRef)
        .where("status", "in", statuses)
        .get(),
    ]);

    let orderDocs = [...pickupSnap.docs];

    for (const doc of deliverySnap.docs) {
      if (!orderDocs.some((item) => item.id === doc.id)) {
        orderDocs.push(doc);
      }
    }

    // กรองตามวัน/เดือน
    if (rangeStart && rangeEnd) {
      orderDocs = orderDocs.filter((doc) => {
        const dt = (doc.data() as Order).order_datetime;
        if (!dt) return false;
        const d = dt.toDate();
        return d >= rangeStart! && d < rangeEnd!;
      });
    }

    if (orderDocs.length === 0) {
      return res.status(200).json({
        ok: true,
        data: [],
      });
    }

    const orders = await Promise.all(
      orderDocs.map(async (orderDoc) => {
        const orderData = orderDoc.data() as Order;

        const addressSnap = orderData.address_id
          ? await orderData.address_id.get()
          : null;

        const customerSnap = orderData.customer_id
          ? await orderData.customer_id.get()
          : null;

        let addressText = null;
        let addressLat = null;
        let addressLng = null;

        if (addressSnap?.exists) {
          const addressData = addressSnap.data() as CustomerAddress;

          addressText = addressData.address_text ?? null;
          addressLat = addressData.latitude ?? null;
          addressLng = addressData.longitude ?? null;
        }

        let customer = null;

        if (customerSnap?.exists) {
          const customerData = customerSnap.data() as CustomerData;

          customer = {
            id: customerSnap.id,
            name: customerData.fullname ?? null,
            phone: customerData.phone ?? null,
            profile_image: customerData.profile_image ?? null,
          };
        }

        let distanceKm = null;

        if (
          hasRiderLocation &&
          addressLat !== null &&
          addressLng !== null
        ) {
          const distance = DistanceService.haversineKm(
            riderLat,
            riderLng,
            Number(addressLat),
            Number(addressLng)
          );

          if (Number.isFinite(distance)) {
            distanceKm = Number(distance.toFixed(1));
          }
        }

        let orderDatetime = null;

        if (orderData.order_datetime) {
          orderDatetime = orderData.order_datetime
            .toDate()
            .toISOString();
        }

        return {
          id: orderDoc.id,
          order_number: orderData.order_id ?? null,
          status: orderData.status ?? null,
          service_type: orderData.service_type ?? null,
          distance_km: distanceKm,
          note: orderData.note ?? null,
          before_wash_image: orderData.before_wash_image ?? null,
          after_wash_image: orderData.after_wash_image ?? null,
          rider_pickup_id: orderData.rider_pickup_id?.id ?? null,
          rider_delivery_id: orderData.rider_delivery_id?.id ?? null,
          address_lat: addressLat,
          address_lng: addressLng,
          order_datetime: orderDatetime,
          address: addressText,
          customer: customer,
        };
      })
    );

    return res.status(200).json({
      ok: true,
      data: orders,
    });
  } catch (error) {
    console.error("get rider orders error:", error);

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});





router.get("/store/address/:id", async (req, res) => {
  try {
    const storeId = req.params.id?.trim();
    if (!storeId) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ store_id",
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
    const storeData = storeSnap.data() as StoreData;
    return res.status(200).json({
      ok: true,
      data: {
        store_name: storeData.store_name,
        address: storeData.address,
        image: storeData.profile_image,
        latitude: storeData.latitude,
        longitude: storeData.longitude,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});


router.get("/detail/:id", async (req, res) => {
  try {
    const order_id = req.params.id;
    if (!order_id) return res.status(400).json({ ok: false, message: "กรุณาระบุ order_id" });

    const orderRef = db.collection("orders").doc(order_id);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ ok: false, message: "ไม่พบคำสั่งซื้อ" });

    const order = orderSnap.data() as Order;

    const [customerSnap, addressSnap, pickupRiderSnap, deliveryRiderSnap] = await Promise.all([
      order.customer_id ? order.customer_id.get() : null,
      order.address_id ? order.address_id.get() : null,
      order.rider_pickup_id ? order.rider_pickup_id.get() : null,
      order.rider_delivery_id ? order.rider_delivery_id.get() : null,
    ]);

    const customerData = customerSnap?.exists ? customerSnap.data() as CustomerData : null;
    const addressData = addressSnap?.exists ? addressSnap.data() as CustomerAddress : null;
    const pickupRider = pickupRiderSnap?.exists ? pickupRiderSnap.data() as Rider : null;
    const deliveryRider = deliveryRiderSnap?.exists ? deliveryRiderSnap.data() as Rider : null;


    const fromLat = req.query.lat ? Number(req.query.lat) : null;
    const fromLng = req.query.lng ? Number(req.query.lng) : null;
    const toLat = addressData?.latitude ?? null
    ;
    const toLng = addressData?.longitude ?? null;

    let distanceKm: number | null = null;
    if (
      fromLat !== null && Number.isFinite(fromLat) &&
      fromLng !== null && Number.isFinite(fromLng) &&
      toLat !== null && toLng !== null
    ) {
      const km = DistanceService.haversineKm(fromLat, fromLng, toLat, toLng);
      distanceKm = Math.round(km * 10) / 10;
    }

    return res.json({
      ok: true,
      data: {
        order_id: orderSnap.id,
        service_type: order.service_type ?? null,
        wash_dry_weight: order.wash_dry_weight ?? null,
        detergent_option: order.detergent_option ?? null,
        note: order.note ?? null,
        order_datetime: order.order_datetime?.toDate().toISOString() ?? null,
        distance_km: distanceKm,
        customer: customerData ? {
          fullname: customerData.fullname ?? null,
          phone: customerData.phone ?? null,
          profile_image: customerData.profile_image ?? null,
        } : null,
        rider_pickup: pickupRider ? {
          id: order.rider_pickup_id?.id ?? null,
          fullname: pickupRider.fullname ?? null,
          phone: pickupRider.phone ?? null,
          profile_image: pickupRider.profile_image ?? null,
        } : null,
        rider_delivery: deliveryRider ? {
          id: order.rider_delivery_id?.id ?? null,
          fullname: deliveryRider.fullname ?? null,
          phone: deliveryRider.phone ?? null,
          profile_image: deliveryRider.profile_image ?? null,
        } : null,
        address: addressData ? {
          address_text: addressData.address_text ?? null,
          latitude: addressData.latitude ?? null,
          longitude: addressData.longitude ?? null,
        } : null,
      },
    });
  } catch (error) {
    console.error("get order detail error:", error);
    return res.status(500).json({ ok: false, message: "เกิดข้อผิดพลาดในระบบ" });
  }
});

router.put("/accept/:id", async (req, res) => {
  try {
    const order_id = req.params.id;
    const rider_id = req.body.rider_id;

    if (!order_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ order_id",
      });
    }

    if (!rider_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ rider_id",
      });
    }

    const riderRef = db.collection("riders").doc(rider_id);
    const orderRef = db.collection("orders").doc(order_id);

    const max_order = 3;

    const activeStatuses = [
      "pickup_in_progress",
      "pickup_completed",
      "arrived_at_shop",
      "store_pickup_in_progress",
      "delivery_heading_to_shop",
      "delivery_pickup_completed",
      "delivery_in_progress",
    ];

    const [riderSnap, pickupSnap, deliverySnap] =
      await Promise.all([
        riderRef.get(),

        db.collection("orders")
          .where("rider_pickup_id", "==", riderRef)
          .where("status", "in", activeStatuses)
          .get(),

        db.collection("orders")
          .where("rider_delivery_id", "==", riderRef)
          .where("status", "in", activeStatuses)
          .get(),
      ]);

    if (!riderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงานรับส่ง",
      });
    }

    const activeOrderIds = new Set<string>();

    pickupSnap.docs.forEach((doc) => {
      activeOrderIds.add(doc.id);
    });

    deliverySnap.docs.forEach((doc) => {
      activeOrderIds.add(doc.id);
    });

    const totalActive = activeOrderIds.size;

    if (totalActive >= max_order) {
      return res.status(400).json({
        ok: false,
        message: `คุณรับงานครบ ${max_order} งานแล้ว กรุณาจบงานก่อนรับงานใหม่`,
      });
    }

    let newStatus = "";
    let customerId: string | null = null;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);

      if (!snap.exists) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const order = snap.data() as Order;

      if (order.status === "waiting_pickup") {
        if (order.rider_pickup_id) {
          throw new Error("ORDER_ALREADY_ACCEPTED");
        }

        newStatus = "pickup_in_progress";

        tx.update(orderRef, {
          rider_pickup_id: riderRef,
          status: newStatus,
          order_datetime: FieldValue.serverTimestamp(),
        });
      } else if (order.status === "waiting_delivery") {
        if (order.rider_delivery_id) {
          throw new Error("ORDER_ALREADY_ACCEPTED");
        }

        newStatus = "delivery_heading_to_shop";

        tx.update(orderRef, {
          rider_delivery_id: riderRef,
          status: newStatus,
          order_datetime: FieldValue.serverTimestamp(),
        });
      } else {
        throw new Error("INVALID_ORDER_STATUS");
      }

      customerId = order.customer_id?.id ?? null;
    });

    if (customerId) {
      try {
        if (newStatus === "pickup_in_progress") {
          await NotificationService.sendToUser(
            customerId,
            "customer",
            "พนักงานรับส่งรับงานแล้ว",
            "พนักงานรับส่งกำลังไปรับผ้าของคุณ",
            order_id
          );
        }

        if (newStatus === "delivery_heading_to_shop") {
          await NotificationService.sendToUser(
            customerId,
            "customer",
            "พนักงานรับส่งรับงานแล้ว",
            "พนักงานรับส่งกำลังไปรับผ้าของคุณที่ร้าน",
            order_id
          );
        }
      } catch (error) {
        console.error("send notification error:", error);
      }
    }

    return res.status(200).json({
      ok: true,
      message: `รับงานสำเร็จ! (งานที่ ${totalActive + 1}/${max_order})`,
      data: {
        order_id,
        rider_id,
        status: newStatus,
      },
    });
  } catch (error: any) {
    console.error("accept rider order error:", error);

    if (error?.message === "ORDER_NOT_FOUND") {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบออเดอร์นี้",
      });
    }

    if (error?.message === "ORDER_ALREADY_ACCEPTED") {
      return res.status(409).json({
        ok: false,
        message: "งานนี้ถูกรับไปแล้ว",
      });
    }

    if (error?.message === "INVALID_ORDER_STATUS") {
      return res.status(400).json({
        ok: false,
        message: "สถานะงานไม่รองรับการรับงาน",
      });
    }

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});

