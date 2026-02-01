"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FieldValue = exports.bucket = exports.auth = exports.db = void 0;
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS in .env");
}
const absCredPath = node_path_1.default.isAbsolute(credPath)
    ? credPath
    : node_path_1.default.join(process.cwd(), credPath);
if (!node_fs_1.default.existsSync(absCredPath)) {
    throw new Error(`Credential file not found: ${absCredPath}`);
}
const serviceAccount = JSON.parse(node_fs_1.default.readFileSync(absCredPath, "utf8"));
if (!serviceAccount.project_id) {
    throw new Error("Service account JSON missing project_id");
}
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)({
        credential: (0, app_1.cert)(serviceAccount),
        projectId: serviceAccount.project_id,
        // ✅ เพิ่ม bucket เพื่อใช้งาน Storage
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
}
exports.db = (0, firestore_1.getFirestore)();
exports.auth = (0, auth_1.getAuth)();
exports.bucket = (0, storage_1.getStorage)().bucket(); // ✅ เพิ่ม
