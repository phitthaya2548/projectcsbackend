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