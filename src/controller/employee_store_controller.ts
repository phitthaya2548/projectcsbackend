import { Router } from "express";
import { db } from "../config/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { LaundryStaff } from "../modules/LaundryStaff";
import { Rider } from "../modules/rider";

export const router = Router();

router.get("/store/:id", async (req, res) => {
  try {
    const storeRef = db.collection("stores").doc(req.params.id);
    const search = String(req.query.search || "").toLowerCase().trim();

    const [staffSnap, riderSnap] = await Promise.all([
      db.collection("laundry_staff").where("store_id", "==", storeRef).get(),
      db.collection("riders").where("store_id", "==", storeRef).get(),
    ]);

    const staffs = staffSnap.docs.map((doc) => ({
      type: "staff",
      staff_id: doc.id,
      ...doc.data(),
    }));

    const riders = riderSnap.docs.map((doc) => ({
      type: "rider",
      rider_id: doc.id,
      ...doc.data(),
    }));

    let data = [...staffs, ...riders];

    if (search) {
      data = data.filter((item: any) =>
        [item.fullname, item.username, item.phone, item.email].some((value) =>
          String(value || "").toLowerCase().includes(search)
        )
      );
    }

    res.json({
      ok: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      message: error.message || "Server error",
    });
  }
});

router.get("/report/store/:id", async (req, res) => {
  try {
    const storeId = req.params.id;

    const type = String(req.query.type || "day");
    const day = Number(req.query.day);
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (!["day", "month"].includes(type)) {
      return res.status(400).json({
        ok: false,
        message: "type ต้องเป็น day หรือ month",
      });
    }

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ month และ year ให้ถูกต้อง",
      });
    }

    if (
      type === "day" &&
      (!Number.isInteger(day) || day < 1 || day > 31)
    ) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุ day ให้ถูกต้อง",
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

    let startDate: Date;
    let endDate: Date;

    if (type === "day") {
      const monthText = String(month).padStart(2, "0");
      const dayText = String(day).padStart(2, "0");

      startDate = new Date(
        `${year}-${monthText}-${dayText}T00:00:00+07:00`
      );

      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({
          ok: false,
          message: "วันที่ไม่ถูกต้อง",
        });
      }

      const checkYear = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
        }).format(startDate)
      );

      const checkMonth = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Bangkok",
          month: "numeric",
        }).format(startDate)
      );

      const checkDay = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Bangkok",
          day: "numeric",
        }).format(startDate)
      );

      if (
        checkYear !== year ||
        checkMonth !== month ||
        checkDay !== day
      ) {
        return res.status(400).json({
          ok: false,
          message: "วันที่ไม่ถูกต้อง",
        });
      }

      const nextDate = new Date(
        Date.UTC(year, month - 1, day + 1)
      );

      const nextYear = nextDate.getUTCFullYear();
      const nextMonth = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
      const nextDay = String(nextDate.getUTCDate()).padStart(2, "0");

      endDate = new Date(
        `${nextYear}-${nextMonth}-${nextDay}T00:00:00+07:00`
      );
    } else {
      const monthText = String(month).padStart(2, "0");

      startDate = new Date(
        `${year}-${monthText}-01T00:00:00+07:00`
      );

      let nextMonth = month + 1;
      let nextYear = year;

      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      endDate = new Date(
        `${nextYear}-${String(nextMonth).padStart(
          2,
          "0"
        )}-01T00:00:00+07:00`
      );
    }

    const [staffSnap, riderSnap, orderSnap] = await Promise.all([
      db
        .collection("laundry_staff")
        .where("store_id", "==", storeRef)
        .get(),

      db
        .collection("riders")
        .where("store_id", "==", storeRef)
        .get(),

      db
        .collection("orders")
        .where("store_id", "==", storeRef)
        .where(
          "order_datetime",
          ">=",
          Timestamp.fromDate(startDate)
        )
        .where(
          "order_datetime",
          "<",
          Timestamp.fromDate(endDate)
        )
        .get(),
    ]);

    const staffReport: Record<string, any> = {};

    staffSnap.docs.forEach((doc) => {
      const data = doc.data() as LaundryStaff;

      staffReport[doc.id] = {
        type: "staff",
        id: doc.id,
        fullname: data.fullname || "",
        profile_image: data.profile_image || null,
        total_jobs: 0,
      };
    });

    const riderReport: Record<string, any> = {};

    riderSnap.docs.forEach((doc) => {
      const data = doc.data() as Rider;

      riderReport[doc.id] = {
        type: "rider",
        id: doc.id,
        fullname: data.fullname || "",
        profile_image: data.profile_image || null,
        pickup_jobs: 0,
        delivery_jobs: 0,
        total_jobs: 0,
      };
    });

    orderSnap.docs.forEach((doc) => {
      const order = doc.data();

      if (order.staff_id) {
        const staffId = order.staff_id.id;

        if (staffReport[staffId]) {
          staffReport[staffId].total_jobs += 1;
        }
      }

      if (order.rider_pickup_id) {
        const riderId = order.rider_pickup_id.id;

        if (riderReport[riderId]) {
          riderReport[riderId].pickup_jobs += 1;
          riderReport[riderId].total_jobs += 1;
        }
      }

      if (order.rider_delivery_id) {
        const riderId = order.rider_delivery_id.id;

        if (riderReport[riderId]) {
          riderReport[riderId].delivery_jobs += 1;
          riderReport[riderId].total_jobs += 1;
        }
      }
    });
    return res.json({
      ok: true,
      period: {
        type,
        day: type === "day" ? String(day) : null,
        month: String(month),
        year: String(year),
      },
      total_orders: orderSnap.size,
      staffs: Object.values(staffReport),
      riders: Object.values(riderReport),
    });
  } catch (error: any) {
    console.error("Employee report error:", error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Server error",
    });
  }
});