// backend/api/teacherAssignment.js
import express from "express";
import { authenticate } from "../api/middlewares/authentication.js";
import { authorize } from "../api/middlewares/authrization.js";

import {
  getAllTeachers,
  getTeacherById,
  updateTeacherById,
  deleteTeacherById, // kept in controller but NOT used here
  approveTeacher,
  getTeacherAssignFormData,
  createAssignTeacher,
  replaceTeacherAssignments,
  disableTeacherAccess,
} from "../application/teacherAssignment.js";

const router = express.Router();

router.get("/", authenticate, authorize(["admin"]), getAllTeachers);
router.get("/:teacherId", authenticate, authorize(["admin"]), getTeacherById);
router.patch("/:teacherId", authenticate, authorize(["admin"]), updateTeacherById);

// ❌ REMOVED DELETE ROUTE (NO MORE DELETE)
// router.delete("/:teacherId", authenticate, authorize(["admin"]), deleteTeacherById);

router.patch("/:teacherId/approve", authenticate, authorize(["admin"]), approveTeacher);
router.get("/:teacherId/form-data", authenticate, authorize(["admin"]), getTeacherAssignFormData);

// ✅ APPEND + MERGE (old behavior)
router.post("/:teacherId/assign", authenticate, authorize(["admin"]), createAssignTeacher);

// ✅ REPLACE assignments (EDIT behavior)
router.put("/:teacherId/assign", authenticate, authorize(["admin"]), replaceTeacherAssignments);

// ✅ DISABLE teacher access (soft block)
router.patch("/:teacherId/access", authenticate, authorize(["admin"]), disableTeacherAccess);

export default router;
