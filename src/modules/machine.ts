import { DocumentReference} 
from "firebase-admin/firestore";

export const MACHINE_STATUS = [
  "ใช้งาน",
  "กำลังทำงาน",
  "ปิดปรับปรุง",
] as const;

export type MachineStatus =
  typeof MACHINE_STATUS[number];

export type MachineType =
  "washer" | "dryer";

export interface Machine {
  id?: string;

  machine_id: string;
  name: string;

  type: MachineType;

  capacity: number;
  price: number;
  work_minutes: number;

  status: MachineStatus;

  // 🔥 เปลี่ยนเป็น reference
  store_id: DocumentReference;

}
