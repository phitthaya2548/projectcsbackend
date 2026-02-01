"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldValue = exports.bucket = exports.auth = exports.db = void 0;
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
let serviceAccount;
// ✅ ถ้า env เป็น JSON (Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT?.trim().startsWith("{")) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // ✅ ถ้า env เป็น path (local)
}
else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(node_fs_1.default.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, "utf8"));
}
else {
    throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
}
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)({
        credential: (0, app_1.cert)(serviceAccount),
        projectId: serviceAccount.project_id,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
}
exports.db = (0, firestore_1.getFirestore)();
exports.auth = (0, auth_1.getAuth)();
exports.bucket = (0, storage_1.getStorage)().bucket();
