import { Router } from "express";
import { db } from "../config/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { LaundryStaff } from "../modules/LaundryStaff";
import { Rider } from "../modules/rider";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "Asia/Bangkok";
export const router = Router();


type Employee = {
  type: "staff" | "rider";
  id: string;
  fullname: string;
  username: string;
  phone: string;
  email: string;
  status: string;
  profile_image: string;
  vehicle_type?: string;
  license_plate?: string;
};

router.get("/store/:id", async (req, res) => {
  try {
    const storeRef = db.collection("stores").doc(req.params.id);
    const search = String(req.query.search || "").toLowerCase().trim();

    const staffSnap = await db
      .collection("laundry_staff")
      .where("store_id", "==", storeRef)
      .get();

    const riderSnap = await db
      .collection("riders")
      .where("store_id", "==", storeRef)
      .get();

    let data: Employee[] = [];

    staffSnap.forEach((doc) => {
      const item = doc.data() as LaundryStaff;

      data.push({
        type: "staff",
        id: doc.id,
        fullname: item.fullname || "",
        username: item.username || "",
        phone: item.phone || "",
        email: item.email || "",
        status: item.status || "",
        profile_image: item.profile_image || "",
      });
    });

    riderSnap.forEach((doc) => {
      const item = doc.data() as Rider;

      data.push({
        type: "rider",
        id: doc.id,
        fullname: item.fullname || "",
        username: item.username || "",
        phone: item.phone || "",
        email: item.email || "",
        status: item.status || "",
        profile_image: item.profile_image || "",
        vehicle_type: item.vehicle_type || "",
        license_plate: item.license_plate || "",
      });
    });

    if (search) {
      data = data.filter((item) =>
        `${item.fullname} ${item.username} ${item.phone} ${item.email}`
          .toLowerCase()
          .includes(search)
      );
    }

    return res.json({
      ok: true,
      total: data.length,
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error.message || "Server error",
    });
  }
});

router.get("/report/store/:id", async (req, res) => {
  try {
   const now = dayjs().tz(TZ);

const storeId = req.params.id;
const type = String(req.query.type || "day");
const yearNum = req.query.year ? Number(req.query.year) : now.year();
const monthNum = req.query.month ? Number(req.query.month) : now.month() + 1;
const dayNum =
  type === "day"
    ? req.query.day
      ? Number(req.query.day)
      : now.date()
    : 1;

    if (!["day", "month"].includes(type)) {
      return res.status(400).json({
        ok: false,
        message: "type ต้องเป็น day หรือ month",
      });
    }

    if (
      !Number.isInteger(monthNum) ||
      monthNum < 1 ||
      monthNum > 12 ||
      !Number.isInteger(yearNum) ||
      !Number.isInteger(dayNum)
    ) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาระบุวันที่ให้ถูกต้อง",
      });
    }

    const base = dayjs.tz(`${yearNum}-${monthNum}-${dayNum}`, "YYYY-M-D", TZ);

    if (
      !base.isValid() ||
      base.month() + 1 !== monthNum ||
      base.date() !== dayNum
    ) {
      return res.status(400).json({
        ok: false,
        message: "วันที่ไม่ถูกต้อง",
      });
    }

    const unit = type === "day" ? "day" : "month";
    const start = base.startOf(unit);
    const end = start.add(1, unit);

    const storeRef = db.collection("stores").doc(storeId);

    if (!(await storeRef.get()).exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const [staffSnap, riderSnap, orderSnap] = await Promise.all([
      db.collection("laundry_staff")
        .where("store_id", "==", storeRef)
        .get(),

      db.collection("riders")
        .where("store_id", "==", storeRef)
        .get(),

      db.collection("orders")
        .where("store_id", "==", storeRef)
        .where("status", "==", "completed")
        .where("order_datetime", ">=", Timestamp.fromDate(start.toDate()))
        .where("order_datetime", "<", Timestamp.fromDate(end.toDate()))
        .get(),
    ]);

    const orders = orderSnap.docs.map((doc) => doc.data());

    const staffs = staffSnap.docs.map((doc) => {
      const data = doc.data() as LaundryStaff;
      return {
        type: "staff",
        id: doc.id,
        fullname: data.fullname || "",
        profile_image: data.profile_image || null,
        total_jobs: orders.filter((o) => o.staff_id?.id === doc.id).length,
      };
    });

    const riders = riderSnap.docs.map((doc) => {
      const data = doc.data() as Rider;
      const pickup_jobs = orders.filter((o) => o.rider_pickup_id?.id === doc.id).length;
      const delivery_jobs = orders.filter((o) => o.rider_delivery_id?.id === doc.id).length;

      return {
        type: "rider",
        id: doc.id,
        fullname: data.fullname || "",
        profile_image: data.profile_image || null,
        pickup_jobs,
        delivery_jobs,
        total_jobs: pickup_jobs + delivery_jobs,
      };
    });

    staffs.sort((a, b) => b.total_jobs - a.total_jobs);
    riders.sort((a, b) => b.total_jobs - a.total_jobs);

    return res.json({
      ok: true,
      period: {
        type,
        day: type === "day" ? String(dayNum) : null,
        month: String(monthNum),
        year: String(yearNum),
      },
      total_orders: orderSnap.size,
      staffs,
      riders,
    });
  } catch (error: any) {
    console.error("Employee report error:", error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Server error",
    });
  }
}
)
