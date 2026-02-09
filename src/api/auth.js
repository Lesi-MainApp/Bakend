import express from "express";
import {
  signUp,
  signIn,
  signOut,
  sendVerificationCode,
  verifyCode,
  submitStudentDetails,
  forgotPasswordSendOtp,
  forgotPasswordReset,
} from "../application/auth.js";

const router = express.Router();

router.post("/signup", signUp);
router.post("/signin", signIn);
router.post("/signout", signOut);

router.post("/student/details", submitStudentDetails);

router.post("/whatsapp/send-code", sendVerificationCode);
router.post("/whatsapp/verify-code", verifyCode);

router.post("/forgot-password/send-otp", forgotPasswordSendOtp);
router.post("/forgot-password/reset", forgotPasswordReset);

export default router;
