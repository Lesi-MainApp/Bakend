// backend/api/live.js
import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

import {
  createLive,
  getAllLive,
  getLiveById,
  updateLiveById,
  deleteLiveById,
} from "../application/live.js";

// ✅ NEW
import { getStudentLives } from "../application/liveStudent.js";

const router = express.Router();

// ✅ STUDENT: enrolled lives only
router.get("/student", authenticate, authorize(["student"]), getStudentLives);

// ✅ admin only
router.post("/", authenticate, authorize(["admin"]), createLive);
router.get("/", authenticate, authorize(["admin"]), getAllLive);
router.get("/:id", authenticate, authorize(["admin"]), getLiveById);
router.patch("/:id", authenticate, authorize(["admin"]), updateLiveById);
router.delete("/:id", authenticate, authorize(["admin"]), deleteLiveById);

export default router;
