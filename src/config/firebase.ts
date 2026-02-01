import "dotenv/config";
import fs from "node:fs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

let serviceAccount: any;

// ✅ ถ้า env เป็น JSON (Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim().startsWith("{")) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// ✅ ถ้า env เป็น path (local)
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(
    fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, "utf8")
  );
} else {
  throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export const db = getFirestore();
export const auth = getAuth();
export const bucket = getStorage().bucket();
export { FieldValue };
