export type RiderStatus = "ใช้งาน" | "ไม่ใช้งาน";
export type Rider = {
  rider_id: string;
  store_id: FirebaseFirestore.DocumentReference;
  email: string;
  username: string;
  password: string;
  full_name: string;
  phone: string;
  vehicle_type: string;
  license_plate: string;
  profile_image: string | null;
  status: RiderStatus;
  latitude: number | null;
  longitude: number | null;
};
