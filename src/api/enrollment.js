import express from "express";
import { authenticate } from "../api/middlewares/authentication.js";
import { authorize } from "../api/middlewares/authrization.js";

import {
  requestEnroll,
  getMyEnrollRequests,
  getPendingEnrollRequests,
  approveEnrollRequest,
  rejectEnrollRequest,
} from "../application/enrollment.js";

const router = express.Router();

// ✅ student
router.post("/request", authenticate, authorize(["student"]), requestEnroll);
router.get("/my", authenticate, authorize(["student"]), getMyEnrollRequests);

// ✅ admin
router.get("/pending", authenticate, authorize(["admin"]), getPendingEnrollRequests);
router.patch("/approve/:enrollId", authenticate, authorize(["admin"]), approveEnrollRequest);
router.patch("/reject/:enrollId", authenticate, authorize(["admin"]), rejectEnrollRequest);

export default router;
