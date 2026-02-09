// backend/api/lesson.js
import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

import {
  createLesson,
  getAllLessons,
  getLessonById,
  getLessonsByClassId,
  updateLessonById,
  deleteLessonById,
} from "../application/lesson.js";

const router = express.Router();

// ✅ admin create/update/delete
router.post("/", authenticate, authorize(["admin"]), createLesson);
router.patch("/:lessonId", authenticate, authorize(["admin"]), updateLessonById);
router.delete("/:lessonId", authenticate, authorize(["admin"]), deleteLessonById);

// ✅ admin can list all lessons
router.get("/", authenticate, authorize(["admin"]), getAllLessons);

// ✅ student/admin: lessons by class (student must be enrolled+approved)
router.get(
  "/class/:classId",
  authenticate,
  authorize(["admin", "student"]),
  getLessonsByClassId
);

// ✅ student/admin: lesson by id (student must be enrolled+approved)
router.get("/:lessonId", authenticate, authorize(["admin", "student"]), getLessonById);

export default router;
