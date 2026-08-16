export type RiderStatus = "ONLINE" | "TEMP_CLOSED" |"pending";
export type Rider = {
  rider_id: string;
  store_id: FirebaseFirestore.DocumentReference | null;
  email: string;
  username: string;
  password: string;
  fullname: string | null;
  phone: string;
  vehicle_type: string;
  license_plate: string;
  profile_image: string | null;
  status: RiderStatus;
  latitude: number | null;
  longitude: number | null;
};
