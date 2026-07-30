import { Timestamp, DocumentReference } from "firebase-admin/firestore";

export interface TopupHistory {
  topup_id?: string;

  customer_id: DocumentReference;

  amount: number;
  trans_ref: string;

  topup_datetime: Timestamp;
}
