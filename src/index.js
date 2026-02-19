import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./infastructure/db.js";
import GlobalErrorHandler from "./api/middlewares/error-handling.js";

import authRouter from "./api/auth.js";
import userRouter from "./api/user.js";
import gradeRouter from "./api/grade.js";
import teacherAssignmentRouter from "./api/teacherAssignment.js";
import classRouter from "./api/class.js";
import lessonRouter from "./api/lesson.js";
import liveRouter from "./api/live.js";
import enrollRouter from "./api/enrollment.js";

import paperRouter from "./api/paper.js";
import questionRouter from "./api/question.js";

// ✅ ADD THIS (attempt router)
import attemptRouter from "./api/attempt.js";

// ✅ Cloudinary upload router
import uploadRouter from "./api/upload.js";

// ✅ NEW
import languageRouter from "./api/language.js";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8081",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());

// routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/grade", gradeRouter);
app.use("/api/class", classRouter);
app.use("/api/teacher", teacherAssignmentRouter);
app.use("/api/live", liveRouter);
app.use("/api/lesson", lessonRouter);
app.use("/api/enroll", enrollRouter);

app.use("/api/paper", paperRouter);
app.use("/api/question", questionRouter);

// ✅ FIX: MOUNT attempt routes
app.use("/api/attempt", attemptRouter);

// ✅ Cloudinary upload endpoint base
app.use("/api/upload", uploadRouter);

// ✅ NEW language endpoint
app.use("/api/language", languageRouter);

// error handler
app.use(GlobalErrorHandler);

connectDB();

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log("✅ Mounted routes: /api/upload");
  console.log("✅ Mounted routes: /api/language");
  console.log("✅ Mounted routes: /api/attempt"); // ✅ add log
});
