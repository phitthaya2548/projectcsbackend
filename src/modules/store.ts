
export type StoreStatus = "เปิดร้าน" |  "ปิดชั่วคราว";
export type StoreData = {
  store_id: string;
  username: string;
  password: string;

  store_name: string;
  phone: string;
  email: string;

  facebook: string;
  line_id: string;

  address: string;

  opening_hours: string;
  closed_hours: string;

  status: StoreStatus;

  service_radius: number; // 0 = ยังไม่ตั้ง
  latitude: number;       // 0 = ยังไม่ตั้ง
  longitude: number;

  profile_image: string;

  wallet_balance: number;

};
