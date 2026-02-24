// src/api/student.js
import express from "express";
import {
  listStudents,
  getStudentById,
  updateStudentById,
  setStudentBan,
  deleteStudentHard,
  getStudentFilterOptions,
} from "../application/student.js";

import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

router.use(authenticate);
router.use(authorize(["admin"]));

router.get("/options", async (req, res, next) => {
  try {
    const data = await getStudentFilterOptions();
    return res.json(data);
  } catch (e) {
    next(e);
  }
});

// ✅ default: return all students
router.get("/", async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "",
      email = "",
      district = "",
      level = "",
      grade = "",
      classId = "",
      completedCount = "",
    } = req.query;

    const data = await listStudents(
      { status, email, district, level, grade, classId, completedCount },
      { page, limit }
    );

    return res.json(data);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const student = await getStudentById(req.params.id);
    return res.json(student);
  } catch (e) {
    next(e);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const updated = await updateStudentById(req.params.id, req.body);
    return res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/ban", async (req, res, next) => {
  try {
    const updated = await setStudentBan(req.params.id, true);
    return res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/unban", async (req, res, next) => {
  try {
    const updated = await setStudentBan(req.params.id, false);
    return res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const out = await deleteStudentHard(req.params.id);
    return res.json(out);
  } catch (e) {
    next(e);
  }
});

export default router;