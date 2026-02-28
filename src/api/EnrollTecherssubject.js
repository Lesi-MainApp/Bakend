import express from "express";
import { getTeacherEnrollSubjectStudents } from "../application/EnrollTecherssubject.js";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

/**
 * GET /api/teacher-enroll-subject/students
 * Teacher only
 * Returns students enrolled in teacher's own assigned subject + grade classes
 *
 * Query params:
 * - district
 * - town
 * - studentName
 * - grade
 * - subject
 */
router.get(
  "/students",
  authenticate,
  authorize(["teacher"]),
  getTeacherEnrollSubjectStudents
);

export default router;