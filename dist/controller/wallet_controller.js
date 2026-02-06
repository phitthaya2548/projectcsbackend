"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
exports.router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
exports.router.post("/verify", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ ok: false, message: "แนบไฟล์สลิป key=file" });
        }
        const slipokId = process.env.SLIPOK_ID;
        const xauth = process.env.SLIPOK_XAUTH;
        console.log("SLIPOK_ID =", slipokId);
        console.log("SLIPOK_XAUTH =", xauth ? "SET" : "MISSING");
        if (!slipokId || !xauth) {
            return res.status(500).json({ ok: false, message: "missing SLIPOK env" });
        }
        const url = `https://api.slipok.com/api/line/apikey/${slipokId}`;
        // ===== helper ยิงไป SlipOK =====
        const postToSlipok = async (fieldName) => {
            const form = new form_data_1.default();
            form.append(fieldName, file.buffer, {
                filename: file.originalname || "slip.jpg",
                contentType: file.mimetype || "image/jpeg",
            });
            return axios_1.default.post(url, form, {
                headers: {
                    "x-authorization": xauth,
                    ...form.getHeaders(),
                },
                timeout: 20000,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                validateStatus: () => true,
            });
        };
        let r = await postToSlipok("files");
        if (r.status === 422) {
            console.log("SlipOK 422 with field=files, retry with field=file");
            r = await postToSlipok("file");
        }
        if (r.status < 200 || r.status >= 300) {
            console.error("SlipOK error status:", r.status);
            console.error("SlipOK error body:", r.data);
            return res.status(r.status).json({
                ok: false,
                message: "SlipOK verify failed",
                slipok: r.data,
            });
        }
        return res.json({ ok: true, slipok: r.data });
    }
    catch (e) {
        const status = e?.response?.status || 500;
        const data = e?.response?.data || { message: e?.message || String(e) };
        console.error("SERVER error:", status, data);
        return res.status(status).json({ ok: false, message: "server error", slipok: data });
    }
});
