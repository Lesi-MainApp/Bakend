import express from "express";
import { authenticate } from "../api/middlewares/authentication.js";
import { authorize } from "../api/middlewares/authrization.js";

import {
  createQuestion,
  getQuestionsByPaper,
  updateQuestionById,
  deleteQuestionById,
} from "../application/question.js";

const router = express.Router();

// ✅ admin only (you said admin creates paper/questions)
router.post("/", authenticate, authorize(["admin"]), createQuestion);
router.get("/paper/:paperId", authenticate, authorize(["admin"]), getQuestionsByPaper);
router.patch("/:questionId", authenticate, authorize(["admin"]), updateQuestionById);
router.delete("/:questionId", authenticate, authorize(["admin"]), deleteQuestionById);

export default router;
