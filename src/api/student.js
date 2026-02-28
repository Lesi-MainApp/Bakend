import express from "express";
import {
  getStudentOptions,
  getStudents,
  banStudent,
  unbanStudent,
} from "../application/studentAdmin.js";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

/**
 * Admin Student Management
 */
router.get(
  "/options",
  authenticate,
  authorize(["admin"]),
  getStudentOptions
);

router.get(
  "/",
  authenticate,
  authorize(["admin"]),
  getStudents
);

router.patch(
  "/:id/ban",
  authenticate,
  authorize(["admin"]),
  banStudent
);

router.patch(
  "/:id/unban",
  authenticate,
  authorize(["admin"]),
  unbanStudent
);

export default router;