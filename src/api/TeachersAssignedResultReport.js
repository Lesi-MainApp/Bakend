import express from "express";
import { getTeachersAssignedResultReport } from "../application/TeachersAssignedResultReport.js";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

/**
 * GET /api/teachers-assigned-result-report
 * Teacher only
 *
 * query:
 * - paperType
 * - subject
 */
router.get(
  "/",
  authenticate,
  authorize(["teacher"]),
  getTeachersAssignedResultReport
);

export default router;