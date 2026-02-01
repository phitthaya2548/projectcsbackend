import express from "express";
import { routes as register_customer } from "./controller/register_customer_controller";
import { router as register_store } from "./controller/store_controller";
import { routes as login } from "./controller/auth_controller";
import { routes as customer } from "./controller/customer_controller";

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("", login);
app.use("/register/customer", register_customer);
app.use("/register/store", register_store);
app.use("/customer",customer);

app.use((_req, res) => {
  res.status(404).json({ ok: false, message: "Not found" });
});
