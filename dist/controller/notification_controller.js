"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const notification_1 = require("../services/notification");
exports.router = (0, express_1.Router)();
exports.router.post("/register", async (req, res) => {
    try {
        const { user_id, user_role, token, } = req.body;
        if (!user_id || !user_role || !token) {
            return res.status(400).json({
                ok: false,
                message: "ข้อมูล FCM ไม่ครบ",
            });
        }
        await notification_1.NotificationService.registerToken(user_id, user_role, token);
        return res.json({
            ok: true,
            message: "บันทึก FCM Token สำเร็จ",
        });
    }
    catch (error) {
        console.error("FCM Register Error:", error);
        return res.status(500).json({
            ok: false,
            message: "server error",
        });
    }
});
