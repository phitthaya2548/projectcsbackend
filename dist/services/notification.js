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
            const newToken = {
                user_id,
                user_role,
                fcm_token: token,
                active: true,
            };
            await firebase_1.db.collection("device_tokens").add(newToken);
        }
        const others = await firebase_1.db
            .collection("device_tokens")
            .where("user_id", "==", user_id)
            .where("user_role", "==", user_role)
            .where("fcm_token", "!=", token)
            .get();
        const batch = firebase_1.db.batch();
        others.docs.forEach((doc) => {
            batch.update(doc.ref, {
                active: false,
            });
        });
        await batch.commit();
    }
    static async sendToUser(user_id, user_role, title, body, order_id) {
        const record = {
            user_id,
            user_role,
            title,
            body,
            order_id,
            is_read: false,
            created_at: new Date(),
        };
        await firebase_1.db.collection("notifications").add(record);
        const snap = await firebase_1.db
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
            const { fcm_token: token } = doc.data();
            try {
                await firebase_1.messaging.send({
                    token,
                    notification: {
                        title,
                        body,
                    },
                    data: {
                        order_id,
                        role: user_role,
                    },
                    android: {
                        priority: "high",
                        notification: {
                            sound: "notification_sound",
                            tag: `${user_role}_${user_id}`,
                        },
                    },
                });
            }
            catch (error) {
                console.error("FCM Error:", error);
                if (error.code ===
                    "messaging/registration-token-not-registered" ||
                    error.errorInfo?.code ===
                        "messaging/registration-token-not-registered") {
                    await doc.ref.update({
                        active: false,
                    });
                }
            }
        }
    }
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
            .update({
            is_read: true,
        });
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
    static async markAllAsRead(user_id, user_role) {
        const data = await firebase_1.db
            .collection("notifications")
            .where("user_id", "==", user_id)
            .where("user_role", "==", user_role)
            .where("is_read", "==", false)
            .get();
        if (data.empty) {
            return;
        }
        const batch = firebase_1.db.batch();
        data.docs.forEach((doc) => {
            batch.update(doc.ref, {
                is_read: true,
            });
        });
        await batch.commit();
    }
}
exports.NotificationService = NotificationService;
