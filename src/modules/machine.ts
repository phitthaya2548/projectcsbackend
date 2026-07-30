import { DocumentReference } from "firebase-admin/firestore";

export const MACHINE_STATUS = [
  "available",
  "busy",
  "maintenance",
] as const;

export type MachineStatus =
  typeof MACHINE_STATUS[number];

export type MachineType =
  "washer" | "dryer";

export interface Machine {
  machine_id: string;
  name: string;

  type: MachineType;

  capacity: number;
  price: number;
  work_minutes: number;

  status: MachineStatus;

  store_id: DocumentReference;
}