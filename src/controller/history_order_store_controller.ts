import { Router } from "express";
import { db } from "../config/firebase.js";
import { CustomerData } from "../modules/customer.js";

export const router = Router();


router.get("/customers/:id", async (req, res) => {
  try {
    const storeId = req.params.id;
    const search = String(req.query.q || "").toLowerCase().trim();

    const storeRef = db.collection("stores").doc(storeId);

    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "ไม่พบร้านค้า",
      });
    }

    const ordersSnap = await db
      .collection("orders")
      .where("store_id", "==", storeRef)
      .get();

    const customerMap = new Map();

    for (const order of ordersSnap.docs) {
      const customerRef = order.data().customer_id;

      if (!customerRef) continue;

      customerMap.set(customerRef.path, customerRef);
    }

    const customers = await Promise.all(
      Array.from(customerMap.values()).map(async (ref) => {
        const snap = await ref.get();

        if (!snap.exists) return null;

        const data = snap.data() as CustomerData;

        return {
          customer_id: snap.id,
          fullname: data.fullname || "",
          email: data.email || "",
          phone: data.phone || "",
          profile_image: data.profile_image || "",
        };
      })
    );

    const result = customers
      .filter((c) => c !== null)
      .filter((c) =>
        !search ||
        c.fullname.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.phone.toLowerCase().includes(search)
      );

    return res.json({
      ok: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});
