// src/api/payment.js
import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

import {
  createPayhereCheckout,
  payhereNotify,
  getMyPaymentStatus,
  payhereReturn,
  payhereCancel,
} from "../application/payment.js";

const router = express.Router();

// ✅ student creates checkout
router.post("/checkout", authenticate, authorize(["student"]), createPayhereCheckout);

// ✅ student checks unlock
router.get("/my/:paperId", authenticate, authorize(["student"]), getMyPaymentStatus);

// ✅ PayHere notify (NO auth) - urlencoded
router.post("/notify", express.urlencoded({ extended: true }), payhereNotify);

// ✅ PayHere return/cancel (NO auth)
router.get("/return", payhereReturn);
router.get("/cancel", payhereCancel);

export default router;