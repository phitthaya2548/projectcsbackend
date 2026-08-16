"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
exports.router = (0, express_1.Router)();
const WEEKDAY_NAMES = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const MONTH_NAMES = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function toBkkDate(date) {
    return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}
function thaiWeekdayIndex(jsDay) {
    return jsDay === 0 ? 6 : jsDay - 1;
}
function getStartOfWeek(bkkNow) {
    const dayIndex = thaiWeekdayIndex(bkkNow.getUTCDay());
    const start = new Date(bkkNow);
    start.setUTCDate(bkkNow.getUTCDate() - dayIndex);
    start.setUTCHours(0, 0, 0, 0);
    return start;
}
function sumOrdersInRange(orders, start, end) {
    const ordersInRange = orders.filter(o => o.date >= start && o.date < end);
    const revenue = ordersInRange.reduce((sum, o) => sum + o.revenue, 0);
    return { revenue, orderCount: ordersInRange.length };
}
exports.router.get("/store/walletbalance/:storeId", async (req, res) => {
    try {
        const storeId = req.params.storeId;
        const storeSnap = await firebase_1.db.collection("stores").doc(storeId).get();
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "Store not found" });
        }
        return res.status(200).json({
            ok: true,
            wallet_balance: storeSnap.data()?.wallet_balance ?? 0,
        });
    }
    catch (error) {
        console.error("WALLET REPORT ERROR:", error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
exports.router.get("/store/revenue/:storeId", async (req, res) => {
    try {
        const storeId = req.params.storeId;
        const range = String(req.query.range || "day");
        if (!["day", "week", "month", "year"].includes(range)) {
            return res.status(400).json({ ok: false, message: "range ไม่ถูกต้อง" });
        }
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "Store not found" });
        }
        const ordersSnap = await firebase_1.db.collection("orders")
            .where("store_id", "==", storeRef)
            .where("status", "==", "completed")
            .get();
        const orders = ordersSnap.docs
            .map(doc => doc.data())
            .filter(order => order.order_datetime)
            .map(order => ({
            date: toBkkDate(order.order_datetime.toDate()),
            revenue: (order.service_price ?? 0) +
                (order.delivery_price ?? 0) +
                (order.detergent_price ?? 0),
        }));
        const bkkNow = toBkkDate(new Date());
        const startOfToday = new Date(bkkNow);
        startOfToday.setUTCHours(0, 0, 0, 0);
        const startOfWeek = getStartOfWeek(bkkNow);
        const startOfMonth = new Date(Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), 1));
        const startOfYear = new Date(Date.UTC(bkkNow.getUTCFullYear(), 0, 1));
        let summaryStart = startOfToday;
        if (range === "week")
            summaryStart = startOfWeek;
        if (range === "month")
            summaryStart = startOfMonth;
        if (range === "year")
            summaryStart = startOfYear;
        const ordersInSummaryRange = orders.filter(o => o.date >= summaryStart);
        const summary = {
            total_revenue: ordersInSummaryRange.reduce((sum, o) => sum + o.revenue, 0),
            order_count: ordersInSummaryRange.length,
        };
        let chart = [];
        if (range === "day") {
            chart = WEEKDAY_NAMES.map((name, index) => {
                const dayStart = new Date(startOfWeek);
                dayStart.setUTCDate(startOfWeek.getUTCDate() + index);
                const dayEnd = new Date(dayStart);
                dayEnd.setUTCDate(dayStart.getUTCDate() + 1);
                const result = sumOrdersInRange(orders, dayStart, dayEnd);
                return { label: name, revenue: result.revenue, order_count: result.orderCount };
            });
        }
        if (range === "week") {
            const daysInMonth = new Date(Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth() + 1, 0)).getUTCDate();
            const weekCount = Math.ceil(daysInMonth / 7);
            chart = Array.from({ length: weekCount }, (_, index) => {
                const weekStart = new Date(startOfMonth);
                weekStart.setUTCDate(startOfMonth.getUTCDate() + index * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
                const result = sumOrdersInRange(orders, weekStart, weekEnd);
                return {
                    label: `สัปดาห์ ${index + 1}`,
                    revenue: result.revenue,
                    order_count: result.orderCount,
                };
            });
        }
        if (range === "month") {
            chart = MONTH_NAMES.map((name, index) => {
                const monthStart = new Date(Date.UTC(bkkNow.getUTCFullYear(), index, 1));
                const monthEnd = new Date(Date.UTC(bkkNow.getUTCFullYear(), index + 1, 1));
                const result = sumOrdersInRange(orders, monthStart, monthEnd);
                return { label: name, revenue: result.revenue, order_count: result.orderCount };
            });
        }
        if (range === "year") {
            const currentYear = bkkNow.getUTCFullYear();
            const yearsToShow = 5;
            chart = Array.from({ length: yearsToShow }, (_, index) => {
                const year = currentYear - (yearsToShow - 1 - index);
                const yearStart = new Date(Date.UTC(year, 0, 1));
                const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
                const result = sumOrdersInRange(orders, yearStart, yearEnd);
                return { label: String(year), revenue: result.revenue, order_count: result.orderCount };
            });
        }
        return res.status(200).json({
            ok: true,
            range,
            summary,
            chart,
        });
    }
    catch (error) {
        console.error("REVENUE REPORT ERROR:", error);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});
