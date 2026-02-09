import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

import {
  createClass,
  getAllClass,
  getClassById,
  updateClassById,
  deleteClassById,
  getClassesPublic,
} from "../application/class.js";

const router = express.Router();

// PUBLIC
router.get("/public", getClassesPublic);

// ADMIN
router.post("/", authenticate, authorize(["admin"]), createClass);
router.get("/", authenticate, authorize(["admin"]), getAllClass);
router.get("/:classId", authenticate, authorize(["admin"]), getClassById);
router.patch("/:classId", authenticate, authorize(["admin"]), updateClassById);
router.delete("/:classId", authenticate, authorize(["admin"]), deleteClassById);

export default router;
