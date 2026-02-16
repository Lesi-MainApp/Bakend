import express from "express";
import { authenticate } from "./middlewares/authentication.js";
import { getMyLanguage, saveLanguageSelection } from "../application/language.js";

const router = express.Router();

router.get("/me", authenticate, getMyLanguage);
router.patch("/select", authenticate, saveLanguageSelection);

export default router;
