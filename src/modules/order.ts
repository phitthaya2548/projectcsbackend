import { Timestamp } from "firebase-admin/firestore";

export type OrderStatus =
  | "waiting_pickup"
  | "picked_up"
  | "waiting_payment"
  | "pickup_completed"
  | "waiting_wash"
  | "washing"
  | "drying"
  | "waiting_delivery"
  | "delivering"
  | "completed"
  | "cancelled";
export type ServiceType =
  | "wash"
  | "dry"
  | "wash_dry"

  ;

export type DETERGENT_OPTIONS = "no_detergent" | "detergent";

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
  wash_dry_weigh: number;
  total_amount: number;

  detergent_option: DETERGENT_OPTIONS | null;

  before_wash_image: string | null;
  after_wash_image: string | null;

  note: string | null;

  status: OrderStatus;

  order_datetime: Timestamp,
}