import { db, messaging } from "../config/firebase";

export class NotificationService {
  static async registerToken(
  user_id: string,
  user_role: string,
  token: string
) {
  const check = await db
    .collection("device_tokens")
    .where("fcm_token", "==", token)
    .limit(1)
    .get();

  if (!check.empty) {
    await check.docs[0].ref.update({
      user_id,
      user_role,
      active: true,
    });
  } else {
    await db.collection("device_tokens").add({
      user_id,
      user_role,
      fcm_token: token,
      active: true,
    });
  }

  const others = await db
    .collection("device_tokens")
    .where("user_id", "==", user_id)
    .where("user_role", "==", user_role)
    .where("fcm_token", "!=", token)
    .get();

  const batch = db.batch();
  others.docs.forEach((doc) => {
    batch.update(doc.ref, { active: false });
  });
  await batch.commit();
}

  static async sendToUser(
    user_id: string,
    user_role: string,
    title: string,
    body: string,
    data: Record<string, string> = {}
  ) {
    console.log("ส่ง Notification หา:", user_id, user_role);

    const snap = await db
      .collection("device_tokens")
      .where("user_id", "==", user_id)
      .where("user_role", "==", user_role)
      .where("active", "==", true)
      .get();

    console.log("เจอ Token:", snap.size);

    if (snap.empty) {
      console.log("ไม่มี device token");
      return;
    }

    for (const doc of snap.docs) {
      const token = doc.data().fcm_token;

      console.log("ส่งไป Token:", token);

      try {
        await messaging.send({
          token,
          notification: {
            title,
            body,
          },

          data,

          android: {
            priority: "high",

            notification: {
              sound: "notification_sound",
              tag: `${user_role}_${user_id}`,
            },
          },
        });

        console.log("ส่ง FCM สำเร็จ");

      } catch (error: any) {
        console.error("FCM Error:", error);

        if (
          error.code === "messaging/registration-token-not-registered" ||
          error.errorInfo?.code === "messaging/registration-token-not-registered"
        ) {
          console.log("Token ตายแล้ว → ปิดการใช้งาน:", token);
          await doc.ref.update({ active: false });
        }
      }
    }
  }
}