// src/api/rank.js
import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";
import { getIslandRank } from "../application/rank.js";

const router = express.Router();

// student only
// GET /api/rank/island?limit=50
router.get("/island", authenticate, authorize(["student"]), getIslandRank);

export default router;