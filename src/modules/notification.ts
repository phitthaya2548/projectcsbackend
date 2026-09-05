export interface DeviceToken {
  user_id: string;
  user_role: string;
  fcm_token: string;
  active: boolean;
}

export interface NotificationRecord {
  user_id: string;
  user_role: string;
  title: string;
  body: string;
  order_id: string;
  is_read: boolean;
  created_at: Date;
}