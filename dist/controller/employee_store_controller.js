"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
exports.router = (0, express_1.Router)();
exports.router.get("/store/:id", async (req, res) => {
    try {
        const storeRef = firebase_1.db.collection("stores").doc(req.params.id);
        const search = String(req.query.search || "").toLowerCase().trim();
        const staffSnap = await firebase_1.db
            .collection("laundry_staff")
            .where("store_id", "==", storeRef)
            .get();
        const riderSnap = await firebase_1.db
            .collection("riders")
            .where("store_id", "==", storeRef)
            .get();
        let data = [];
        staffSnap.forEach((doc) => {
            const item = doc.data();
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
            const item = doc.data();
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
            data = data.filter((item) => `${item.fullname} ${item.username} ${item.phone} ${item.email}`
                .toLowerCase()
                .includes(search));
        }
        return res.json({
            ok: true,
            total: data.length,
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            ok: false,
            message: error.message || "Server error",
        });
    }
});
exports.router.get("/report/store/:id", async (req, res) => {
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
        if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ month และ year ให้ถูกต้อง",
            });
        }
        if (type === "day" && (!Number.isInteger(day) || day < 1 || day > 31)) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ day ให้ถูกต้อง",
            });
        }
        const storeRef = firebase_1.db.collection("stores").doc(storeId);
        if (!(await storeRef.get()).exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        let start;
        let end;
        if (type === "day") {
            const date = new Date(Date.UTC(year, month - 1, day));
            if (date.getUTCFullYear() !== year ||
                date.getUTCMonth() + 1 !== month ||
                date.getUTCDate() !== day) {
                return res.status(400).json({
                    ok: false,
                    message: "วันที่ไม่ถูกต้อง",
                });
            }
            const next = new Date(Date.UTC(year, month - 1, day + 1));
            start = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
            end = new Date(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}T00:00:00+07:00`);
        }
        else {
            start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`);
            const next = new Date(Date.UTC(year, month, 1));
            end = new Date(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+07:00`);
        }
        const [staffSnap, riderSnap, orderSnap] = await Promise.all([
            firebase_1.db.collection("laundry_staff")
                .where("store_id", "==", storeRef)
                .get(),
            firebase_1.db.collection("riders")
                .where("store_id", "==", storeRef)
                .get(),
            firebase_1.db.collection("orders")
                .where("store_id", "==", storeRef)
                .where("order_datetime", ">=", firestore_1.Timestamp.fromDate(start))
                .where("order_datetime", "<", firestore_1.Timestamp.fromDate(end))
                .get(),
        ]);
        const staffs = {};
        const riders = {};
        staffSnap.forEach((doc) => {
            const data = doc.data();
            staffs[doc.id] = {
                type: "staff",
                id: doc.id,
                fullname: data.fullname || "",
                profile_image: data.profile_image || null,
                total_jobs: 0,
            };
        });
        riderSnap.forEach((doc) => {
            const data = doc.data();
            riders[doc.id] = {
                type: "rider",
                id: doc.id,
                fullname: data.fullname || "",
                profile_image: data.profile_image || null,
                pickup_jobs: 0,
                delivery_jobs: 0,
                total_jobs: 0,
            };
        });
        orderSnap.forEach((doc) => {
            const order = doc.data();
            if (order.staff_id && staffs[order.staff_id.id]) {
                staffs[order.staff_id.id].total_jobs++;
            }
            if (order.rider_pickup_id && riders[order.rider_pickup_id.id]) {
                riders[order.rider_pickup_id.id].pickup_jobs++;
                riders[order.rider_pickup_id.id].total_jobs++;
            }
            if (order.rider_delivery_id && riders[order.rider_delivery_id.id]) {
                riders[order.rider_delivery_id.id].delivery_jobs++;
                riders[order.rider_delivery_id.id].total_jobs++;
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
            staffs: Object.values(staffs),
            riders: Object.values(riders),
        });
    }
    catch (error) {
        console.error("Employee report error:", error);
        return res.status(500).json({
            ok: false,
            message: error.message || "Server error",
        });
    }
});
