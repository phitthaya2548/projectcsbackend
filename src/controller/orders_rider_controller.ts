import  { Router } from "express";
import { bucket, db} from "../config/firebase";
import { Order, } from "../modules/order";
import { upload } from "../middlewares/upload";
import { DistanceService } from "../services/haversine";
import { LaundryStaff } from "../modules/LaundryStaff";
import { CustomerAddress } from "../modules/address_customer";
import { CustomerData } from "../modules/customer";
import { Rider } from "../modules/rider";


export const router = Router();
router.put(
  "/update/status/:id",
  upload.single("image"),
  async (req, res) => {
    try {
      const order_id = req.params.id as string;
      const { status, rider_id } = req.body;

      if (!status) {
        return res.status(400).json({ ok: false, message: "กรุณาระบุสถานะ" });
      }

      const orderRef = db.collection("orders").doc(order_id);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
      }

      const orderData = orderSnap.data();
      const updateData: Partial<Order> = { status };

      // อัปโหลดรูป
      if (req.file) {
        const fileName = `orders/${order_id}/${Date.now()}_${req.file.originalname}`;
        const file = bucket.file(fileName);
        await file.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        if (status === "pickup_completed") updateData.before_wash_image = publicUrl;
        if (status === "completed") updateData.after_wash_image = publicUrl;
      }

      // ไรเดอร์รับผ้าจากบ้านลูกค้าแล้ว กำลังเดินทางไปร้าน
      if (status === "pickup_completed") {
        if (!rider_id) {
          return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
        }
        if (!orderData?.rider_pickup_id) {
          updateData.rider_pickup_id = db.collection("riders").doc(rider_id);
        }
      }

      if (status === "waiting_wash") {
        if (!rider_id) {
          return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
        }
        updateData.rider_pickup_id = db.collection("riders").doc(rider_id);
      }

      if (status === "completed") {
        if (!rider_id) {
          return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
        }
        updateData.rider_delivery_id = db.collection("riders").doc(rider_id);
      }

      await orderRef.update(updateData);

      return res.json({ ok: true, message: "อัปเดตสถานะสำเร็จ", data: updateData });

    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, message: "server error" });
    }
  }
);


router.get("/:id", async (req, res) => {
  try {
    const rider_id = req.params.id as string;

    const riderLat = parseFloat(req.query.lat as string);
    const riderLng = parseFloat(req.query.lng as string);

    const hasRiderLocation = !isNaN(riderLat) && !isNaN(riderLng);

    const riderRef = db.collection("riders").doc(rider_id);

    const activeStatuses = [
      "picked_up",
      "pickup_completed",
      "delivering",
    ];

    const [pickupOrdersSnap, deliveryOrdersSnap] = await Promise.all([
      db.collection("orders")
        .where("rider_pickup_id", "==", riderRef)
        .where("status", "in", activeStatuses)
        .get(),

      db.collection("orders")
        .where("rider_delivery_id", "==", riderRef)
        .where("status", "in", activeStatuses)
        .get(),
    ]);

    const orderDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const doc of pickupOrdersSnap.docs) {
      orderDocs.push(doc);
    }

    for (const doc of deliveryOrdersSnap.docs) {
      let alreadyExists = false;

      for (const savedDoc of orderDocs) {
        if (savedDoc.id === doc.id) {
          alreadyExists = true;
          break;
        }
      }

      if (!alreadyExists) {
        orderDocs.push(doc);
      }
    }

    if (orderDocs.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบออเดอร์ของไรเดอร์คนนี้",
      });
    }

    const orders = await Promise.all(
      orderDocs.map(async (orderDoc) => {
        const orderData = orderDoc.data();

        const addressRef = orderData.address_id ?? null;
        const customerRef = orderData.customer_id ?? null;

        const [addressSnap, customerSnap] = await Promise.all([
  addressRef ? addressRef.get() : null,
  customerRef ? customerRef.get() : null,
]);
        let addressText = null;
        let addressLat = null;
        let addressLng = null;

        if (addressSnap && addressSnap.exists) {
          const addressData = addressSnap.data();

          addressText = addressData?.address_text ?? null;
          addressLat = addressData?.latitude ?? null;
          addressLng = addressData?.longitude ?? null;
        }

        let customer = null;

        if (customerSnap && customerSnap.exists) {
          const customerData = customerSnap.data();

          customer = {
            id: customerSnap.id,
            name: customerData?.fullname ?? null,
            phone: customerData?.phone ?? null,
            profile_image: customerData?.profile_image ?? null,
          };
        }

        let distanceKm = 0;

        if (hasRiderLocation && addressLat !== null && addressLng !== null) {
          const distance = DistanceService.haversineKm(
            riderLat,
            riderLng,
            addressLat,
            addressLng
          );

          distanceKm = Number(distance.toFixed(1));
        }

        let orderDatetime = null;

        if (orderData.order_datetime) {
          orderDatetime = {
            _seconds: orderData.order_datetime.seconds,
          };
        }

        return {
          id: orderDoc.id,
          order_number: orderData.order_number ?? null,
          status: orderData.status ?? null,
          service_type: orderData.service_type ?? null,
          distance_km: distanceKm,
          time_slot: orderData.time_slot ?? null,
          note: orderData.note ?? null,
          before_wash_image: orderData.before_wash_image ?? null,
          after_wash_image: orderData.after_wash_image ?? null,
          rider_pickup_id: orderData.rider_pickup_id
            ? orderData.rider_pickup_id.id
            : null,
          rider_delivery_id: orderData.rider_delivery_id
            ? orderData.rider_delivery_id.id
            : null,
          address_lat: addressLat,
          address_lng: addressLng,
          order_datetime: orderDatetime,
          address: addressText,
          customer: customer,
        };
      })
    );

    return res.json({
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
router.get("/detail/:id", async (req, res) => {
  try {
    const order_id = req.params.id as string;

    const orderSnap = await db.collection("orders").doc(order_id).get();

    if (!orderSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบคำสั่งซื้อ",
      });
    }

    const orderData = orderSnap.data() as Order;

    const customerRef = orderData.customer_id ?? null;
    const addressRef = orderData.address_id ?? null;
    const staffRef = orderData.staff_id ?? null;
    const riderPickupRef = orderData.rider_pickup_id ?? null;
    const riderDeliveryRef = orderData.rider_delivery_id ?? null;

    const [
      customerSnap,
      addressSnap,
      staffSnap,
      riderPickupSnap,
      riderDeliverySnap,
    ] = await Promise.all([
      customerRef ? customerRef.get() : Promise.resolve(null),
      addressRef ? addressRef.get() : Promise.resolve(null),
      staffRef ? staffRef.get() : Promise.resolve(null),
      riderPickupRef ? riderPickupRef.get() : Promise.resolve(null),
      riderDeliveryRef ? riderDeliveryRef.get() : Promise.resolve(null),
    ]);

    let customer = null;
    if (customerSnap && customerSnap.exists) {
      const customerData = customerSnap.data() as CustomerData;
      customer = {
        customer_id: customerSnap.id,
        username: customerData.username,
        fullname: customerData.fullname,
        profile_image: customerData.profile_image,
        phone: customerData.phone,
      };
    }

    let address = null;
if (addressSnap && addressSnap.exists) {
  const addressData = addressSnap.data() as CustomerAddress;
  address = {
    address_text: addressData.address_text,
    latitude: addressData.latitude,
    longitude: addressData.longitude,
  };
}

    let staff = null;
    if (staffSnap && staffSnap.exists) {
      const staffData = staffSnap.data() as LaundryStaff;
      staff = {
        fullname: staffData.fullname,
        phone: staffData.phone,
        profile_image: staffData.profile_image,
      };
    }

    let rider_pickup = null;
    if (riderPickupSnap && riderPickupSnap.exists) {
      const riderPickupData = riderPickupSnap.data() as Rider;
      rider_pickup = {
        fullname: riderPickupData.fullname,
        phone: riderPickupData.phone,
        vehicle_type: riderPickupData.vehicle_type,
        license_plate: riderPickupData.license_plate,
        profile_image: riderPickupData.profile_image,
      };
    }

    let rider_delivery = null;
    if (riderDeliverySnap && riderDeliverySnap.exists) {
      const riderDeliveryData = riderDeliverySnap.data() as Rider;
      rider_delivery = {
        fullname: riderDeliveryData.fullname,
        phone: riderDeliveryData.phone,
        vehicle_type: riderDeliveryData.vehicle_type,
        license_plate: riderDeliveryData.license_plate,
        profile_image: riderDeliveryData.profile_image,
      };
    }

    return res.json({
      ok: true,
      data: {
        order_id: orderSnap.id,
        customer_id: orderData.customer_id?.id ?? null,
        address_id: orderData.address_id?.id ?? null,
        store_id: orderData.store_id?.id ?? null,
        rider_pickup_id: orderData.rider_pickup_id?.id ?? null,
        rider_delivery_id: orderData.rider_delivery_id?.id ?? null,
        machine_washer_id: orderData.machine_washer_id?.id ?? null,
        machine_dryer_id: orderData.machine_dryer_id?.id ?? null,
        staff_id: orderData.staff_id?.id ?? null,
        service_type: orderData.service_type,
        wash_dry_weight: orderData.wash_dry_weight,
        service_price: orderData.service_price,
        delivery_price: orderData.delivery_price,
        detergent_option: orderData.detergent_option,
        before_wash_image: orderData.before_wash_image,
        after_wash_image: orderData.after_wash_image,
        note: orderData.note,
        status: orderData.status,
        order_datetime: orderData.order_datetime,
        customer: customer,
        address: address,
        staff: staff,
        rider_pickup: rider_pickup,
        rider_delivery: rider_delivery,
      },
    });
  } catch (error) {
    console.error("get order detail error:", error);
    return res.status(500).json({
      ok: false,
      message: "เกิดข้อผิดพลาดในระบบ",
    });
  }
});
router.post("/accept/:id", async (req, res) => {
  try {
    const order_id = req.params.id;
    const { rider_id } = req.body;

    if (!rider_id) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ rider_id" });
    }

    const riderRef = db.collection("riders").doc(rider_id);
    const max_order = 3;

    
    const [pickupSnap, deliverySnap] = await Promise.all([
      db.collection("orders")
        .where("rider_pickup_id", "==", riderRef)
        .where("status", "==", "picked_up")
        .get(),
      db.collection("orders")
        .where("rider_delivery_id", "==", riderRef)
        .where("status", "==", "delivering")
        .get(),
    ]);

    const totalActive = pickupSnap.size + deliverySnap.size;
    if (totalActive >= max_order) {
      return res.status(400).json({
        ok: false,
        message: `คุณรับงานครบ ${max_order} งานแล้ว กรุณาจบงานก่อนรับงานใหม่`,
      });
    }

    
    const orderRef = db.collection("orders").doc(order_id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) throw new Error("ไม่พบออเดอร์นี้");

      const status = snap.data()?.status as string;

      if (status === "waiting_pickup") {
        if (snap.data()?.rider_pickup_id) throw new Error("งานนี้ถูกรับไปแล้ว");
        tx.update(orderRef, {
          rider_pickup_id: riderRef,
          status: "picked_up",
        });
      } else if (status === "waiting_delivery") {
        if (snap.data()?.rider_delivery_id) throw new Error("งานนี้ถูกรับไปแล้ว");
        tx.update(orderRef, {
          rider_delivery_id: riderRef,
          status: "delivering",
        });
      } else {
        throw new Error("สถานะงานไม่รองรับการรับงาน");
      }
    });

    return res.json({
      ok: true,
      message: `รับงานสำเร็จ! (งานที่ ${totalActive + 1}/${max_order})`,
    });

  } catch (error: any) {
    if (error.message) {
      return res.status(400).json({ ok: false, message: error.message });
    }
    console.error(error);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});