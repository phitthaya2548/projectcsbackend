import { Timestamp } from "firebase-admin/firestore";

export interface Review {
  review_id: string;
  store_id: FirebaseFirestore.DocumentReference;      
  order_id: FirebaseFirestore.DocumentReference;    
  customer_id: FirebaseFirestore.DocumentReference;  
  rating: number;           
  comment: string | null;
  reviewed_at: Timestamp;  
}