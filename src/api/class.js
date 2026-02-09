import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

import {
  createClass,
  getAllClass,
  getClassById,
  updateClassById,
  deleteClassById,

  // ✅ NEW public
  getClassesPublic,
} from "../application/class.js";

const router = express.Router();

/* =========================
   ✅ PUBLIC (Student App)
========================= */
// GET /api/class/public?gradeNumber=4&subjectName=Maths
router.get("/public", getClassesPublic);

/* =========================
   ✅ ADMIN ONLY
========================= */
router.post("/", authenticate, authorize(["admin"]), createClass);
router.get("/", authenticate, authorize(["admin"]), getAllClass);
router.get("/:classId", authenticate, authorize(["admin"]), getClassById);
router.patch("/:classId", authenticate, authorize(["admin"]), updateClassById);
router.delete("/:classId", authenticate, authorize(["admin"]), deleteClassById);

export default router;
