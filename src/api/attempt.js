import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

import {
  startAttempt,
  getAttemptQuestions,
  saveAnswer,
  submitAttempt,
  myAttemptsByPaper,
  attemptSummary,
  attemptReview,
  myCompletedPapers,
  myStats,
} from "../application/attempt.js";

const router = express.Router();

// student only
router.post("/start", authenticate, authorize(["student"]), startAttempt);

router.get("/questions/:attemptId", authenticate, authorize(["student"]), getAttemptQuestions);

router.post("/answer", authenticate, authorize(["student"]), saveAnswer);
router.post("/submit/:attemptId", authenticate, authorize(["student"]), submitAttempt);

router.get("/my/:paperId", authenticate, authorize(["student"]), myAttemptsByPaper);
router.get("/summary/:attemptId", authenticate, authorize(["student"]), attemptSummary);

router.get("/review/:attemptId", authenticate, authorize(["student"]), attemptReview);

// ✅ Completed list (best per paper)
router.get("/completed", authenticate, authorize(["student"]), myCompletedPapers);

// ✅ NEW stats (Coins = total points)
router.get("/stats", authenticate, authorize(["student"]), myStats);
