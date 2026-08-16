import { db, messaging } from "../config/firebase";
import { DeviceToken, NotificationRecord } from "../modules/notification";

export class NotificationService {
  static async registerToken(
    user_id: string,
    user_role: string,
    token: string
  ): Promise<void> {
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
      } satisfies Partial<DeviceToken>);
    } else {
      const newToken: DeviceToken = {
        user_id,
        user_role,
        fcm_token: token,
        active: true,
      };
      await db.collection("device_tokens").add(newToken);
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
  ): Promise<void> {

    const record: NotificationRecord = {
      user_id,
      user_role,
      title,
      body,
      data,
      is_read: false,
      created_at: new Date(),
    };
    const notifRef = await db.collection("notifications").add(record);


    const snap = await db
      .collection("device_tokens")
      .where("user_id", "==", user_id)
      .where("user_role", "==", user_role)
      .where("active", "==", true)
      .get();

    if (snap.empty) {
      console.log("ไม่มี device token (แต่บันทึกประวัติแล้ว)");
      return;
    }

    for (const doc of snap.docs) {
      const { fcm_token: token } = doc.data() as DeviceToken;

      try {
        await messaging.send({
          token,
          notification: { title, body },
          data: { ...data, notification_id: notifRef.id },
          android: {
            priority: "high",
            notification: {
              sound: "notification_sound",
              tag: `${user_role}_${user_id}`,
            },
          },
        });
      } catch (error: any) {
        console.error("FCM Error:", error);
        if (
          error.code === "messaging/registration-token-not-registered" ||
          error.errorInfo?.code === "messaging/registration-token-not-registered"
        ) {
          await doc.ref.update({ active: false } satisfies Partial<DeviceToken>);
        }
      }
    }
  }

  static async getHistory(
    user_id: string,
    user_role: string,
    limit: number = 20
  ): Promise<({ id: string } & NotificationRecord)[]> {
    const snap = await db
      .collection("notifications")
      .where("user_id", "==", user_id)
      .where("user_role", "==", user_role)
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as NotificationRecord),
    }));
  }

  static async markAsRead(notification_id: string): Promise<void> {
    await db
      .collection("notifications")
      .doc(notification_id)
      .update({ is_read: true } satisfies Partial<NotificationRecord>);
  }
  static async countUnread(user_id: string, user_role: string): Promise<number> {
  const snap = await db
    .collection("notifications")
    .where("user_id", "==", user_id)
    .where("user_role", "==", user_role)
    .where("is_read", "==", false)
    .count()
    .get();

  return snap.data().count;
}
}