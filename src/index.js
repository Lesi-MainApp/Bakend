import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import liveRouter from "./api/live.js";
import connectDB from "./infastructure/db.js";
import userRouter from "./api/user.js";
import authRouter from "./api/auth.js";
import gradeRouter from "./api/grade.js";
import teacherAssignmentRouter from "./api/teacherAssignment.js";
import classRouter from "./api/class.js";
import lessonRouter from "./api/lesson.js";
import enrollRouter from "./api/enrollment.js";
import paperRouter from "./api/paper.js";
import questionRouter from "./api/question.js";
import attemptRouter from "./api/attempt.js";

// ✅ NEW
import uploadRouter from "./api/upload.js";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8081",
  "http://localhost:5174",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/grade", gradeRouter);
app.use("/api/class", classRouter);

// ✅ NEW
app.use("/api/upload", uploadRouter);

app.use("/api/teacher", teacherAssignmentRouter);
app.use("/api/live", liveRouter);
app.use("/api/lesson", lessonRouter);
app.use("/api/enroll", enrollRouter);
app.use("/api/paper", paperRouter);
app.use("/api/question", questionRouter);
app.use("/api/attempt", attemptRouter);

connectDB();

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
