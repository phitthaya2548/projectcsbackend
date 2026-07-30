import { Router } from "express";
import { db } from "../config/firebase";

export const router = Router();

const WEEKDAY_NAMES = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];


const MONTH_NAMES = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];


function toBkkDate(date: Date): Date {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

// แปลง getDay() ของ JS (0=อาทิตย์...6=เสาร์) ให้เป็น index แบบไทย (0=จันทร์...6=อาทิตย์)
function thaiWeekdayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// หาว่า "วันจันทร์ของสัปดาห์นี้" คือวันที่เท่าไหร่ (เทียบกับ now)
function getStartOfWeek(bkkNow: Date): Date {
  const dayIndex = thaiWeekdayIndex(bkkNow.getUTCDay()); // 0=จันทร์
  const start = new Date(bkkNow);
  start.setUTCDate(bkkNow.getUTCDate() - dayIndex);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}


function sumOrdersInRange(
  orders: { date: Date; revenue: number }[],
  start: Date,
  end: Date
) {
  const ordersInRange = orders.filter((o) => o.date >= start && o.date < end);

  const revenue = ordersInRange.reduce((sum, o) => sum + o.revenue, 0);
  const orderCount = ordersInRange.length;

  return { revenue, orderCount };
}

router.get("/store/revenue/:storeId", async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const range = (req.query.range as string) || "day"; // day, week, month, year

    const storeRef = db.collection("stores").doc(storeId);

    // ----- Step 1: ดึงออเดอร์ที่เสร็จแล้วทั้งหมดของร้านนี้ -----
    const ordersSnap = await db
      .collection("orders")
      .where("store_id", "==", storeRef)
      .where("status", "==", "completed")
      .get();

    const orders = ordersSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        date: toBkkDate(data.order_datetime.toDate()),
        revenue: (data.service_price || 0) + (data.delivery_price || 0),
      };
    });

    // ----- Step 2: หาขอบเขตของ "วันนี้" ตามเวลาไทย -----
    const bkkNow = toBkkDate(new Date());
    const startOfToday = new Date(bkkNow);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfWeek = getStartOfWeek(bkkNow); // วันจันทร์ของสัปดาห์นี้

    const startOfMonth = new Date(Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), 1));

    const startOfYear = new Date(Date.UTC(bkkNow.getUTCFullYear(), 0, 1));

    // ----- Step 3: คำนวณ summary (การ์ดสรุปด้านบน) ตาม range ที่เลือก -----
    let summaryStart: Date;
    if (range === "week") summaryStart = startOfWeek;
    else if (range === "month") summaryStart = startOfMonth;
    else if (range === "year") summaryStart = startOfYear;
    else summaryStart = startOfToday; // default = day

    const ordersInSummaryRange = orders.filter((o) => o.date >= summaryStart);

    const summary = {
      total_revenue: ordersInSummaryRange.reduce((sum, o) => sum + o.revenue, 0),
      order_count: ordersInSummaryRange.length,
    };

    // ----- Step 4: สร้างข้อมูลกราฟ ตาม range ที่เลือก -----
    // แต่ละจุดในกราฟตอนนี้มีทั้ง revenue (ยอดเงิน) และ order_count (จำนวนออเดอร์) ของวัน/สัปดาห์/เดือน/ปีนั้นๆ
    let chart: { label: string; revenue: number; order_count: number }[] = [];

    if (range === "day") {
      // กราฟ: รายวัน จันทร์-อาทิตย์ ของสัปดาห์นี้
      chart = WEEKDAY_NAMES.map((name, index) => {
        const dayStart = new Date(startOfWeek);
        dayStart.setUTCDate(startOfWeek.getUTCDate() + index);
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCDate(dayStart.getUTCDate() + 1);

        const { revenue, orderCount } = sumOrdersInRange(orders, dayStart, dayEnd);

        return { label: name, revenue, order_count: orderCount };
      });
    } else if (range === "week") {
      // กราฟ: รายสัปดาห์ ของเดือนนี้ (สัปดาห์ 1, 2, 3, 4, ...)
      const daysInMonth = new Date(
        Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth() + 1, 0)
      ).getUTCDate();

      const weekCount = Math.ceil(daysInMonth / 7);

      chart = Array.from({ length: weekCount }, (_, i) => {
        const weekStart = new Date(startOfMonth);
        weekStart.setUTCDate(startOfMonth.getUTCDate() + i * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

        const { revenue, orderCount } = sumOrdersInRange(orders, weekStart, weekEnd);

        return { label: `สัปดาห์ ${i + 1}`, revenue, order_count: orderCount };
      });
    } else if (range === "month") {
      // กราฟ: รายเดือน ม.ค.-ธ.ค. ของปีนี้
      chart = MONTH_NAMES.map((name, index) => {
        const monthStart = new Date(Date.UTC(bkkNow.getUTCFullYear(), index, 1));
        const monthEnd = new Date(Date.UTC(bkkNow.getUTCFullYear(), index + 1, 1));

        const { revenue, orderCount } = sumOrdersInRange(orders, monthStart, monthEnd);

        return { label: name, revenue, order_count: orderCount };
      });
    } else if (range === "year") {
      // กราฟ: รายปี ย้อนหลัง 5 ปี (รวมปีปัจจุบัน)
      const currentYear = bkkNow.getUTCFullYear();
      const yearsToShow = 5;

      chart = Array.from({ length: yearsToShow }, (_, i) => {
        const year = currentYear - (yearsToShow - 1 - i);
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

        const { revenue, orderCount } = sumOrdersInRange(orders, yearStart, yearEnd);

        return { label: String(year), revenue, order_count: orderCount };
      });
    }


    return res.json({
      ok: true,
      range,
      summary,
      chart,
    });
  } catch (e: any) {
    console.error("REPORT ERROR:", e);
    return res.status(500).json({
      ok: false,
      message: e.message,
    });
  }
});