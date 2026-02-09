// src/api/whatsapp.js
import axios from "axios";

/** Normalize Sri Lankan numbers to 94XXXXXXXXX (digits only). */
function normalizeSLMobile(input) {
  if (!input) return "";

  // keep only digits
  let num = String(input).replace(/\D+/g, "");

  // 0XXXXXXXXX -> 94XXXXXXXXX
  if (num.startsWith("0")) num = "94" + num.slice(1);

  // 7XXXXXXXX -> 947XXXXXXXX (fallback)
  if (!num.startsWith("94")) num = "94" + num;

  return num;
}

/**
 * ChatBizz WhatsApp text sender
 *
 * .env:
 *  WAPP_INSTANCE=xxxx
 *  WAPP_TOKEN=xxxx
 *
 * API:
 *  POST https://app.chatbizz.cc/api/send
 *  {
 *    number: "94XXXXXXXXX",
 *    type: "text",
 *    message: "Hello",
 *    instance_id: "...",
 *    access_token: "..."
 *  }
 */
export const sendWhatsApp = async (to, message) => {
  if (!to) throw new Error("Recipient number required");
  if (!message) throw new Error("Message body required");

  const INSTANCE = process.env.WAPP_INSTANCE;
  const TOKEN = process.env.WAPP_TOKEN;

  const number = normalizeSLMobile(to);

  // ✅ If env missing, just log (so signup doesn't crash in dev)
  if (!INSTANCE || !TOKEN) {
    console.log("==========================================");
    console.log("[DEV] ChatBizz SIMULATED SEND (env missing)");
    console.log("Number  :", number);
    console.log("Message :", message);
    console.log("==========================================");
    return { ok: true, dev: true, number, message };
  }

  const url = "https://app.chatbizz.cc/api/send";

  const payload = {
    number,              // ✅ REQUIRED (digits only)
    type: "text",        // ✅ REQUIRED
    message,             // ✅ REQUIRED
    instance_id: INSTANCE,
    access_token: TOKEN,
  };

  try {
    const resp = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    // optional logs
    console.log("==========================================");
    console.log("[ChatBizz] Payload:", payload);
    console.log("[ChatBizz] Response:", resp.data);
    console.log("==========================================");

    return { ok: true, response: resp.data };
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    console.error("==========================================");
    console.error("[ChatBizz] SEND ERROR:", err.message);
    if (status) console.error("[ChatBizz] Status:", status);
    if (data) console.error("[ChatBizz] Response:", data);
    console.error("==========================================");

    throw err;
  }
};
