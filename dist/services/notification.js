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
<<<<<<< HEAD
            const newToken = {
=======
            await firebase_1.db.collection("device_tokens").add({
>>>>>>> origin/main
                user_id,
                user_role,
                fcm_token: token,
                active: true,
<<<<<<< HEAD
            };
            await firebase_1.db.collection("device_tokens").add(newToken);
=======
            });
>>>>>>> origin/main
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
<<<<<<< HEAD
        const record = {
            user_id,
            user_role,
            title,
            body,
            data,
            is_read: false,
            created_at: new Date(),
        };
        const notifRef = await firebase_1.db.collection("notifications").add(record);
=======
        console.log("ส่ง Notification หา:", user_id, user_role);
>>>>>>> origin/main
        const snap = await firebase_1.db
            .collection("device_tokens")
            .where("user_id", "==", user_id)
            .where("user_role", "==", user_role)
            .where("active", "==", true)
            .get();
<<<<<<< HEAD
        if (snap.empty) {
            console.log("ไม่มี device token (แต่บันทึกประวัติแล้ว)");
            return;
        }
        for (const doc of snap.docs) {
            const { fcm_token: token } = doc.data();
            try {
                await firebase_1.messaging.send({
                    token,
                    notification: { title, body },
                    data: { ...data, notification_id: notifRef.id },
=======
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
>>>>>>> origin/main
                    android: {
                        priority: "high",
                        notification: {
                            sound: "notification_sound",
                            tag: `${user_role}_${user_id}`,
                        },
                    },
                });
<<<<<<< HEAD
=======
                console.log("ส่ง FCM สำเร็จ");
>>>>>>> origin/main
            }
            catch (error) {
                console.error("FCM Error:", error);
                if (error.code === "messaging/registration-token-not-registered" ||
                    error.errorInfo?.code === "messaging/registration-token-not-registered") {
<<<<<<< HEAD
=======
                    console.log("Token ตายแล้ว → ปิดการใช้งาน:", token);
>>>>>>> origin/main
                    await doc.ref.update({ active: false });
                }
            }
        }
    }
<<<<<<< HEAD
    static async getHistory(user_id, user_role, limit = 20) {
        const snap = await firebase_1.db
            .collection("notifications")
            .where("user_id", "==", user_id)
            .where("user_role", "==", user_role)
            .orderBy("created_at", "desc")
            .limit(limit)
            .get();
        return snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    static async markAsRead(notification_id) {
        await firebase_1.db
            .collection("notifications")
            .doc(notification_id)
            .update({ is_read: true });
    }
    static async countUnread(user_id, user_role) {
        const snap = await firebase_1.db
            .collection("notifications")
            .where("user_id", "==", user_id)
            .where("user_role", "==", user_role)
            .where("is_read", "==", false)
            .count()
            .get();
        return snap.data().count;
    }
=======
>>>>>>> origin/main
}
exports.NotificationService = NotificationService;
