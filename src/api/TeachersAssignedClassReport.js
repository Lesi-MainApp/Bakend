import express from "express";
import { getTeachersAssignedClassReport } from "../application/TeachersAssignedClassReport.js";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

/**
 * GET /api/teachers-assigned-class-report
 * Teacher only
 */
router.get(
  "/",
  authenticate,
  authorize(["teacher"]),
  getTeachersAssignedClassReport
);

export default router;