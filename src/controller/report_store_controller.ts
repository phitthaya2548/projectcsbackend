import { Router } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { db } from "../config/firebase";
import { Order } from "../modules/order";

dayjs.extend(utc);
dayjs.extend(timezone);

export const router = Router();

const TZ = "Asia/Bangkok";

const WEEKDAY_NAMES = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

const MONTH_NAMES = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

router.get("/store/walletbalance/:storeId", async (req, res) => {
  try {
    const storeSnap = await db.collection("stores").doc(req.params.storeId).get();

    if (!storeSnap.exists) {
      return res.status(404).json({ ok: false, message: "Store not found" });
    }

    return res.status(200).json({
      ok: true,
      wallet_balance: storeSnap.data()?.wallet_balance ?? 0,
    });
  } catch (error) {
    console.error("WALLET BALANCE ERROR:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/store/revenue/:storeId", async (req, res) => {
  try {
    const { storeId } = req.params;
    const range = String(req.query.range || "day");

    if (!["day", "week", "month", "year"].includes(range)) {
      return res.status(400).json({ ok: false, message: "range ไม่ถูกต้อง" });
    }

    const storeRef = db.collection("stores").doc(storeId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({ ok: false, message: "Store not found" });
    }

    const ordersSnap = await db
      .collection("orders")
      .where("store_id", "==", storeRef)
      .where("status", "==", "completed")
      .get();

    const orders = ordersSnap.docs
      .map(doc => doc.data() as Order)
      .filter(order => order.order_datetime)
      .map(order => ({
        time: order.order_datetime.toDate().getTime(),
        revenue:
          (order.service_price ?? 0) +
          (order.delivery_price ?? 0) +
          (order.detergent_price ?? 0),
      }));

    const sumOrders = (start: dayjs.Dayjs, end?: dayjs.Dayjs) => {
      const found = orders.filter(
        o => o.time >= start.valueOf() && (!end || o.time < end.valueOf())
      );
      return {
        revenue: found.reduce((sum, o) => sum + o.revenue, 0),
        order_count: found.length,
      };
    };

    const now = dayjs().tz(TZ);
    const startOfWeek = now.subtract((now.day() + 6) % 7, "day").startOf("day");
    const startOfMonth = now.startOf("month");
    const startOfYear = now.startOf("year");

    const bars: { label: string; start: dayjs.Dayjs; end: dayjs.Dayjs }[] = [];
    let summaryStart = now.startOf("day");

    if (range === "day") {
      for (let i = 0; i < 7; i++) {
        const start = startOfWeek.add(i, "day");
        bars.push({ label: WEEKDAY_NAMES[i], start, end: start.add(1, "day") });
      }
    }

    if (range === "week") {
      summaryStart = startOfWeek;
      const weekCount = Math.ceil(now.daysInMonth() / 7);
      for (let i = 0; i < weekCount; i++) {
        const start = startOfMonth.add(i * 7, "day");
        bars.push({ label: `สัปดาห์ ${i + 1}`, start, end: start.add(7, "day") });
      }
    }

    if (range === "month") {
      summaryStart = startOfMonth;
      for (let i = 0; i < 12; i++) {
        const start = startOfYear.add(i, "month");
        bars.push({ label: MONTH_NAMES[i], start, end: start.add(1, "month") });
      }
    }

    if (range === "year") {
      summaryStart = startOfYear;
      for (let i = -4; i <= 0; i++) {
        const start = startOfYear.add(i, "year");
        bars.push({ label: String(start.year()), start, end: start.add(1, "year") });
      }
    }

    const chart = bars.map(bar => ({
      label: bar.label,
      ...sumOrders(bar.start, bar.end),
    }));

    const result = sumOrders(summaryStart);
    const summary = {
      total_revenue: result.revenue,
      order_count: result.order_count,
    };

    return res.status(200).json({ ok: true, range, summary, chart });
  } catch (error) {
    console.error("REVENUE REPORT ERROR:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});