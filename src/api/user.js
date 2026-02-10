import express from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUserById,
  approveTeacher,
  rejectTeacher,
  saveStudentGradeSelection, // ✅ NEW
} from "../application/user.js";

import { authenticate } from "../api/middlewares/authentication.js";
import { authorize } from "../api/middlewares/authrization.js";

const router = express.Router();

/* =========================
   ✅ STUDENT: SAVE ONCE
========================= */
router.patch(
  "/student/grade-selection",
  authenticate,
  authorize(["student"]),
  saveStudentGradeSelection
);

/* =========================
   ✅ ADMIN ROUTES
========================= */
router.post("/create", authenticate, authorize(["admin"]), createUser);
router.put("/:id", authenticate, authorize(["admin"]), updateUser);
router.delete("/:id", authenticate, authorize(["admin"]), deleteUserById);

router.patch("/:id/approve-teacher", authenticate, authorize(["admin"]), approveTeacher);
router.patch("/:id/reject-teacher", authenticate, authorize(["admin"]), rejectTeacher);
router.patch("/student/grade-selection", authenticate, saveStudentGradeSelection);
router.get("/", authenticate, authorize(["admin"]), getAllUsers);
router.get("/:id", authenticate, authorize(["admin"]), getUserById);



export default router;
