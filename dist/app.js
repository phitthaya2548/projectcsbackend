"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const register_customer_controller_1 = require("./controller/register_customer_controller");
const register_store_controller_1 = require("./controller/register_store_controller");
const auth_controller_1 = require("./controller/auth_controller");
const customer_controller_1 = require("./controller/customer_controller");
const wallet_controller_1 = require("./controller/wallet_controller");
const rider_controller_1 = require("./controller/rider_controller");
const store_controller_1 = require("./controller/store_controller");
const laundrystaff_contorller_1 = require("./controller/laundrystaff_contorller");
const orders_controller_1 = require("./controller/orders_controller");
const orders_rider_controller_1 = require("./controller/orders_rider_controller");
const orders_staff_controller_1 = require("./controller/orders_staff_controller");
exports.app = (0, express_1.default)();
exports.app.use(express_1.default.json({ limit: "1mb" }));
exports.app.use(express_1.default.urlencoded({ extended: true }));
exports.app.use("", auth_controller_1.router);
exports.app.use("/register/customer", register_customer_controller_1.router);
exports.app.use("/register/store", register_store_controller_1.router);
exports.app.use("/customer", customer_controller_1.router);
exports.app.use("/store", store_controller_1.router);
exports.app.use("/rider", rider_controller_1.router);
exports.app.use("/laundry_staff", laundrystaff_contorller_1.router);
exports.app.use("/wallet", wallet_controller_1.router);
exports.app.use("/order/rider", orders_rider_controller_1.router);
exports.app.use("/order/staff", orders_staff_controller_1.router);
exports.app.use("/order", orders_controller_1.router);
exports.app.use((_req, res) => {
    res.status(404).json({
        ok: false,
        message: "Not found"
    });
});
exports.app.use((req, res, next) => {
    console.log(req.method, req.url);
    next();
});
exports.app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({
        ok: false,
        message: "Internal Server Error"
    });
});
