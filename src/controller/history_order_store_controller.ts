
import { Router } from "express";
import { db } from "../config/firebase.js";
import { CustomerData } from "../modules/customer.js";

export const router = Router();

router.get("/customers/:id", async (req, res) => {
  try {
    const storeId = req.params.id;
    const search = String(req.query.q || "")
      .trim()
      .toLowerCase();

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

    const customerRefs = new Set<FirebaseFirestore.DocumentReference>();

    ordersSnap.forEach((order) => {
      const customerRef =
        order.data().customer_id as
          | FirebaseFirestore.DocumentReference
          | undefined;

      if (customerRef) {
        customerRefs.add(customerRef);
      }
    });

    const customerSnaps = await Promise.all(
      Array.from(customerRefs).map((customerRef) => customerRef.get(),),
    );

    let customers = customerSnaps
      .filter((customer) => customer.exists)
      .map((customer) => {
        const data = customer.data() as CustomerData;

        return {
          customer_id: customer.id,
          fullname: data.fullname || "",
          email: data.email || "",
          phone: data.phone || "",
          profile_image: data.profile_image || "",
        };
      });

    if (search) {
      customers = customers.filter((customer) => {
        return (
          customer.fullname
            .toLowerCase()
            .includes(search) ||
          customer.email
            .toLowerCase()
            .includes(search) ||
          customer.phone
            .toLowerCase()
            .includes(search)
        );
      });
    }

    return res.json({
      ok: true,
      count: customers.length,
      data: customers,
    });
  } catch (error: any) {
    console.error("GET STORE CUSTOMERS ERROR:", error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Server error",
    });
  }
});
