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
    const order_id =req.params.id;
    const staff_id = req.body.staff_id;

    if (!order_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ order_id",
      });
    }

    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ staff_id",
      });
    }

    const orderRef = db
      .collection("orders")
      .doc(order_id);

    const staffRef = db
      .collection("laundry_staff")
      .doc(staff_id);

    const staffSnap = await staffRef.get();

    if (!staffSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบพนักงาน",
      });
    }

    let customerId: string | null = null;
    let currentStatus: OrderStatus | null = null;

    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);

      if (!orderSnap.exists) {
        throw {
          code: 404,
          message: "ไม่พบออเดอร์นี้",
        };
      }

      const order = orderSnap.data() as Order;

      if (
        order.status !== "waiting_wash" && order.status !== "waiting_dry"
      ) {
        throw {
          code: 409,
          message:
            "ออเดอร์นี้ไม่ได้อยู่ในสถานะรอซักหรือรออบ",
        };
      }

      if (order.staff_id) {
        throw {
          code: 409,
          message: "ออเดอร์นี้ถูกรับไปแล้ว",
        };
      }

      tx.update(orderRef, {
        staff_id: staffRef,
      } as UpdateData<Order>);

      customerId =
        order.customer_id?.id ?? null;

      currentStatus =
        order.status;
    });

    if (customerId && currentStatus) {
      try {
        const isDry =
          currentStatus === "waiting_dry";

        await NotificationService.sendToUser(
          customerId,
          "customer",
          "พนักงานซักอบรับงานแล้ว",
          isDry
            ? "พนักงานซักอบกำลังดำเนินการอบผ้าให้คุณ"
            : "พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ",
          {
            order_id,
            status: currentStatus,
          }
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
      message:
        currentStatus === "waiting_dry"
          ? "รับงานอบสำเร็จ"
          : "รับงานซักสำเร็จ",
      data: {
        order_id,
        staff_id,
        status: currentStatus,
      },
    });
  } catch (error: any) {
    console.error(
      "start wash error:",
      error
    );

    if (
      error?.code &&
      Number.isInteger(error.code)
    ) {
      return res.status(error.code).json({
        ok: false,
        message:
          error.message ?? "เกิดข้อผิดพลาด",
      });
    }

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});
router.get("/historynow/:id", async (req, res) => {
  try {
    const staff_id = String(req.params.id || "").trim();

    if (!staff_id) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ staff_id" });
    }

    const staffRef = db.collection("laundry_staff").doc(staff_id);
    const staffSnap = await staffRef.get();

    if (!staffSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบ staff คนนี้" });
    }

    const activeStatuses: OrderStatus[] = [
      "waiting_wash",
      "waiting_dry",
      "waiting_payment",
      "payment_completed",
      "washing",
      "drying",
      "waiting_delivery",
    ];

    const ordersSnap = await db.collection("orders")
      .where("staff_id", "==", staffRef)
      .where("status", "in", activeStatuses)
      .orderBy("order_datetime", "desc")
      .get();

    if (ordersSnap.empty) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const orders = await Promise.all(
      ordersSnap.docs.map(async (doc) => {
        const order = doc.data() as Order;

        const [storeSnap, addressSnap, customerSnap, washerSnap, dryerSnap] = await Promise.all([
          order.store_id ? order.store_id.get() : Promise.resolve(null),
          order.address_id ? order.address_id.get() : Promise.resolve(null),
          order.customer_id ? order.customer_id.get() : Promise.resolve(null),
          order.machine_washer_id ? order.machine_washer_id.get() : Promise.resolve(null),
          order.machine_dryer_id ? order.machine_dryer_id.get() : Promise.resolve(null),
        ]);

        const storeData = storeSnap?.exists ? storeSnap.data() as StoreData : null;
        const addressData = addressSnap?.exists ? addressSnap.data() as CustomerAddress : null;
        const customerData = customerSnap?.exists ? customerSnap.data() as CustomerData : null;
        const washerData = washerSnap?.exists ? washerSnap.data() as Machine : null;
        const dryerData = dryerSnap?.exists ? dryerSnap.data() as Machine : null;

        return {
          id: doc.id,
          store: storeData ? {
            id: storeSnap!.id,
            name: storeData.store_name ?? null,
          } : null,

          status: order.status ?? null,
          service_type: order.service_type ?? null,
          detergent_option: order.detergent_option ?? null,
          note: order.note ?? null,
          before_wash_image: order.before_wash_image ?? null,
          after_wash_image: order.after_wash_image ?? null,
          wash_dry_weight: order.wash_dry_weight ?? null,
          service_price: order.service_price ?? null,
          delivery_price: order.delivery_price ?? null,
          detergent_price: order.detergent_price ?? null,
          rider_pickup_id: order.rider_pickup_id?.id ?? null,
          rider_delivery_id: order.rider_delivery_id?.id ?? null,

          order_datetime: order.order_datetime
            ? order.order_datetime.toDate().toISOString()
            : null,

          address: addressData?.address_text ?? null,

          customer: customerData ? {
            id: customerSnap!.id,
            name: customerData.fullname ?? null,
            phone: customerData.phone ?? null,
            profile_image: customerData.profile_image ?? null,
          } : null,

          washer: washerData ? {
            id: washerSnap!.id,
            name: washerData.name ?? null,
            capacity: washerData.capacity ?? null,
            work_minutes: washerData.work_minutes ?? null,
            status: washerData.status ?? null,
          } : null,

          dryer: dryerData ? {
            id: dryerSnap!.id,
            name: dryerData.name ?? null,
            capacity: dryerData.capacity ?? null,
            work_minutes: dryerData.work_minutes ?? null,
            status: dryerData.status ?? null,
          } : null,
        };
      })
    );

    return res.status(200).json({ ok: true, data: orders });
  } catch (error) {
    console.error("get staff active orders error:", error);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});
router.put("/update/status/:id", async (req, res) => {
  try {
    const orderId = String(req.params.id || "").trim();
    const staff_id = String(req.body.staff_id || "").trim();
    const status = req.body.status as OrderStatus;

    if (!orderId) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ order_id",
      });
    }

    if (!staff_id) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ staff_id",
      });
    }

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ status",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);

    let customerId: string | null = null;
    let updatedStatus: OrderStatus | null = null;

    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);

      if (!orderSnap.exists) {
        throw {
          code: 404,
          message: "ไม่พบออเดอร์",
        };
      }

      const order = orderSnap.data() as Order;

      if (order.staff_id?.id !== staff_id) {
        throw {
          code: 403,
          message: "คุณไม่ใช่ staff ที่รับงานนี้",
        };
      }

      const updateData: UpdateData<Order> = {
        status,
        order_datetime: FieldValue.serverTimestamp(),
      };

      if (status === "drying") {
        if (order.machine_dryer_id) {
          const dryerSnap = await tx.get(
            order.machine_dryer_id
          );

          if (!dryerSnap.exists) {
            throw {
              code: 404,
              message: "ไม่พบเครื่องอบ",
            };
          }

          const dryerData =
            dryerSnap.data() as Machine;

          if (dryerData.status !== "available") {
            throw {
              code: 409,
              message:
                "เครื่องอบไม่ว่าง กรุณารอเครื่องซักเสร็จ",
            };
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

      customerId =
        order.customer_id?.id ?? null;

      updatedStatus = status;
    });

    if (customerId) {
      try {
        if (updatedStatus === "drying") {
          await NotificationService.sendToUser(
            customerId,
            "customer",
            "พนักงานกำลังอบผ้าให้คุณ",
            "",
            {
              order_id: orderId,
              status: updatedStatus,
            }
          );
        }

        if (updatedStatus === "waiting_delivery") {
          await NotificationService.sendToUser(
            customerId,
            "customer",
            "พนักงานซักอบซักผ้าเสร็จแล้ว",
            "พนักงานซักอบกำลังเตรียมส่งผ้าให้คุณ",
            {
              order_id: orderId,
              status: updatedStatus,
            }
          );
        }
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
        status: updatedStatus,
      },
    });
  } catch (err: any) {
    console.error(
      "update staff order status error:",
      err
    );

    if (err?.code) {
      return res.status(err.code).json({
        ok: false,
        message:
          err.message ?? "เกิดข้อผิดพลาด",
      });
    }

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});
router.put("/calculate/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { staff_id: staffId, weight, washer_id: washerId, dryer_id: dryerId } = req.body;

    if (!staffId || !Number.isFinite(weight) || weight <= 0) {
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

    if (order.staff_id?.id !== staffId) {
      return res.status(403).json({
        ok: false,
        message: "คุณไม่ใช่ staff ที่รับงานนี้",
      });
    }

    const allowedStatuses: OrderStatus[] = ["waiting_wash", "waiting_dry", "waiting_payment"];

    if (!allowedStatuses.includes(order.status)) {
      return res.status(409).json({
        ok: false,
        message: "สถานะออเดอร์ไม่รองรับการคำนวณราคา",
      });
    }

    if (!order.store_id || !order.customer_id) {
      return res.status(404).json({
        ok: false,
        message: !order.store_id ? "ไม่พบร้านค้า" : "ไม่พบ customer",
      });
    }

    const storeSnap = await order.store_id.get();

    if (!storeSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
    }

    const storeData = storeSnap.data() as StoreData;
    const detergentPrice = storeData.detergent_price ?? 0;
    const serviceType = order.service_type;
    const detergentOption = order.detergent_option as DETERGENT_OPTIONS;

    const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
    const needsDryer = serviceType === "dry" || serviceType === "wash_dry";

    const effectiveWasherId = washerId || order.machine_washer_id?.id;
    const effectiveDryerId = dryerId || order.machine_dryer_id?.id;

    if (needsWasher && !effectiveWasherId) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ washer_id" });
    }

    if (needsDryer && !effectiveDryerId) {
      return res.status(400).json({ ok: false, message: "กรุณาระบุ dryer_id" });
    }

    const washerRef = effectiveWasherId ? db.collection("machines").doc(effectiveWasherId) : null;
    const dryerRef = effectiveDryerId ? db.collection("machines").doc(effectiveDryerId) : null;

    const [washerSnap, dryerSnap] = await Promise.all([
      washerRef ? washerRef.get() : null,
      dryerRef ? dryerRef.get() : null,
    ]);

    const washer = washerSnap?.exists ? washerSnap.data() as Machine : null;
    const dryer = dryerSnap?.exists ? dryerSnap.data() as Machine : null;

    if (needsWasher) {
      if (!washer) {
        return res.status(404).json({ ok: false, message: "ไม่พบเครื่องซัก" });
      }

      if (washer.status !== "available") {
        return res.status(422).json({ ok: false, message: "เครื่องซักไม่ว่าง" });
      }

      if (washer.capacity < weight) {
        return res.status(422).json({ ok: false, message: "เครื่องซักรับน้ำหนักไม่พอ" });
      }
    }

    if (needsDryer) {
      if (!dryer) {
        return res.status(404).json({ ok: false, message: "ไม่พบเครื่องอบ" });
      }

      if (dryer.status !== "available") {
        return res.status(422).json({ ok: false, message: "เครื่องอบไม่ว่าง" });
      }

      if (dryer.capacity < weight) {
        return res.status(422).json({ ok: false, message: "เครื่องอบรับน้ำหนักไม่พอ" });
      }
    }

    const servicePrice = (washer?.price ?? 0) + (dryer?.price ?? 0);

    const detergentFee =
      needsWasher && detergentOption === "no_detergent"
        ? detergentPrice
        : 0;

    const deliveryFee = order.delivery_price ?? 0;
    const grandTotal = servicePrice + detergentFee + deliveryFee;

    let paid = false;
    let walletAfter = 0;
    let finalStatus: OrderStatus = order.status;
    let customerId: string | null = null;

    await db.runTransaction(async (tx) => {
      const freshOrderSnap = await tx.get(orderRef);

      if (!freshOrderSnap.exists) {
        throw { code: 404, message: "ไม่พบออเดอร์" };
      }

      const freshOrder = freshOrderSnap.data() as Order;

      if (freshOrder.staff_id?.id !== staffId) {
        throw { code: 403, message: "คุณไม่ใช่ staff ที่รับงานนี้" };
      }

      if (!allowedStatuses.includes(freshOrder.status)) {
        throw { code: 409, message: "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาลองใหม่" };
      }

      const customerRef = freshOrder.customer_id;

      if (!customerRef) {
        throw { code: 404, message: "ไม่พบ customer" };
      }

      const [customerSnap, freshWasherSnap, freshDryerSnap] = await Promise.all([
        tx.get(customerRef),
        washerRef ? tx.get(washerRef) : null,
        dryerRef ? tx.get(dryerRef) : null,
      ]);

      if (!customerSnap.exists) {
        throw { code: 404, message: "ไม่พบ customer" };
      }

      const wallet = customerSnap.data()?.wallet_balance ?? 0;
      const canPayNow = wallet >= grandTotal;

      const nextStatus: OrderStatus = canPayNow
        ? serviceType === "dry" ? "drying" : "washing"
        : "waiting_payment";

      if (canPayNow && washerRef && freshWasherSnap?.data()?.status !== "available") {
        throw { code: 409, message: "เครื่องซักถูกใช้งานไปแล้ว" };
      }

      if (canPayNow && dryerRef && freshDryerSnap?.data()?.status !== "available") {
        throw { code: 409, message: "เครื่องอบถูกใช้งานไปแล้ว" };
      }

      const updateData: UpdateData<Order> = {
        status: nextStatus,
        service_price: servicePrice,
        detergent_price: detergentFee,
        wash_dry_weight: weight,
        machine_washer_id: washerRef,
        machine_dryer_id: dryerRef,
      };

      if (freshOrder.status !== nextStatus) {
        updateData.order_datetime = FieldValue.serverTimestamp();
      }

      tx.update(orderRef, updateData);

      if (canPayNow) {
        if (washerRef) {
          tx.update(washerRef, { status: "busy" });
        }

        if (dryerRef && serviceType === "dry") {
          tx.update(dryerRef, { status: "busy" });
        }

        walletAfter = wallet - grandTotal;
        tx.update(customerRef, { wallet_balance: walletAfter });
      } else {
        walletAfter = wallet;
      }

      paid = canPayNow;
      finalStatus = nextStatus;
      customerId = customerRef.id;
    });

    if (customerId) {
      try {
        const message = paid
          ? serviceType === "dry"
            ? "ชำระเงินเรียบร้อยแล้ว พนักงานซักอบกำลังดำเนินการอบผ้าให้คุณ"
            : "ชำระเงินเรียบร้อยแล้ว พนักงานซักอบกำลังดำเนินการซักผ้าให้คุณ"
          : "ยอดเงินในกระเป๋าของคุณไม่พอชำระ กรุณาเติมเงิน";

        await NotificationService.sendToUser(
          customerId,
          "customer",
          "พนักงานซักอบคำนวณราคาเรียบร้อยแล้ว",
          message,
          { order_id: orderId, status: finalStatus }
        );
      } catch (error) {
        console.error("send notification error:", error);
      }
    }

    return res.status(200).json({
      ok: true,
      paid,
      message: paid
        ? "ชำระเงินแล้ว คำนวณราคาสำเร็จ เริ่มดำเนินการได้เลย"
        : "คำนวณราคาสำเร็จ แต่ยอดเงินในกระเป๋าไม่พอชำระ กรุณาเติมเงิน",
      data: {
        service_price: servicePrice,
        detergent_price: detergentFee,
        delivery_price: deliveryFee,
        total_amount: grandTotal,
        wallet_balance_after: walletAfter,
      },
    });
  } catch (err: any) {
    console.error("calculate order error:", err);

    if (err?.code) {
      return res.status(err.code).json({ ok: false, message: err.message });
    }

    return res.status(500).json({ ok: false, message: "server error" });
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
      return res.status(400).json({ ok: false, message: "กรุณาระบุ staff_id" });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบออเดอร์" });
    }

    const order = orderSnap.data() as Order;

    if (order.staff_id?.id !== staff_id) {
      return res.status(403).json({ ok: false, message: "คุณไม่ใช่ staff ที่รับงานนี้" });
    }

    if (order.status !== "payment_completed") {
      return res.status(409).json({
        ok: false,
        message: "ออเดอร์นี้ยังไม่ได้ชำระเงิน กรุณาใช้หน้าคำนวณราคาแทน",
      });
    }

    const serviceType = order.service_type;
    const needsWasher = serviceType === "wash" || serviceType === "wash_dry";
    const needsDryer = serviceType === "dry" || serviceType === "wash_dry";

    if (needsWasher && !order.machine_washer_id) {
      return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องซักที่ผูกไว้" });
    }

    if (needsDryer && !order.machine_dryer_id) {
      return res.status(422).json({ ok: false, message: "ออเดอร์นี้ไม่มีเครื่องอบที่ผูกไว้" });
    }

    const [washerSnap, dryerSnap] = await Promise.all([
      order.machine_washer_id ? order.machine_washer_id.get() : null,
      order.machine_dryer_id ? order.machine_dryer_id.get() : null,
    ]);

    const washerData = washerSnap?.exists ? washerSnap.data() as Machine : null;
    const dryerData = dryerSnap?.exists ? dryerSnap.data() as Machine : null;

    const washerBusy = needsWasher && washerData?.status !== "available";
    const dryerBusy = serviceType === "dry" && dryerData?.status !== "available";

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

    const nextStatus: OrderStatus = serviceType === "dry" ? "drying" : "washing";

    await db.runTransaction(async (tx) => {
      const freshOrderSnap = await tx.get(orderRef);

      if (!freshOrderSnap.exists) {
        throw { code: 404, message: "ไม่พบออเดอร์" };
      }

      const freshOrder = freshOrderSnap.data() as Order;

      if (freshOrder.staff_id?.id !== staff_id) {
        throw { code: 403, message: "คุณไม่ใช่ staff ที่รับงานนี้" };
      }

      if (freshOrder.status !== "payment_completed") {
        throw { code: 409, message: "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาลองใหม่" };
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
        throw {
          code: 409,
          waiting: true,
          message: "เครื่องซักถูกใช้งานไปแล้ว กรุณารอสักครู่",
        };
      }

      if (
        serviceType === "dry" &&
        freshDryerSnap &&
        freshDryerSnap.data()?.status !== "available"
      ) {
        throw {
          code: 409,
          waiting: true,
          message: "เครื่องอบถูกใช้งานไปแล้ว กรุณารอสักครู่",
        };
      }

      if (freshWasherSnap) {
        tx.update(freshWasherSnap.ref, { status: "busy" });
      }

      if (freshDryerSnap && serviceType === "dry") {
        tx.update(freshDryerSnap.ref, { status: "busy" });
      }

      tx.update(orderRef, {
        status: nextStatus,
        order_datetime: FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({
      ok: true,
      waiting: false,
      message: nextStatus === "drying" ? "เริ่มอบแล้ว" : "เริ่มซักแล้ว",
      data: { status: nextStatus },
    });
  } catch (err: any) {
    console.error("start paid error:", err);

    if (err?.waiting) {
      return res.status(200).json({
        ok: true,
        waiting: true,
        message: err.message,
      });
    }

    if (err?.code) {
      return res.status(err.code).json({
        ok: false,
        message: err.message,
      });
    }

    return res.status(500).json({ ok: false, message: "server error" });
  }
});
router.get("/detail/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return res.status(404).json({ ok: false, message: "ไม่พบคำสั่งซื้อ" });
    }

    const orderData = orderSnap.data() as Order;

    const [customerSnap, addressSnap, riderPickupSnap] = await Promise.all([
      orderData.customer_id?.get() ?? null,
      orderData.address_id?.get() ?? null,
      orderData.rider_pickup_id?.get() ?? null,
    ]);

    const customerData = customerSnap?.exists ? customerSnap.data() as CustomerData : null;
    const addressData = addressSnap?.exists ? addressSnap.data() as CustomerAddress : null;
    const riderPickupData = riderPickupSnap?.exists ? riderPickupSnap.data() as Rider : null;

    const customer = customerData && customerSnap ? {
      customer_id: customerSnap.id,
      username: customerData.username ?? null,
      fullname: customerData.fullname ?? null,
      profile_image: customerData.profile_image ?? null,
      phone: customerData.phone ?? null,
    } : null;

    const address = addressData ? {
      address_text: addressData.address_text ?? null,
    } : null;

    const riderPickup = riderPickupData ? {
      fullname: riderPickupData.fullname ?? null,
      phone: riderPickupData.phone ?? null,
      vehicle_type: riderPickupData.vehicle_type ?? null,
      license_plate: riderPickupData.license_plate ?? null,
      profile_image: riderPickupData.profile_image ?? null,
    } : null;

    const orderDatetime = orderData.order_datetime
      ? typeof (orderData.order_datetime as any).toDate === "function"
        ? (orderData.order_datetime as any).toDate().toISOString()
        : orderData.order_datetime
      : null;

    return res.status(200).json({
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

        service_type: orderData.service_type ?? null,
        wash_dry_weight: orderData.wash_dry_weight ?? null,
        service_price: orderData.service_price ?? null,
        delivery_price: orderData.delivery_price ?? null,
        detergent_price: orderData.detergent_price ?? null,
        detergent_option: orderData.detergent_option ?? null,

        before_wash_image: orderData.before_wash_image ?? null,
        after_wash_image: orderData.after_wash_image ?? null,
        note: orderData.note ?? null,
        status: orderData.status ?? null,
        order_datetime: orderDatetime,

        customer,
        address,
        rider_pickup: riderPickup,
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