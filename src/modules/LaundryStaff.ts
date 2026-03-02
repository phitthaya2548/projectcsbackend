export type LaundryStaff = {
  staff_id: string;
  store_id: FirebaseFirestore.DocumentReference;

  username: string;
  password: string;
  email: string;
  fullname: string;
  phone: string;

  profile_image: string | null;

  status: "ใช้งาน" | "ไม่ใช้งาน";

};
