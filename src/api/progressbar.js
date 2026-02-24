import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";
import { getMyProgress } from "../application/progressbar.js";

const router = express.Router();

// student only
router.get("/my", authenticate, authorize(["student"]), getMyProgress);

export default router;