export type CustomerAddress = {
  address_id?: string;
  customer_id: FirebaseFirestore.DocumentReference;
  address_name: string;
  address_text: string;
  latitude: number;
  longitude: number;
  status: boolean;
};
