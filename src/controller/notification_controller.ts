import { Router } from "express";
import { NotificationService } from "../services/notification";

export const router = Router();

router.post("/register", async (req, res) => {
  try {
    const {
      user_id,
      user_role,
      token,
    } = req.body;

    if (!user_id || !user_role || !token) {
      return res.status(400).json({
        ok: false,
        message: "ข้อมูล FCM ไม่ครบ",
      });
    }

    await NotificationService.registerToken(
      user_id,
      user_role,
      token,
    );

    return res.json({
      ok: true,
      message: "บันทึก FCM Token สำเร็จ",
    });

  } catch (error) {
    console.error("FCM Register Error:", error);

    return res.status(500).json({
      ok: false,
      message: "server error",
    });
  }
});
router.get("/history", async (req, res) => {
  try {
    const { user_id, user_role, limit } = req.query;

    if (!user_id || !user_role) {
      return res.status(400).json({
        ok: false,
        message: "ข้อมูลไม่ครบ",
      });
    }

    const history = await NotificationService.getHistory(
      user_id as string,
      user_role as string,
      limit ? Number(limit) : 20
    );

    return res.json({ ok: true, data: history });
  } catch (error) {
    console.error("Get History Error:", error);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});

router.post("/mark-read", async (req, res) => {
  try {
    const { notification_id } = req.body;

    if (!notification_id) {
      return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
    }

    await NotificationService.markAsRead(notification_id);

    return res.json({ ok: true, message: "อ่านแล้ว" });
  } catch (error) {
    console.error("Mark Read Error:", error);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});
router.get("/unread_count", async (req, res) => {
  try {
    const { user_id, user_role } = req.query;

    if (!user_id || !user_role) {
      return res.status(400).json({ ok: false, message: "ข้อมูลไม่ครบ" });
    }

    const count = await NotificationService.countUnread(
      user_id as string,
      user_role as string
    );

    return res.json({ ok: true, data: { count } });
  } catch (error) {
    console.error("Unread Count Error:", error);
    return res.status(500).json({ ok: false, message: "server error" });
  }
});