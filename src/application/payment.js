// src/application/payment.js
import crypto from "crypto";
import mongoose from "mongoose";
import Payment from "../infastructure/schemas/payment.js";
import Paper from "../infastructure/schemas/paper.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const toStr = (v) => String(v ?? "").trim();
const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const md5 = (s) => crypto.createHash("md5").update(String(s)).digest("hex");

const formatAmount2 = (amount) => {
  const n = safeNum(amount, 0);
  return n.toFixed(2);
};

// ✅ PayHere hash rule:
// md5(merchant_id + order_id + amount + currency + md5(merchant_secret).toUpperCase()).toUpperCase()
const makePayhereHash = ({ merchantId, orderId, amount, currency, merchantSecret }) => {
  const secretHash = md5(merchantSecret).toUpperCase();
  const raw = `${merchantId}${orderId}${formatAmount2(amount)}${currency}${secretHash}`;
  return md5(raw).toUpperCase();
};

const getPublicBaseUrl = () => {
  const base = toStr(process.env.PUBLIC_BASE_URL);
  return base.replace(/\/$/, "");
};

const getCurrency = () => toStr(process.env.PAYHERE_CURRENCY || "LKR") || "LKR";
const getMode = () =>
  toStr(process.env.PAYHERE_MODE || "sandbox").toLowerCase() === "live" ? "live" : "sandbox";

const getPayhereGatewayUrl = () => {
  const mode = getMode();
  return mode === "live"
    ? "https://www.payhere.lk/pay/checkout"
    : "https://sandbox.payhere.lk/pay/checkout";
};

/* =========================================================
   ✅ GET /api/payment/my/:paperId
========================================================= */
export const getMyPaymentStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { paperId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const payType = toStr(paper.payment).toLowerCase();
    if (payType !== "paid") {
      return res.status(200).json({
        paperId: String(paperId),
        payment: payType,
        required: false,
        unlocked: true,
        paymentId: null,
        orderId: null,
      });
    }

    const paid = await Payment.findOne({
      userId,
      paperId,
      status: "success",
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      paperId: String(paperId),
      payment: "paid",
      required: true,
      unlocked: !!paid,
      paymentId: paid?.payherePaymentId ? String(paid.payherePaymentId) : null,
      orderId: paid?.orderId ? String(paid.orderId) : null,
    });
  } catch (err) {
    console.error("getMyPaymentStatus error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ POST /api/payment/checkout
   body: { paperId }
   returns { gatewayUrl, fields, orderId }
========================================================= */
export const createPayhereCheckout = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { paperId } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(paperId)) return res.status(400).json({ message: "Valid paperId is required" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const payType = toStr(paper.payment).toLowerCase();
    if (payType !== "paid") {
      return res.status(400).json({ message: "This paper is not a paid paper" });
    }

    const amount = safeNum(paper.amount, 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid paper amount" });
    }

    // already paid?
    const already = await Payment.findOne({ userId, paperId, status: "success" }).lean();
    if (already) {
      return res.status(200).json({
        message: "Already paid",
        unlocked: true,
        orderId: already.orderId,
        paymentId: already.payherePaymentId || null,
      });
    }

    const merchantId = toStr(process.env.PAYHERE_MERCHANT_ID);
    const merchantSecret = toStr(process.env.PAYHERE_MERCHANT_SECRET);
    if (!merchantId || !merchantSecret) {
      return res.status(500).json({ message: "PayHere config missing (merchant id/secret)" });
    }

    const base = getPublicBaseUrl();
    if (!base) {
      return res.status(500).json({
        message:
          "PUBLIC_BASE_URL missing. Set it to your PUBLIC backend URL (not localhost). Example: https://yourdomain.com",
      });
    }

    const currency = getCurrency();

    // order id must be unique
    const orderId = `LESI-${String(paperId)}-${String(userId)}-${Date.now()}`;

    const hash = makePayhereHash({
      merchantId,
      orderId,
      amount,
      currency,
      merchantSecret,
    });

    // ✅ Create pending payment record
    await Payment.create({
      userId,
      paperId,
      orderId,
      amount,
      currency,
      status: "pending",
      raw: {
        paperTitle: paper.paperTitle,
      },
    });

    // ✅ PayHere URLs (MUST be reachable by PayHere servers)
    const notifyUrl = `${base}/api/payment/notify`;
    const returnUrl = `${base}/api/payment/return`;
    const cancelUrl = `${base}/api/payment/cancel`;

    // ✅ These fields will be POSTed to gatewayUrl as form-data
    const fields = {
      merchant_id: merchantId,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,

      order_id: orderId,
      items: toStr(paper.paperTitle || "Paid Paper"),
      currency,
      amount: formatAmount2(amount),

      // optional customer (keep simple)
      first_name: "Student",
      last_name: "User",
      email: "student@example.com",
      phone: "0770000000",
      address: "Sri Lanka",
      city: "Colombo",
      country: "Sri Lanka",

      hash,
    };

    return res.status(200).json({
      message: "Checkout created",
      gatewayUrl: getPayhereGatewayUrl(),
      orderId,
      paperId: String(paperId),
      amount,
      currency,
      fields,
      returnUrl,
      cancelUrl,
    });
  } catch (err) {
    console.error("createPayhereCheckout error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ POST /api/payment/notify (PayHere -> your server)
========================================================= */
export const payhereNotify = async (req, res) => {
  try {
    const body = req.body || {};

    const merchantId = toStr(body.merchant_id);
    const orderId = toStr(body.order_id);
    const paymentId = toStr(body.payment_id);
    const payhereAmount = toStr(body.payhere_amount);
    const payhereCurrency = toStr(body.payhere_currency);
    const statusCode = safeNum(body.status_code, 0);
    const md5sig = toStr(body.md5sig);
    const method = toStr(body.method);

    // Always respond 200 quickly
    res.status(200).send("OK");

    if (!merchantId || !orderId) return;

    const merchantSecret = toStr(process.env.PAYHERE_MERCHANT_SECRET);
    if (!merchantSecret) return;

    // ✅ Verify md5sig:
    // md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + md5(secret).toUpperCase()).toUpperCase()
    const secretHash = md5(merchantSecret).toUpperCase();
    const raw = `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${secretHash}`;
    const localSig = md5(raw).toUpperCase();

    const isValidSig = localSig === md5sig;

    const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 });
    if (!payment) return;

    const next = {
      payherePaymentId: paymentId || payment.payherePaymentId,
      method: method || payment.method,
      statusCode,
      md5sig: md5sig || payment.md5sig,
      raw: body,
    };

    if (!isValidSig) {
      await Payment.findByIdAndUpdate(payment._id, {
        $set: { ...next, status: "failed" },
      });
      return;
    }

    if (statusCode === 2) {
      await Payment.findByIdAndUpdate(payment._id, {
        $set: { ...next, status: "success" },
      });
    } else if (statusCode === -1 || statusCode === -2) {
      await Payment.findByIdAndUpdate(payment._id, {
        $set: { ...next, status: "cancelled" },
      });
    } else {
      await Payment.findByIdAndUpdate(payment._id, {
        $set: { ...next, status: "failed" },
      });
    }
  } catch (err) {
    console.error("payhereNotify error:", err);
    try {
      res.status(200).send("OK");
    } catch {}
  }
};

/* =========================================================
   ✅ GET /api/payment/return
========================================================= */
export const payhereReturn = async (req, res) => {
  return res
    .status(200)
    .send(`<html><body style="font-family:Arial;padding:20px"><h3>Payment Completed</h3><p>You can close this window and return to the app.</p></body></html>`);
};

/* =========================================================
   ✅ GET /api/payment/cancel
========================================================= */
export const payhereCancel = async (req, res) => {
  return res
    .status(200)
    .send(`<html><body style="font-family:Arial;padding:20px"><h3>Payment Cancelled</h3><p>You can close this window and return to the app.</p></body></html>`);
};