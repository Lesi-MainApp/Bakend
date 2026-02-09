// src/api/email.js
import nodemailer from "nodemailer";

export const sendEmail = async ({ to, subject, html, text }) => {
  const {
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_USER,
    EMAIL_PASS,
    EMAIL_FROM,
  } = process.env;

  // ✅ Dev fallback (no crash)
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    console.log("==========================================");
    console.log("[DEV] EMAIL SIMULATED SEND (env missing)");
    console.log("To     :", to);
    console.log("Subject:", subject);
    console.log("Text   :", text);
    console.log("==========================================");
    return { ok: true, dev: true };
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT || 587),
    secure: false,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  const from = EMAIL_FROM || EMAIL_USER;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { ok: true, messageId: info.messageId };
};
