"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_js_1 = require("../config/firebase.js");
exports.router = (0, express_1.Router)();
exports.router.get("/customers/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const search = String(req.query.q || "").trim().toLowerCase();
        const storeRef = firebase_js_1.db.collection("stores").doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({ ok: false, message: "ไม่พบร้านค้า" });
        }
        const ordersSnap = await firebase_js_1.db
            .collection("orders")
            .where("store_id", "==", storeRef)
            .get();
        // ใช้ Map โดยใช้ path เป็น key เพื่อกันลูกค้าซ้ำ
        const customerRefMap = new Map();
        ordersSnap.forEach((order) => {
            const customerRef = order.data().customer_id;
            if (customerRef) {
                customerRefMap.set(customerRef.path, customerRef);
            }
        });
        const customerSnaps = await Promise.all(Array.from(customerRefMap.values()).map((ref) => ref.get()));
        let customers = customerSnaps
            .filter((customer) => customer.exists)
            .map((customer) => {
            const data = customer.data();
            return {
                customer_id: customer.id,
                fullname: data.fullname || "",
                email: data.email || "",
                phone: data.phone || "",
                profile_image: data.profile_image || "",
            };
        });
        // กันข้อมูลซ้ำตามอีเมล (ถ้าไม่มีอีเมลใช้ customer_id)
        const seen = new Set();
        customers = customers.filter((c) => {
            const key = c.email || c.customer_id;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        if (search) {
            customers = customers.filter((c) => c.fullname.toLowerCase().includes(search) ||
                c.email.toLowerCase().includes(search) ||
                c.phone.toLowerCase().includes(search));
        }
        return res.json({
            ok: true,
            count: customers.length,
            data: customers,
        });
    }
    catch (error) {
        console.error("GET STORE CUSTOMERS ERROR:", error);
        return res.status(500).json({
            ok: false,
            message: error.message || "Server error",
        });
    }
});
