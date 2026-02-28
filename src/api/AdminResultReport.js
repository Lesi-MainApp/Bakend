import express from "express";
import { getAdminResultReport } from "../application/AdminResultReport.js";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

/**
 * GET /api/admin-result-report
 * admin only
 * query:
 * - paperType
 * - subject
 * - grade
 * - completedPaperCount
 */
router.get(
  "/",
  authenticate,
  authorize(["admin"]),
  getAdminResultReport
);

export default router;