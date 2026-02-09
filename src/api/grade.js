// backend/api/grade.js
import express from "express";
import { authenticate } from "../api/middlewares/authentication.js";
import { authorize } from "../api/middlewares/authrization.js";

import {
  // admin grade
  createGrade,
  updateGradeById,
  deleteGradeById,

  // subjects
  getSubjectsByGrade,
  createSubject,
  updateSubjectById,
  deleteSubjectById,

  // streams
  getStreamsByGradeId,
  createStream,
  updateStreamById,
  deleteStreamById,

  // stream subjects
  getStreamSubjects,
  createStreamSubject,
  updateStreamSubjectById,
  deleteStreamSubjectById,

  // public
  getGradesPublic,
  getGradeDetailPublic,

  // smart streams
  getStreamsSmart,
} from "../application/grade.js";

const router = express.Router();

/* ✅ PUBLIC */
router.get("/", getGradesPublic);
router.get("/grades", getGradesPublic);
router.get("/streams/:value", getStreamsSmart);

/* ✅ READ endpoints: allow any logged-in user (fixes 403 on View) */
router.get("/subjects/:gradeId", authenticate, getSubjectsByGrade);
router.get("/streams/admin/:gradeId", authenticate, getStreamsByGradeId); // optional (safe separate)
router.get("/stream/subjects/:gradeId/:streamId", authenticate, getStreamSubjects);

/* ✅ ADMIN write endpoints */
router.post("/grade", authenticate, authorize(["admin"]), createGrade);
router.patch("/grade/:gradeId", authenticate, authorize(["admin"]), updateGradeById);
router.delete("/grade/:gradeId", authenticate, authorize(["admin"]), deleteGradeById);

router.post("/subject", authenticate, authorize(["admin"]), createSubject);
router.patch("/subject/:gradeId/:subjectId", authenticate, authorize(["admin"]), updateSubjectById);
router.delete("/subject/:gradeId/:subjectId", authenticate, authorize(["admin"]), deleteSubjectById);

router.post("/stream", authenticate, authorize(["admin"]), createStream);
router.patch("/stream/:gradeId/:streamId", authenticate, authorize(["admin"]), updateStreamById);
router.delete("/stream/:gradeId/:streamId", authenticate, authorize(["admin"]), deleteStreamById);

router.post("/stream/subject", authenticate, authorize(["admin"]), createStreamSubject);
router.patch(
  "/stream/subject/:gradeId/:streamId/:subjectId",
  authenticate,
  authorize(["admin"]),
  updateStreamSubjectById
);
router.delete(
  "/stream/subject/:gradeId/:streamId/:subjectId",
  authenticate,
  authorize(["admin"]),
  deleteStreamSubjectById
);

/* ✅ IMPORTANT: keep LAST */
router.get("/:gradeNumber", getGradeDetailPublic);

export default router;
