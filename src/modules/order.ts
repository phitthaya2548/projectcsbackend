import { Timestamp } from "firebase-admin/firestore";
export type OrderStatus =
  | "waiting_pickup"      // รอรับผัา
  | "picked_up"           // กำลังไปรับผ้า
  | "waiting_payment"     // รอชำระเงิน
  | "pickup_completed"    // กำลังเดินทางที่ร้าน
  | "waiting_wash"        // รอซัก
  | "washing"             // กำลังซัก
  | "drying"              // กำลังอบผ้า
  | "waiting_delivery"    // รอส่งผ้า
  | "delivering"          // กำลังจัดส่ง
  | "completed"           // ดำเนินการเสร็จสิ้น
  | "cancelled";          // ยกเลิกคำสั่งซื้อ
export type ServiceType =
  | "wash"
  | "dry"
  | "wash_dry";

export type DETERGENT_OPTIONS =
  | "no_detergent"
  | "detergent";

export interface Order {
  order_id: string;

  customer_id: FirebaseFirestore.DocumentReference | null;
  address_id: FirebaseFirestore.DocumentReference | null;
  store_id: FirebaseFirestore.DocumentReference | null;
  rider_pickup_id: FirebaseFirestore.DocumentReference | null;
  rider_delivery_id: FirebaseFirestore.DocumentReference | null;
  machine_washer_id: FirebaseFirestore.DocumentReference | null;
  machine_dryer_id: FirebaseFirestore.DocumentReference | null;
  staff_id: FirebaseFirestore.DocumentReference | null;

  service_type: ServiceType;
  wash_dry_weight: number | null;

  service_price: number;
  delivery_price: number;

  detergent_option: DETERGENT_OPTIONS | null;

  before_wash_image: string | null;
  after_wash_image: string | null;

  note: string | null;

  status: OrderStatus;

  order_datetime: Timestamp;
}