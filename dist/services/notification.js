"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const firebase_1 = require("../config/firebase");
class NotificationService {
    static async registerToken(user_id, user_role, token) {
        const check = await firebase_1.db
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
        }
        else {
            await firebase_1.db.collection("device_tokens").add({
                user_id,
                user_role,
                fcm_token: token,
                active: true,
            });
        }
        const others = await firebase_1.db
            .collection("device_tokens")
            .where("user_id", "==", user_id)
            .where("user_role", "==", user_role)
            .where("fcm_token", "!=", token)
            .get();
        const batch = firebase_1.db.batch();
        others.docs.forEach((doc) => {
            batch.update(doc.ref, { active: false });
        });
        await batch.commit();
    }
    static async sendToUser(user_id, user_role, title, body, data = {}) {
        console.log("ส่ง Notification หา:", user_id, user_role);
        const snap = await firebase_1.db
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
                await firebase_1.messaging.send({
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
            }
            catch (error) {
                console.error("FCM Error:", error);
                if (error.code === "messaging/registration-token-not-registered" ||
                    error.errorInfo?.code === "messaging/registration-token-not-registered") {
                    console.log("Token ตายแล้ว → ปิดการใช้งาน:", token);
                    await doc.ref.update({ active: false });
                }
            }
        }
    }
}
exports.NotificationService = NotificationService;
