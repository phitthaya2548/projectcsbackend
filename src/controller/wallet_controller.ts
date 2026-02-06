import { Router } from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";

export const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/verify", upload.single("file"), async (req, res) => {
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
    const postToSlipok = async (fieldName: "files" | "file") => {
      const form = new FormData();
      form.append(fieldName, file.buffer, {
        filename: file.originalname || "slip.jpg",
        contentType: file.mimetype || "image/jpeg",
      });

      return axios.post(url, form, {
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
  } catch (e: any) {
    const status = e?.response?.status || 500;
    const data = e?.response?.data || { message: e?.message || String(e) };
    console.error("SERVER error:", status, data);
    return res.status(status).json({ ok: false, message: "server error", slipok: data });
  }
});
