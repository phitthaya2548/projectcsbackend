export type StaffStatus = "ONLINE" | "TEMP_CLOSEDTEMP_CLOSED";
export type LaundryStaff = {
  staff_id: string;
  store_id: FirebaseFirestore.DocumentReference | null;

  username: string;
  password: string;
  email: string;
  fullname: string;
  phone: string;

  profile_image: string | null;

  status: StaffStatus;

};
