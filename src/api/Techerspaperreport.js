import express from "express";
import { getTechersPaperReport } from "../application/Techerspaperreport.js";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

/**
 * GET /api/teachers-paper-report
 * teacher only
 *
 * query:
 * - paperName
 * - subject
 * - grade
 * - enrollStatus
 */
router.get(
  "/",
  authenticate,
  authorize(["teacher"]),
  getTechersPaperReport
);

export default router;