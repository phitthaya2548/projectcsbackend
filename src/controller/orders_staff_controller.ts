import { Router } from "express";
import { db } from "../config/firebase";

import { StoreData } from "../modules/store";
import { CustomerAddress } from "../modules/address_customer";
import { Machine } from "../modules/machine";
import { DETERGENT_OPTIONS, Order, OrderStatus } from "../modules/order";

import { DistanceService } from "../services/haversine";
import { DeliveryService } from "../services/calculateDelivery";
import { CustomerData } from "../modules/customer";
import { Rider } from "../modules/rider";
import { UpdateData, FieldValue } from "firebase-admin/firestore";
import { NotificationService } from "../services/notification";

export const router = Router();

router.put("/start_wash/:id", async (req, res) => {
  try {
    const order_id = req.params.id as string;
    const { staff_id } = req.body as { staff_id: string };

    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ staff_id",
      });
    }

    const orderRef = db.collection("orders").doc(order_id);
    const staffRef = db.collection("laundry_staff").doc(staff_id);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);

      if (!snap.exists) {
        throw { code: 404, message: "ไม่พบออเดอร์นี้" };
      }

      const order = snap.data() as Order;

      if (order.status !== "waiting_wash" && order.status !== "waiting_dry") {
        throw {
          code: 409,
          message: "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซักหรือรออบ",
        };
      }

      if (order.staff_id) {
        throw {
          code: 409,
          message: "ออเดอร์นี้ถูกรับไปแล้ว",
        };
      }

      const updateData: UpdateData<Order> = {
        staff_id: staffRef,
        status: order.status,
        order_datetime: FieldValue.serverTimestamp(),
      };

      tx.update(orderRef, updateData);
    });
    const orderSnap = await orderRef.get();
    const orderData = orderSnap.data();

    if (orderData?.customer_id) {

      await NotificationService.sendToUser(
        orderData.customer_id.id,
        "customer",
        "พนักงานซักอบรับงานแล้ว",
        "พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ",
        {
          order_id: order_id,
          status: orderData.status
        }
      );
    }

    return res.json({
      ok: true,
      message: "รับงานและเริ่มซัก",
    });

  } catch (error: any) {
    if (error.code) {
      return res.status(error.code).json({
        ok: false,
        message: error.message,
      });
    }

    console.error(error);
    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});
router.get("/historynow/:id", async (req, res) => {
  try {
    const staff_id = req.params.id;

    const staffRef = db.collection("laundry_staff").doc(staff_id);
    const staffSnap = await staffRef.get();

    if (!staffSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบ staff คนนี้" });
    }

    const ACTIVE_STATUS: OrderStatus[] = [
      "waiting_wash",
      "waiting_dry",
      "waiting_payment",
      'payment_completed',
      "washing",
      "drying",
      "waiting_delivery",
    ];

    const ordersSnap = await db
      .collection("orders")
      .where("staff_id", "==", staffRef)
      .where("status", "in", ACTIVE_STATUS)
      .get();

    if (ordersSnap.empty) {
      return res.json({ ok: true, data: [] });
    }

    const orders = await Promise.all(
      ordersSnap.docs.map(async (doc) => {
        const order = doc.data() as Order;

        const [storeSnap, addressSnap, customerSnap, washerSnap, dryerSnap] =
          await Promise.all([
            order.store_id ? order.store_id.get() : null,
            order.address_id ? order.address_id.get() : null,
            order.customer_id ? order.customer_id.get() : null,
            order.machine_washer_id ? order.machine_washer_id.get() : null,
            order.machine_dryer_id ? order.machine_dryer_id.get() : null,
          ]);

        let storeData = null;
        if (storeSnap && storeSnap.exists) {
          storeData = storeSnap.data();
        }

        let addressData = null;
        if (addressSnap && addressSnap.exists) {
          addressData = addressSnap.data();
        }

        let customerData = null;
        if (customerSnap && customerSnap.exists) {
          customerData = customerSnap.data();
        }

        let washerData = null;
        if (washerSnap && washerSnap.exists) {
          washerData = washerSnap.data();
        }

        let dryerData = null;
        if (dryerSnap && dryerSnap.exists) {
          dryerData = dryerSnap.data();
        }

        return {
          id: doc.id,

          store: storeData
            ? { id: storeSnap!.id, name: storeData.name ?? null }
            : null,

          status: order.status,
          service_type: order.service_type,
          detergent_option: order.detergent_option ?? null,
          note: order.note ?? null,

          before_wash_image: order.before_wash_image ?? null,
          after_wash_image: order.after_wash_image ?? null,

          wash_dry_weight: order.wash_dry_weight ?? null,
          service_price: order.service_price ?? null,
          delivery_price: order.delivery_price ?? null,

          rider_pickup_id: order.rider_pickup_id?.id ?? null,
          rider_delivery_id: order.rider_delivery_id?.id ?? null,

          order_datetime: order.order_datetime
            ? order.order_datetime.toDate()
            : null,

          address: addressData?.address_text ?? null,

          customer: customerData
            ? {
              id: customerSnap!.id,
              name: customerData.fullname ?? null,
              phone: customerData.phone ?? null,
              profile_image: customerData.profile_image ?? null,
            }
            : null,

          washer: washerData
            ? {
              id: washerSnap!.id,
              name: washerData.name ?? null,
              capacity: washerData.capacity ?? null,
              work_minutes: washerData.work_minutes ?? null,
              status: washerData.status ?? null,
            }
            : null,

          dryer: dryerData
            ? {
              id: dryerSnap!.id,
              name: dryerData.name ?? null,
              capacity: dryerData.capacity ?? null,
              work_minutes: dryerData.work_minutes ?? null,
              status: dryerData.status ?? null,
            }
            : null,
        };
      })
    );

    return res.json({ ok: true, data: orders });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});
router.put("/update/status/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { staff_id, status } = req.body as {
      staff_id: string;
      status: OrderStatus;
    };

    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ staff_id",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);

    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists)
        throw new Error("ไม่พบออเดอร์");

      const order = orderSnap.data() as Order;

      if (order.staff_id?.id !== staff_id)
        throw new Error("คุณไม่ใช่ staff ที่รับงานนี้");

      const updateData: UpdateData<Order> = {
        status,
        order_datetime: FieldValue.serverTimestamp(),
      };

      if (status === "washing") {

      }

      if (status === "drying") {
        
        if (order.machine_dryer_id) {
          const dryerSnap = await tx.get(order.machine_dryer_id);
          const dryerData = dryerSnap.data() as Machine | undefined;

          if (dryerData?.status !== "available") {
            throw new Error("เครื่องอบไม่ว่าง กรุณารอเครื่องซักเสร็จ");
          }
        }

        if (order.machine_washer_id) {
          tx.update(order.machine_washer_id, {
            status: "available",
          } as Partial<Machine>);
        }

        if (order.machine_dryer_id) {
          tx.update(order.machine_dryer_id, {
            status: "busy",
          } as Partial<Machine>);
        }
      }

      if (status === "waiting_delivery") {
        if (order.machine_washer_id) {
          tx.update(order.machine_washer_id, {
            status: "available",
          } as Partial<Machine>);
        }

        if (order.machine_dryer_id) {
          tx.update(order.machine_dryer_id, {
            status: "available",
          } as Partial<Machine>);
        }
      }

      tx.update(orderRef, updateData);
    });
    const orderSnap = await orderRef.get();
    const orderData = orderSnap.data();

    if (orderData?.customer_id && orderData?.status == "drying") {

      await NotificationService.sendToUser(
        orderData.customer_id.id,
        "customer",
        "พนักงานกำลังอบผ้าให้คุณ",
        "",
        {
          order_id: orderId,
          status: orderData.status
        }
      );
    }
    else if (orderData?.customer_id && orderData?.status == "waiting_delivery") {
      await NotificationService.sendToUser(
        orderData.customer_id.id,
        "customer",
        "พนักงานซักอบซักผ้าเสร็จแล้ว",
        "พนักงานซักอบกำลังเตรียมส่งผ้าให้คุณ",
        {
          order_id: orderId,
          status: orderData.status
        }
      );
    }

    

    return res.json({
      ok: true,
      message: "อัปเดตสถานะสำเร็จ",
      data: { status },
    });

  } catch (err: any) {
    console.error(err);

    if (err.message === "ไม่พบออเดอร์")
      return res.status(404).json({ ok: false, message: err.message });

    if (err.message === "คุณไม่ใช่ staff ที่รับงานนี้")
      return res.status(403).json({ ok: false, message: err.message });

    if (err.message === "เครื่องอบไม่ว่าง กรุณารอเครื่องซักเสร็จ")
      return res.status(409).json({ ok: false, message: err.message });

    return res.status(500).json({ ok: false, message: "server error" });
  }
});

router.put("/calculate/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { staff_id, weight, washer_id, dryer_id } = req.body;


    if (!staff_id || !weight || weight <= 0) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ staff_id และน้ำหนักให้ถูกต้อง",
      });
    }


    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const order = orderSnap.data() as Order;

    if (order.staff_id?.id !== staff_id) {
      return res.status(403).json({
        ok: false,
        message: "คุณไม่ใช่ staff ที่รับงานนี้",
      });
    }

    const storeRef = order.store_id;
    if (!storeRef) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
    }
    const detergent_price = storeRef ? (await storeRef.get()).data()?.detergent_price ?? 0 : 0;


    const allowedStatuses = ["waiting_wash", "waiting_dry", "waiting_payment", 'payment_completed'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(409).json({
        ok: false,
        message: "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซัก รออบ หรือรอชำระเงิน",
      });
    }

    const serviceType = order.service_type;
    const detergentOption = order.detergent_option as DETERGENT_OPTIONS;
    const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
    const needsDryer = serviceType === "dry" || serviceType === "wash_dry";


    const effectiveWasherId = washer_id || order.machine_washer_id?.id;
    const effectiveDryerId = dryer_id || order.machine_dryer_id?.id;


    let washer: Machine | null = null;
    let dryer: Machine | null = null;

    if (needsWasher) {
      if (!effectiveWasherId) {
        return res.status(400).json({ ok: false, message: "กรุณาระบุ washer_id" });
      }

      const snap = await db.collection("machines").doc(effectiveWasherId).get();
      if (!snap.exists) {
        return res.status(404).json({ ok: false, message: "ไม่พบเครื่องซัก" });
      }

      washer = snap.data() as Machine;

      if (washer.status !== "available") {
        return res.status(422).json({ ok: false, message: "เครื่องซักไม่ว่าง" });
      }

      if (washer.capacity < weight) {
        return res.status(422).json({ ok: false, message: "เครื่องซักรับน้ำหนักไม่พอ" });
      }
    }

    if (needsDryer) {
      if (!effectiveDryerId) {
        return res.status(400).json({ ok: false, message: "กรุณาระบุ dryer_id" });
      }

      const snap = await db.collection("machines").doc(effectiveDryerId).get();
      if (!snap.exists) {
        return res.status(404).json({ ok: false, message: "ไม่พบเครื่องอบ" });
      }

      dryer = snap.data() as Machine;

      if (dryer.status !== "available") {
        return res.status(422).json({ ok: false, message: "เครื่องอบไม่ว่าง" });
      }

      if (dryer.capacity < weight) {
        return res.status(422).json({ ok: false, message: "เครื่องอบรับน้ำหนักไม่พอ" });
      }
    }


    let servicePrice = (washer?.price ?? 0) + (dryer?.price ?? 0);


    if (needsWasher && detergentOption === "no_detergent") {
      servicePrice += detergent_price;
    }

    const deliveryFee = order.delivery_price ?? 0;
    const grandTotal = servicePrice + deliveryFee;


    let paid = false;
    let walletAfter = 0;
    let finalStatus: OrderStatus = order.status;
    let customerId: string | undefined = order.customer_id?.id;

    await db.runTransaction(async (tx) => {
      const orderDoc = await tx.get(orderRef);
      const orderData = orderDoc.data() as Order;

      const customerRef = orderData.customer_id;
      if (!customerRef) {
        throw new Error("ไม่พบ customer");
      }

      const customerSnap = await tx.get(customerRef);
      const wallet = customerSnap.data()?.wallet_balance ?? 0;

      const canPayNow = wallet >= grandTotal;
      const nextStatus: OrderStatus = canPayNow
        ? serviceType === "dry"
          ? "drying"
          : "washing"
        : "waiting_payment";

      if (canPayNow) {
        if (washer) {
          const fw = await tx.get(db.collection("machines").doc(effectiveWasherId));
          if (fw.data()?.status !== "available") {
            throw new Error("เครื่องซักถูกใช้งานไปแล้ว");
          }
        }
        if (dryer) {
          const fd = await tx.get(db.collection("machines").doc(effectiveDryerId));
          if (fd.data()?.status !== "available") {
            throw new Error("เครื่องอบถูกใช้งานไปแล้ว");
          }
        }
      }

      const updateData: Partial<Order> = {
        status: nextStatus,
        service_price: servicePrice,
        wash_dry_weight: weight,
        machine_washer_id: washer ? db.collection("machines").doc(effectiveWasherId) : null,
        machine_dryer_id: dryer ? db.collection("machines").doc(effectiveDryerId) : null,
        detergent_price: detergent_price
      };

      tx.update(orderRef, updateData);

      if (canPayNow) {
        if (washer) {
          tx.update(db.collection("machines").doc(effectiveWasherId), { status: "busy" });
        }

        
        if (dryer && serviceType === "dry") {
          tx.update(db.collection("machines").doc(effectiveDryerId), { status: "busy" });
        }

        tx.update(customerRef, { wallet_balance: wallet - grandTotal });
        walletAfter = wallet - grandTotal;
      } else {
        walletAfter = wallet;
      }

      paid = canPayNow;
      finalStatus = nextStatus;
      customerId = customerRef.id;
    });

    if (customerId) {
      if (paid) {
        await NotificationService.sendToUser(
          customerId,
          "customer",
          "พนักงานซักอบคำนวณราคาเรียบร้อยแล้ว",
          "ชำระเงินเรียบร้อยแล้ว พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ",
          {
            order_id: orderId,
            status: finalStatus
          }
        );
      } else {
        await NotificationService.sendToUser(
          customerId,
          "customer",
          "พนักงานซักอบคำนวณราคาเรียบร้อยแล้ว",
          "ยอดเงินในกระเป๋าของคุณไม่พอชำระ กรุณาเติมเงิน",
          {
            order_id: orderId,
            status: finalStatus
          }
        );
      }
    }
    
    return res.json({
      ok: true,
      paid,
      message: paid
        ? "ชำระเงินแล้ว คำนวณราคาสำเร็จ เริ่มดำเนินการได้เลย"
        : "คำนวณราคาสำเร็จ แต่ยอดเงินในกระเป๋าไม่พอชำระ กรุณาเติมเงิน",
      data: {
        service_price: servicePrice,
        delivery_fee: deliveryFee,
        total_amount: grandTotal,
        wallet_balance_after: walletAfter,
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      message: err.message ?? "server error",
    });
  }
});
router.get("/calculate/preview/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const staff_id = req.query.staff_id;

    if (!staff_id)
      return res.status(400).json({ ok: false, message: "กรุณาระบุ staff_id" });

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists)
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });

    const order = orderSnap.data()!;

    if (order.staff_id?.id !== staff_id)
      return res.status(403).json({ ok: false, message: "คุณไม่ใช่ staff ที่รับงานนี้" });

    const addressRef = order.address_id;
    const storeRef = order.store_id;

    const [addressSnap, storeSnap] = await Promise.all([
      addressRef.get(),
      storeRef.get(),
    ]);

    if (!addressSnap.exists)
      return res.status(404).json({ ok: false, message: "ไม่พบที่อยู่ลูกค้า" });

    const addressData = addressSnap.data() as CustomerAddress;
    const storeData = storeSnap.data() as StoreData;

    let delivery_price = 0;
    let distanceKm = 0;

    const storeLat = storeData?.latitude;
    const storeLng = storeData?.longitude;
    const cusLat = addressData?.latitude;
    const cusLng = addressData?.longitude;

    const detergen_price = storeData?.detergent_price ?? 0;
    if (storeLat && storeLng && cusLat && cusLng) {
      distanceKm = DistanceService.haversineKm(storeLat, storeLng, cusLat, cusLng);
      const serviceRadius = (storeData?.service_radius)
      const deliveryMin = (storeData?.delivery_min)
      const deliveryMax = (storeData?.delivery_max)

      if (distanceKm > serviceRadius)
        return res.status(422).json({
          ok: false,
          message: `ที่อยู่ลูกค้าอยู่นอกพื้นที่ให้บริการ `,
        });

      delivery_price = DeliveryService.calculateDeliveryFee(
        distanceKm,
        serviceRadius,
        deliveryMin,
        deliveryMax
      );
    }
    const updateData: Partial<Order> = {
      delivery_price: delivery_price,
    };
    await db.collection("orders").doc(orderId).update(updateData);
    return res.json({
      ok: true,
      message: "คำนวณค่าส่งสำเร็จ",
      data: {
        delivery_price: delivery_price,
        distance_km: Math.round(distanceKm * 100) / 100,
        detergent_price: detergen_price,
      },
    });

  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, message: err.message ?? "server error" });
  }
});
router.put("/start_paid/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { staff_id } = req.body;

    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ staff_id",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const order = orderSnap.data() as Order;

    if (order.staff_id?.id !== staff_id) {
      return res.status(403).json({
        ok: false,
        message: "คุณไม่ใช่ staff ที่รับงานนี้",
      });
    }

    // endpoint นี้ใช้ได้เฉพาะออเดอร์ที่จ่ายเงินไปแล้วเท่านั้น
    if (order.status !== "payment_completed") {
      return res.status(409).json({
        ok: false,
        message: "ออเดอร์นี้ยังไม่ได้ชำระเงิน กรุณาใช้หน้าคำนวณราคาแทน",
      });
    }

    const serviceType = order.service_type;
    const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
    const needsDryer = serviceType === "dry" || serviceType === "wash_dry";

    if (!order.machine_washer_id && needsWasher) {
      return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องซักที่ผูกไว้" });
    }
    if (!order.machine_dryer_id && needsDryer) {
      return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องอบที่ผูกไว้" });
    }

    const [washerSnap, dryerSnap] = await Promise.all([
      order.machine_washer_id ? order.machine_washer_id.get() : Promise.resolve(null),
      order.machine_dryer_id ? order.machine_dryer_id.get() : Promise.resolve(null),
    ]);

    const washerData = washerSnap?.data() as Machine | undefined;
    const dryerData = dryerSnap?.data() as Machine | undefined;

    const washerBusy = needsWasher && washerData?.status !== "available";
    const dryerBusy = needsDryer && dryerData?.status !== "available";

    if (washerBusy || dryerBusy) {

      return res.status(200).json({
        ok: true,
        waiting: true,
        message: washerBusy && dryerBusy
          ? "เครื่องซักและเครื่องอบยังไม่ว่าง กรุณารอสักครู่"
          : washerBusy
            ? `${washerData?.name ?? "เครื่องซัก"} ยังไม่ว่าง กรุณารอสักครู่`
            : `${dryerData?.name ?? "เครื่องอบ"} ยังไม่ว่าง กรุณารอสักครู่`,
        data: {
          washer_status: washerData?.status ?? null,
          dryer_status: dryerData?.status ?? null,
        },
      });
    }


    let nextStatus: OrderStatus = serviceType === "dry" ? "drying" : "washing";

    await db.runTransaction(async (tx) => {



      const freshOrderSnap = await tx.get(orderRef);
      const freshOrder = freshOrderSnap.data() as Order;

      if (freshOrder.status !== "payment_completed") {
        throw new Error("สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาลองใหม่");
      }

      const freshWasherSnap =
        needsWasher && freshOrder.machine_washer_id
          ? await tx.get(freshOrder.machine_washer_id)
          : null;

      const freshDryerSnap =
        needsDryer && freshOrder.machine_dryer_id
          ? await tx.get(freshOrder.machine_dryer_id)
          : null;

      if (freshWasherSnap && freshWasherSnap.data()?.status !== "available") {
        throw new Error("เครื่องซักถูกใช้งานไปแล้ว กรุณารอสักครู่");
      }

      if (freshDryerSnap && freshDryerSnap.data()?.status !== "available") {
        throw new Error("เครื่องอบถูกใช้งานไปแล้ว กรุณารอสักครู่");
      }


      if (freshWasherSnap) {
        tx.update(freshWasherSnap.ref, { status: "busy" });
      }

      if (freshDryerSnap) {
        tx.update(freshDryerSnap.ref, { status: "busy" });
      }

      tx.update(orderRef, {
        status: nextStatus,
      });
    });

    return res.json({
      ok: true,
      waiting: false,
      message: nextStatus === "drying" ? "เริ่มอบแล้ว" : "เริ่มซักแล้ว",
      data: { status: nextStatus },
    });
  } catch (err: any) {
    console.error(err);


    if (
      err.message?.includes("เครื่องซักถูกใช้งานไปแล้ว") ||
      err.message?.includes("เครื่องอบถูกใช้งานไปแล้ว")
    ) {
      return res.status(200).json({
        ok: true,
        waiting: true,
        message: err.message,
      });
    }

    return res.status(500).json({
      ok: false,
      message: err.message ?? "server error",
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
    const riderPickupRef = orderData.rider_pickup_id ?? null;

    const [
      customerSnap,
      addressSnap,
      riderPickupSnap,
    ] = await Promise.all([
      customerRef ? customerRef.get() : Promise.resolve(null),
      addressRef ? addressRef.get() : Promise.resolve(null),
      riderPickupRef ? riderPickupRef.get() : Promise.resolve(null),
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
        rider_pickup: rider_pickup,
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


