import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage"; // ✅ เพิ่ม

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS in .env");
}

const absCredPath = path.isAbsolute(credPath)
  ? credPath
  : path.join(process.cwd(), credPath);

if (!fs.existsSync(absCredPath)) {
  throw new Error(`Credential file not found: ${absCredPath}`);
}

const serviceAccount = JSON.parse(fs.readFileSync(absCredPath, "utf8"));

if (!serviceAccount.project_id) {
  throw new Error("Service account JSON missing project_id");
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount as any),
    projectId: serviceAccount.project_id,
    // ✅ เพิ่ม bucket เพื่อใช้งาน Storage
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET
      ,
  });
}

export const db = getFirestore();
export const auth = getAuth();
export const bucket = getStorage().bucket(); // ✅ เพิ่ม
export { FieldValue };
