import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";
import { createQuestion, getQuestionsByPaper, updateQuestionById } from "../application/question.js";

const router = express.Router();

router.post("/", authenticate, authorize(["admin"]), createQuestion);
router.get("/paper/:paperId", authenticate, authorize(["admin"]), getQuestionsByPaper);
router.patch("/:questionId", authenticate, authorize(["admin"]), updateQuestionById);

export default router;
