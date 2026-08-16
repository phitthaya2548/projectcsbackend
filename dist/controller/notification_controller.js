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
exports.router.get("/history", async (req, res) => {
    try {
        const { user_id, user_role, limit } = req.query;
        if (!user_id || !user_role) {
            return res.status(400).json({
                ok: false,
                message: "ข้อมูลไม่ครบ",
            });
        }
        const history = await notification_1.NotificationService.getHistory(user_id, user_role, limit ? Number(limit) : 20);
        return res.json({ ok: true, data: history });
    }
    catch (error) {
        console.error("Get History Error:", error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.post("/mark-read", async (req, res) => {
    try {
        const { notification_id } = req.body;
        if (!notification_id) {
            return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
        }
        await notification_1.NotificationService.markAsRead(notification_id);
        return res.json({ ok: true, message: "อ่านแล้ว" });
    }
    catch (error) {
        console.error("Mark Read Error:", error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
exports.router.get("/unread_count", async (req, res) => {
    try {
        const { user_id, user_role } = req.query;
        if (!user_id || !user_role) {
            return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
        }
        const count = await notification_1.NotificationService.countUnread(user_id, user_role);
        return res.json({ ok: true, data: { count } });
    }
    catch (error) {
        console.error("Unread Count Error:", error);
        return res.status(500).json({ ok: false, message: "server error" });
    }
});
