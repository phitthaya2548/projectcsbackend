import { Router } from "express";
import { db, } from "../config/firebase";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { Order, OrderStatus } from "../modules/order";
import { DistanceService } from "../services/haversine";
import { NotificationService } from "../services/notification";
import { Review } from "../modules/review";
import { CustomerData } from "../modules/customer";
import { CustomerAddress } from "../modules/address_customer";
import { Rider } from "../modules/rider";
import { LaundryStaff } from "../modules/LaundryStaff";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { StoreData } from "../modules/store";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Bangkok";
export const router = Router();


router.post("/create", async (req, res) => {
  try {
    const {
      customer_id,
      address_id,
      store_id,
      service_type,
      detergent_option,
      note,
    } = req.body;

    if (!customer_id || !store_id || !service_type) {
      return res.status(400).json({
        ok: false,
        message: "ข้อมูลไม่ครบ",
      });
    }

    const storeRef = db.collection("stores").doc(store_id);
    const customerRef = db.collection("customers").doc(customer_id);

    const [storeSnap, customerSnap] = await Promise.all([
      storeRef.get(),
      customerRef.get(),
    ]);

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบข้อมูลลูกค้า",
      });
    }

    const store = storeSnap.data() as StoreData;

    if (store.status !== "OPEN") {
      return res.status(400).json({
        ok: false,
        message: "ร้านปิดอยู่ ไม่สามารถสั่งได้",
      });
    }

    const now = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Bangkok",
      }),
    );

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [openHour, openMinute] = store.opening_hours.split(":").map(Number);
    const [closeHour, closeMinute] = store.closed_hours.split(":").map(Number);
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    let isOpen = false;

    if (openMinutes < closeMinutes) {
      isOpen =
        currentMinutes >= openMinutes &&
        currentMinutes < closeMinutes;
    } else {
      isOpen =
        currentMinutes >= openMinutes ||
        currentMinutes < closeMinutes;
    }

    if (!isOpen) {
      return res.status(400).json({
        ok: false,
        message: "อยู่นอกเวลาให้บริการ",
      });
    }

    if (address_id) {
      const addressSnap = await db
        .collection("customer_addresses")
        .doc(address_id)
        .get();

      if (!addressSnap.exists) {
        return res.status(404).json({
          ok: false,
          message: "ไม่พบที่อยู่",
        });
      }

      const address = addressSnap.data()! as CustomerAddress;

      const storeLat = store.latitude;
      const storeLng = store.longitude;
      const customerLat = address.latitude;
      const customerLng = address.longitude;
      const radiusKm = store.service_radius;

      if (storeLat == null || storeLng == null || customerLat == null || customerLng == null) {
        return res.status(400).json({
          ok: false,
          message: "ไม่พบข้อมูลพิกัด",
        });
      }
      const distanceKm = DistanceService.haversineKm(storeLat,storeLng, customerLat,customerLng,);

      if (distanceKm > radiusKm) {
        return res.status(400).json({
          ok: false,
          message: "ที่อยู่ของคุณอยู่นอกพื้นที่บริการ",
        });
      }
    }

    const orderRef = db.collection("orders").doc();

    const newOrder: Order = {
      order_id: orderRef.id,
      customer_id: customerRef,
      store_id: storeRef,
      address_id: address_id
        ? db.collection("customer_addresses").doc(address_id)
        : null,
      rider_pickup_id: null,
      rider_delivery_id: null,
      staff_id: null,
      service_type,
      wash_dry_weight: 0,
      service_price: 0,
      delivery_price: 0,
      detergent_option: detergent_option ?? null,
      before_wash_image:  "",
      after_wash_image: "",
      detergent_price: 0,
      note: note ?? null,
      machine_washer_id: null,
      machine_dryer_id: null,
      status: "pending_confirmation" as OrderStatus,
      order_datetime: Timestamp.now(),
    };

    await orderRef.set(newOrder);

    try {
      await NotificationService.sendToUser(
        store_id,
        "store",
        "มีออเดอร์ใหม่",
        "มีลูกค้าสร้างออเดอร์ใหม่ กรุณาตรวจสอบและยืนยันออเดอร์",
        orderRef.id,
      );
    } catch (error) {
      console.error(
        "Send new order notification to store error:",
        error,
      );
    }

    return res.status(201).json({
      ok: true,
      message: "สร้างออเดอร์สำเร็จ",
      order_id: orderRef.id,
    });
  } catch (error: any) {
    console.error("CREATE ORDER ERROR:", error);

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});


router.put("/cancel/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบออเดอร์",
      });
    }

    const orderData = orderSnap.data()! as Order;


    if (orderData.customer_id?.id !== customerId) {
      return res.status(403).json({
        ok: false,
        message: "ออเดอร์นี้ไม่ใช่ของคุณ",
      });
    }


    if (orderData.status !== "pending_confirmation") {
      return res.status(400).json({
        ok: false,
        message: "ไม่สามารถยกเลิกออเดอร์ในสถานะนี้ได้",
      });
    }

    if (!orderData.order_datetime) {
      return res.status(400).json({
        ok: false,
        message: "ไม่พบเวลาของออเดอร์",
      });
    }

    const orderTime = orderData.order_datetime.toMillis();
    const currentTime = Timestamp.now().toMillis();

    const diffMs = currentTime - orderTime;
    const fiveMinutes = 5 * 60 * 1000;

    if (diffMs < fiveMinutes) {
      const remainingMinutes = Math.ceil(
        (fiveMinutes - diffMs) / (60 * 1000)
      );

      return res.status(400).json({
        ok: false,
        message: `ยังไม่สามารถยกเลิกได้ กรุณารออีกประมาณ ${remainingMinutes} นาที`,
      });
    }

     const updatedata: Partial<Order> ={
      status: "cancelled" as OrderStatus,
      order_datetime: Timestamp.now(),
    }
    await orderRef.update(updatedata);
    const targetStoreId = orderData.store_id?.id;

    if (targetStoreId) {
      try {
        await NotificationService.sendToUser(
          targetStoreId,
          "store",
          "ลูกค้ายกเลิกออเดอร์",
          "ลูกค้าได้ยกเลิกออเดอร์ กรุณาตรวจสอบรายละเอียด",
          orderId
        );
      } catch (e) {
        console.error("Send cancel notification to store error:", e);
      }
    }

    return res.status(200).json({
      ok: true,
      message: "ยกเลิกออเดอร์สำเร็จ",
    });

  } catch (error) {
    console.error("Cancel order error:", error);

    return res.status(500).json({
      ok: false,
      message: "เกิดข้อผิดพลาดในการยกเลิกออเดอร์",
    });
  }
});
router.put("/store/accept/:id", async (req, res) => {
  const orderId = req.params.id;
  const { store_id } = req.body;

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const Storedata = orderSnap.data()! as Order;


    if (store_id && Storedata.store_id?.id !== store_id) {
      return res.status(403).json({ ok: false, message: "ออเดอร์นี้ไม่ใช่ของร้านค้านี้" });
    }


    if (Storedata.status !== "pending_confirmation") {
      return res.status(400).json({
        ok: false,
        message: `ไม่สามารถรับออเดอร์นี้ได้ (สถานะปัจจุบัน: ${Storedata.status})`,
      });
    }

    const updteData: Partial<Order> = {
      status: "waiting_pickup",
      order_datetime: Timestamp.now(),
    }

    await orderRef.update(updteData);

    if (Storedata?.customer_id) {
      await NotificationService.sendToUser(
        Storedata.customer_id.id,
        "customer",
        "ร้านยืนยันออเดอร์แล้ว",
        "ร้านยืนยันออเดอร์ของคุณแล้ว รอไรเดอรับงาน",
        orderId
      );
    }

    return res.status(200).json({
      ok: true,
      message: "รับออเดอร์สำเร็จ เปลี่ยนสถานะเป็นรอจัดส่ง",
      order_id: orderId,
      status: "waiting_pickup",
    });
  } catch (error) {
    console.error("Error accepting order:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});
router.post("/store/cancel/:id", async (req, res) => {
  const orderId = req.params.id;
  const { store_id, reason } = req.body;

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const data = orderSnap.data()! as Order;


    if (store_id && data.store_id?.id !== store_id) {
      return res.status(403).json({ ok: false, message: "ออเดอร์นี้ไม่ใช่ของร้านค้านี้" });
    }

    const updatedata: Partial<Order> ={
      status: "cancelled" as OrderStatus,
      order_datetime: Timestamp.now(),
    }
    await orderRef.update(updatedata);
    



      return res.status(200).json({
        ok: true,
        message: "ยกเลิกออเดอร์สำเร็จ",
        order_id: orderId,
        status: "cancelled",
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  });
router.get("/store/before/detail/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const data = orderSnap.data()! as Order;

    const [addressSnap, customerSnap] = await Promise.all([
      data.address_id ? data.address_id.get() : null,
      data.customer_id ? data.customer_id.get() : null,
    ]);

    const address = addressSnap?.data() as CustomerAddress; 
    const customer = customerSnap?.data() as CustomerData;

    const order = {
      order_id: orderSnap.id,
      status: data.status,
      service_type: data.service_type,
      detergent_option: data.detergent_option,
      service_price: data.service_price ?? 0,
      note: data.note,
      order_datetime: data.order_datetime
        ? { _seconds: data.order_datetime.seconds }
        : null,
      store_id: data.store_id?.id ?? null,
      address_id: data.address_id?.id ?? null,
      customer_fullname: customer?.fullname ?? "-",
      customer_phone: customer?.phone ?? "-",
      customer_profile_image: customer?.profile_image ?? "",
      customer_email: customer?.email ?? "",
      address_full: address?.address_text ?? "-",
    };

    return res.status(200).json({ ok: true, data: order });

  } catch (error) {
    console.error("Error fetching order detail:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});
router.get("/store/after/detail/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const data = orderSnap.data()! as Order;

    const [
      addressSnap,
      customerSnap,
      riderPickupSnap,
      staffSnap,
      riderDeliverySnap,
    ] = await Promise.all([
      data.address_id ? data.address_id.get() : null,
      data.customer_id ? data.customer_id.get() : null,
      data.rider_pickup_id ? data.rider_pickup_id.get() : null,
      data.staff_id ? data.staff_id.get() : null,
      data.rider_delivery_id ? data.rider_delivery_id.get() : null,
    ]);

    const address = addressSnap?.exists
      ? (addressSnap.data() as CustomerAddress)
      : null;
    const customer = customerSnap?.exists
      ? (customerSnap.data() as CustomerData)
      : null;
    const riderPickup = riderPickupSnap?.exists
      ? riderPickupSnap.data() as Rider
      : null;
    const staff = staffSnap?.exists ? staffSnap.data() as LaundryStaff: null;
    const riderDelivery = riderDeliverySnap?.exists
      ? riderDeliverySnap.data() as Rider
      : null;

    const order = {
      order_id: orderSnap.id,
      status: data.status ?? "waiting_pickup",

      service_type: data.service_type,
      wash_dry_weight: data.wash_dry_weight ?? 0,
      detergent_option: data.detergent_option ?? null,
      note: data.note ?? null,

      service_price: data.service_price ?? 0,
      delivery_price: data.delivery_price ?? 0,
      detergent_price: data.detergent_price ?? 0,

      before_wash_image: data.before_wash_image ?? "",
      after_wash_image: data.after_wash_image ?? "",

      order_datetime: data.order_datetime
        ? { _seconds: data.order_datetime.seconds }
        : null,

      customer_fullname: customer?.fullname ?? "-",
      customer_phone: customer?.phone ?? "-",

      address_full: address?.address_text ?? "-",

      rider_pickup: riderPickup
        ? {
            fullname: riderPickup.fullname ?? "-",
            phone: riderPickup.phone ?? "-",
            profile_image: riderPickup.profile_image ?? null,
            license_plate: riderPickup.license_plate ?? null,
            vehicle_type: riderPickup.vehicle_type ?? null,
          }
        : null,

      staff: staff
        ? {
            fullname: staff.fullname ?? "-",
            phone: staff.phone ?? "-",
            profile_image: staff.profile_image ?? null,
          }
        : null,

      rider_delivery: riderDelivery
        ? {
            fullname: riderDelivery.fullname ?? "-",
            phone: riderDelivery.phone ?? "-",
            profile_image: riderDelivery.profile_image ?? null,
            license_plate: riderDelivery.license_plate ?? null,
            vehicle_type: riderDelivery.vehicle_type ?? null,
          }
        : null,
    };

    return res.status(200).json({ ok: true, data: order });
  } catch (error) {
    console.error("Error fetching order detail:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});
router.get("/customer/list/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const customerRef = db.collection("customers").doc(id);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบลูกค้า",
      });
    }

    const customer = customerSnap.data()!;

    const orders = await db
      .collection("orders")
      .where("customer_id", "==", customerRef)
      .orderBy("order_datetime", "desc")
      .get();

    const data = await Promise.all(
      orders.docs.map(async (doc) => {
        const order = doc.data() as Order;

        let address = null;
        let review = null;

        if (order.address_id) {
          const snap = await order.address_id.get();

          if (snap.exists) {
            address = snap.data() as CustomerAddress;
          }
        }

        const reviewSnap = await db
          .collection("reviews")
          .doc(doc.id)
          .get();

        if (reviewSnap.exists) {
          review = reviewSnap.data() as Review;
        }

        return {
          order_id: doc.id,
          customer_id: order.customer_id?.id ?? null,
          store_id: order.store_id?.id ?? null,
          address_id: order.address_id?.id ?? null,

          service_type: order.service_type,
          wash_dry_eight: order.wash_dry_weight ?? 0,

          service_price: order.service_price ?? 0,
          delivery_price: order.delivery_price ?? 0,
          detergent_price: order.detergent_price ?? 0,

          total_amount:
            (order.service_price ?? 0) +
            (order.delivery_price ?? 0) +
            (order.detergent_price ?? 0),

          status: order.status,

          order_datetime: order.order_datetime
            ? {
                _seconds: order.order_datetime.seconds,
              }
            : null,

          customer_fullname: customer.fullname ?? "-",
          customer_phone: customer.phone ?? "-",

          address_full: address?.address_text ?? "-",

          is_reviewed: review !== null,
        };
      })
    );

    const byStatus = data.reduce((acc, item) => {
      const status = item.status ?? "unknown";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return res.json({
      ok: true,
      data,
      summary: {
        total: data.length,
        success_count: byStatus.completed ?? 0,
        cancelled_count: byStatus.cancelled ?? 0,
        by_status: byStatus,
      },
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
//comleted of customer
router.get("/customer/completed/detail/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const data = orderSnap.data()! as Order;

    if (data.status !== "completed") {
      return res.status(400).json({ error: "Order is not completed" });
    }

    const [riderPickupSnap, riderDeliverySnap, staffSnap, addressSnap, storeSnap, reviewSnap] =
      await Promise.all([
        data.rider_pickup_id ? data.rider_pickup_id.get() : null,
        data.rider_delivery_id ? data.rider_delivery_id.get() : null,
        data.staff_id ? data.staff_id.get() : null,
        data.address_id ? data.address_id.get() : null,
        data.store_id ? data.store_id.get() : null,
        db.collection("reviews").doc(orderId).get(),
      ]);

    const riderPickup = riderPickupSnap?.data() as Rider;
    const riderDelivery = riderDeliverySnap?.data() as Rider;
    const staff = staffSnap?.data() as LaundryStaff;
    const review = reviewSnap.exists ? reviewSnap.data() as Review: null;
    const storeData = storeSnap?.data() as StoreData;
    const addressData = addressSnap?.data() as CustomerAddress;

    const order = {
      order_id: data.order_id,
      status: data.status,
      service_type: data.service_type,
      detergent_option: data.detergent_option,
      service_price: data.service_price ?? 0,
      delivery_price: data.delivery_price ?? 0,
      total_amount: (data.service_price ?? 0) + (data.delivery_price ?? 0) + (data?.detergent_price ?? 0),
      wash_dry_weight: data.wash_dry_weight,
      note: data.note,
      before_wash_image: data.before_wash_image,
      after_wash_image: data.after_wash_image,
      order_datetime: data.order_datetime,
      store_id: data.store_id?.id ?? null,
      store_name: storeData?.store_name ?? null,
      address_id: data.address_id?.id ?? null,
      address_text: addressData?.address_text ?? null,
      machine_washer_id: data.machine_washer_id?.id ?? null,
      machine_dryer_id: data.machine_dryer_id?.id ?? null,
      detergent_price: data.detergent_price ?? 0,
      rider_pickup: riderPickup ? {
        rider_id: riderPickup.rider_id,
        fullname: riderPickup.fullname,
        phone: riderPickup.phone,
        profile_image: riderPickup.profile_image,
        vehicle_type: riderPickup.vehicle_type,
        license_plate: riderPickup.license_plate,
      } : null,
      rider_delivery: riderDelivery ? {
        rider_id: riderDelivery.rider_id,
        fullname: riderDelivery.fullname,
        phone: riderDelivery.phone,
        profile_image: riderDelivery.profile_image,
        vehicle_type: riderDelivery.vehicle_type,
        license_plate: riderDelivery.license_plate,
      } : null,
      staff: staff ? {
        staff_id: staff.staff_id,
        fullname: staff.fullname,
        phone: staff.phone,
        profile_image: staff.profile_image,
        username: staff.username,
      } : null,
      review: review ? {
        rating: review.rating,
        comment: review.comment ?? null,
        reviewed_at: review.reviewed_at ?? null,
      } : null,
    };

    return res.json({ data: order });
  } catch (err) {
    console.error("GET /completed/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/review/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rating, comment } = req.body;

    if (
      typeof rating !== "number" ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        error: "คะแนนต้องเป็นตัวเลขระหว่าง 1-5",
      });
    }

    if (
      comment !== undefined &&
      comment !== null &&
      typeof comment !== "string"
    ) {
      return res.status(400).json({
        error: "ความคิดเห็นต้องเป็นข้อความ",
      });
    }

    if (
      typeof comment === "string" &&
      comment.length > 500
    ) {
      return res.status(400).json({
        error: "ความคิดเห็นยาวเกินไป (สูงสุด 500 ตัวอักษร)",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({
        error: "ไม่พบคำสั่งซื้อ",
      });
    }

    const orderData = orderSnap.data()!;

    if (orderData.status !== "completed") {
      return res.status(400).json({
        error: "ต้องดำเนินการคำสั่งซื้อเสร็จสิ้นก่อนจึงจะรีวิวได้",
      });
    }

    const reviewRef = db.collection("reviews").doc(orderId);
    const reviewSnap = await reviewRef.get();

    if (reviewSnap.exists) {
      return res.status(409).json({
        error: "คำสั่งซื้อนี้ถูกรีวิวไปแล้ว",
      });
    }

    const review: Review = {
      review_id: orderId,
      store_id: orderData.store_id ?? null,
      order_id: orderRef,
      customer_id: orderData.customer_id ?? null,
      rating,
      comment: comment ? comment.trim() : null,
      reviewed_at: Timestamp.now(),
    };

    await reviewRef.set(review);

    return res.json({
      data: {
        rating: review.rating,
        comment: review.comment,
        reviewed_at: review.reviewed_at,
      },
    });
  } catch (error) {
    console.error("POST /review/:id error:", error);

    return res.status(500).json({
      error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์",
    });
  }
});

router.get("/store/:id/reviews", async (req, res) => {
  try {
    const { id } = req.params;

    const storeRef = db.collection("stores").doc(id);

    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const reviewsSnap = await db
      .collection("reviews")
      .where("store_id", "==", storeRef)
      .orderBy("reviewed_at", "desc")
      .get();

    if (reviewsSnap.empty) {
      return res.json({
        ok: true,
        data: {
          avg_rating: 0,
          review_count: 0,
          reviews: [],
        },
      });
    }
    const reviews = await Promise.all(
      reviewsSnap.docs.map(async (doc) => {
        const review = doc.data() as Review;

        let customer = null;

        if (review.customer_id) {
          const customerSnap = await review.customer_id.get();

          if (customerSnap.exists) {
            customer = customerSnap.data() as CustomerData;
          }
        }

        return {
          review_id: doc.id,

          rating: review.rating ?? 0,

          comment: review.comment ?? null,

          reviewed_at: review.reviewed_at
            ? review.reviewed_at.toDate().toISOString()
            : null,

          reviewer_name:
            customer?.fullname ?? "ผู้ใช้ไม่ระบุชื่อ",

          reviewer_image:
            customer?.profile_image ?? "",
        };
      })
    );

    const ratingSum = reviews.reduce(
      (sum, review) => sum + review.rating,0);

    const avgRating = ratingSum / reviews.length;

    return res.json({
      ok: true,
      data: {
        avg_rating: Number(avgRating.toFixed(2)),
        review_count: reviews.length,
        reviews,
      },
    });

  } catch (error) {
    console.error("GET /store/:id/reviews error:", error);

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});

router.get("/store/order/list/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const storeRef = db.collection("stores").doc(id);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const ordersSnap = await db
  .collection("orders")
  .where("store_id", "==", storeRef)
  .where("status", "!=", "pending_confirmation")
  .orderBy("status")
  .orderBy("order_datetime", "desc")
  .get();

    if (ordersSnap.empty) {
      return res.json({
        ok: true,
        data: [],
      });
    }

    const data = await Promise.all(
      ordersSnap.docs.map(async (doc) => {
        const order = doc.data() as Order;

        let customer = null;
        if (order.customer_id) {
          const customerSnap = await order.customer_id.get();
          if (customerSnap.exists) {
            customer = customerSnap.data() as CustomerData;
          }
        }

        let address = null;
        if (order.address_id) {
          const addressSnap = await order.address_id.get();
          if (addressSnap.exists) {
            address = addressSnap.data() as CustomerAddress;
          }
        }

        return {
          order_id: doc.id,

          customer_fullname: customer?.fullname ?? "-",
          customer_phone: customer?.phone ?? "-",
          address_full: address?.address_text ?? "-",

          service_type: order.service_type,

          status: order.status ?? "waiting_pickup",

          order_datetime: order.order_datetime
            ? {
                _seconds: order.order_datetime.seconds,
              }
            : null,
        };
      })
    );

    return res.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
router.get("/store/history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { day, month, year, status } = req.query as {
      day?: string;
      month?: string;
      year?: string;
      status?: string;
    };

    const storeRef = db.collection("stores").doc(id);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
    }

    const statuses = ["completed", "cancelled"];
    const statusFilter = status && statuses.includes(status) ? [status] : statuses;

    let query = db
      .collection("orders")
      .where("store_id", "==", storeRef)
      .where("status", "in", statusFilter);

    if (day || month || year) {
      if (!day || !month || !year) {
        return res.status(400).json({
          ok: false,
          message: "กรุณาระบุ day, month และ year ให้ครบ",
        });
      }

      const date = dayjs.tz(
        `${year}-${month}-${day} 00:00:00`,
        "YYYY-M-D HH:mm:ss",
        TZ
      );

      if (!date.isValid()) {
        return res.status(400).json({
          ok: false,
          message: "วันที่ไม่ถูกต้อง",
        });
      }

      query = query
        .where("order_datetime", ">=", Timestamp.fromDate(date.startOf("day").toDate()))
        .where("order_datetime", "<", Timestamp.fromDate(date.add(1, "day").startOf("day").toDate()));
    }

    const snap = await query.orderBy("order_datetime", "desc").get();

    if (snap.empty) return res.json({ ok: true, data: [] });

    const data = await Promise.all(
      snap.docs.map(async (doc) => {
        const d = doc.data();

        const customerSnap = d.customer_id ? await d.customer_id.get() : null;
        const addressSnap = d.address_id ? await d.address_id.get() : null;

        const customer = customerSnap?.exists ? customerSnap.data() : null;
        const address = addressSnap?.exists ? addressSnap.data() : null;

        return {
          order_id: doc.id,
          customer_id: d.customer_id?.id ?? null,
          store_id: d.store_id?.id ?? null,
          address_id: d.address_id?.id ?? null,
          rider_pickup_id: d.rider_pickup_id?.id ?? null,
          rider_delivery_id: d.rider_delivery_id?.id ?? null,
          staff_id: d.staff_id?.id ?? null,
          service_type: d.service_type ?? null,
          wash_dry_weight: d.wash_dry_weight ?? 0,
          service_price: d.service_price ?? 0,
          delivery_price: d.delivery_price ?? 0,
          detergent_price: d.detergent_price ?? 0,
          total_amount:
            (d.service_price ?? 0) +
            (d.delivery_price ?? 0) +
            (d.detergent_price ?? 0),
          detergent_option: d.detergent_option ?? null,
          before_wash_image: d.before_wash_image ?? "",
          after_wash_image: d.after_wash_image ?? "",
          note: d.note ?? null,
          machine_washer_id: d.machine_washer_id?.id ?? null,
          machine_dryer_id: d.machine_dryer_id?.id ?? null,
          status: d.status ?? "waiting_pickup",
          order_datetime: d.order_datetime
            ? { _seconds: d.order_datetime.seconds }
            : null,
          customer_fullname: customer?.fullname ?? "-",
          customer_phone: customer?.phone ?? "-",
          address_full: address?.address_text ?? "-",
        };
      })
    );

    return res.json({ ok: true, data });
  } catch (error) {
    console.error("store history error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});
router.get("/store/completed/detail/:id", async (req, res) => {
  const orderId = req.params.id

  try {
    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const data = orderSnap.data()! as Order;

    if (data.status !== "completed") {
      return res.status(400).json({ error: "Order is not completed" });
    }

    const [riderPickupSnap, riderDeliverySnap, staffSnap, addressSnap, customerSnap] =
      await Promise.all([
        data.rider_pickup_id ? data.rider_pickup_id.get() : null,
        data.rider_delivery_id ? data.rider_delivery_id.get() : null,
        data.staff_id ? data.staff_id.get() : null,
        data.address_id ? data.address_id.get() : null,
        data.customer_id ? data.customer_id.get() : null,
      ]);

    const riderPickup = riderPickupSnap?.data() as Rider;
    const riderDelivery = riderDeliverySnap?.data() as Rider;
    const staff = staffSnap?.data() as LaundryStaff;
    const address = addressSnap?.data() as CustomerAddress;
    const customer = customerSnap?.data() as CustomerData;

    const order = {
      order_id: data.order_id,
      status: data.status,
      service_type: data.service_type,
      detergent_option: data.detergent_option,
      service_price: data.service_price ?? 0,
      delivery_price: data.delivery_price ?? 0,
      total_amount: (data.service_price ?? 0) + (data.delivery_price ?? 0) + (data?.detergent_price ?? 0),
      wash_dry_weight: data.wash_dry_weight,
      note: data.note,
      before_wash_image: data.before_wash_image,
      after_wash_image: data.after_wash_image,
      order_datetime: data.order_datetime,
      store_id: data.store_id?.id ?? null,
      address_id: data.address_id?.id ?? null,
      machine_washer_id: data.machine_washer_id?.id ?? null,
      machine_dryer_id: data.machine_dryer_id?.id ?? null,
      detergent_price: data.detergent_price ?? 0,
      customer_fullname: customer?.fullname ?? "-",
      customer_phone: customer?.phone ?? "-",
      address_full: address?.address_text ?? "-",
      rider_pickup: riderPickup ? {
        rider_id: riderPickup.rider_id,
        fullname: riderPickup.fullname,
        phone: riderPickup.phone,
        profile_image: riderPickup.profile_image,
        vehicle_type: riderPickup.vehicle_type,
        license_plate: riderPickup.license_plate,
      } : null,
      rider_delivery: riderDelivery ? {
        rider_id: riderDelivery.rider_id,
        fullname: riderDelivery.fullname,
        phone: riderDelivery.phone,
        profile_image: riderDelivery.profile_image,
        vehicle_type: riderDelivery.vehicle_type,
        license_plate: riderDelivery.license_plate,
      } : null,
      staff: staff ? {
        staff_id: staff.staff_id,
        fullname: staff.fullname,
        phone: staff.phone,
        profile_image: staff.profile_image,
        username: staff.username,
      } : null,
    };

    return res.status(200).json({ data: order });

  } catch (error) {
    console.error("Error fetching completed order:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});