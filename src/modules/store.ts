import type { FieldValue } from "firebase-admin/firestore";

export type StoreStatus = "OPEN" |  "TEMP_CLOSED";
export type StoreData = {
  store_id: string;
  username: string;
  password: string;
  shop_name: string | null;
  phone: string | null;
  email: string | null;
  facebook_id: string | null;
  line_id: string | null;
  address: string | null;
  opening_hours: string | null;
  closed_hours: string | null;
  status: StoreStatus;
  is_profile_completed: boolean;
  service_radius: number | null;
  latitude: number | null;
  longitude: number | null;
  profile_image: string | null;
  wallet_balance: number;
  created_at: FieldValue;
  updated_at: FieldValue;
};