"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const register_customer_controller_1 = require("./controller/register_customer_controller");
const store_controller_1 = require("./controller/store_controller");
const auth_controller_1 = require("./controller/auth_controller");
const customer_controller_1 = require("./controller/customer_controller");
exports.app = (0, express_1.default)();
exports.app.use(express_1.default.json());
exports.app.use(express_1.default.urlencoded({ extended: true }));
exports.app.use("", auth_controller_1.routes);
exports.app.use("/register/customer", register_customer_controller_1.routes);
exports.app.use("/register/store", store_controller_1.router);
exports.app.use("/customer", customer_controller_1.routes);
exports.app.use((_req, res) => {
    res.status(404).json({ ok: false, message: "Not found" });
});
