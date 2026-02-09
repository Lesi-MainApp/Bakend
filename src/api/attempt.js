import express from "express";
import { authenticate } from "../api/middlewares/authentication.js";
import { authorize } from "../api/middlewares/authrization.js";

import {
  startAttempt,
  saveAnswer,
  submitAttempt,
  myAttemptsByPaper,
  attemptSummary,
  attemptReview,
} from "../application/attempt.js";

const router = express.Router();

// ✅ student only
router.post("/start", authenticate, authorize(["student"]), startAttempt);
router.post("/answer", authenticate, authorize(["student"]), saveAnswer);
router.post("/submit/:attemptId", authenticate, authorize(["student"]), submitAttempt);

router.get("/my/:paperId", authenticate, authorize(["student"]), myAttemptsByPaper);
router.get("/summary/:attemptId", authenticate, authorize(["student"]), attemptSummary);
router.get("/review/:attemptId", authenticate, authorize(["student"]), attemptReview);

export default router;
