import "dotenv/config";
import dns from "dns";
import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

// ต้องเรียกทันทีตอน module load ก่อนสิ่งอื่นทำงาน
dns.setDefaultResultOrder("ipv4first");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

console.log("SMTP_HOST =", SMTP_HOST);
console.log("SMTP_PORT =", SMTP_PORT);
console.log("SMTP_USER =", SMTP_USER);
console.log("MAIL_FROM =", process.env.MAIL_FROM);

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  throw new Error(
    "Missing SMTP env vars: กรุณาตรวจสอบ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS ใน .env"
  );
}

export const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  family: 4,


 lookup: (
  hostname: string,
  options: dns.LookupOneOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
) => {
  dns.lookup(hostname, { family: 4 }, callback);
},

  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
} as SMTPTransport.Options);

mailer.verify((err) => {
  if (err) {
    console.error("SMTP connection failed:", err);
  } else {
    console.log("SMTP connection OK, ready to send mail");
  }
});