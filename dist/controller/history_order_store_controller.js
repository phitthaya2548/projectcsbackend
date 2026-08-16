"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const firebase_js_1 = require("../config/firebase.js");
exports.router = (0, express_1.Router)();
exports.router.get("/customers/:id", async (req, res) => {
    try {
        const storeId = req.params.id;
        const search = String(req.query.q ?? "")
            .trim()
            .toLowerCase();
        if (!storeId) {
            return res.status(400).json({
                ok: false,
                message: "กรุณาระบุ store_id",
            });
        }
        const storeRef = firebase_js_1.db
            .collection("stores")
            .doc(storeId);
        const storeSnap = await storeRef.get();
        if (!storeSnap.exists) {
            return res.status(404).json({
                ok: false,
                message: "ไม่พบร้านค้า",
            });
        }
        const ordersSnap = await firebase_js_1.db
            .collection("orders")
            .where("store_id", "==", storeRef)
            .get();
        const customerRefMap = new Map();
        ordersSnap.forEach((doc) => {
            const data = doc.data();
            const customerRef = data.customer_id;
            if (customerRef?.id) {
                customerRefMap.set(customerRef.id, customerRef);
            }
        });
        if (customerRefMap.size === 0) {
            return res.json({
                ok: true,
                count: 0,
                data: [],
            });
        }
        const customerDocs = await Promise.all(Array.from(customerRefMap.values()).map((ref) => ref.get()));
        let customers = customerDocs
            .filter((doc) => doc.exists)
            .map((doc) => {
            const data = doc.data();
            return {
                customer_id: doc.id,
                fullname: data?.fullname ?? "",
                email: data?.email ?? "",
                phone: data?.phone ?? "",
                profile_image: data?.profile_image ?? "",
            };
        });
        if (search) {
            customers = customers.filter((customer) => {
                const fullname = String(customer.fullname).toLowerCase();
                const email = String(customer.email).toLowerCase();
                const phone = String(customer.phone).toLowerCase();
                return (fullname.includes(search) ||
                    email.includes(search) ||
                    phone.includes(search));
            });
        }
        return res.json({
            ok: true,
            count: customers.length,
            data: customers,
        });
    }
    catch (e) {
        console.error("GET STORE CUSTOMERS ERROR:", e);
        return res.status(500).json({
            ok: false,
            message: e.message ?? "Server error",
        });
    }
});
