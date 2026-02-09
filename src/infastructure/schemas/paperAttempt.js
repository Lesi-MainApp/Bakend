import mongoose from "mongoose";
const { Schema } = mongoose;

const paperAttemptSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    attemptNo: { type: Number, required: true, min: 1 }, // 1..paper.attempts

    status: {
      type: String,
      enum: ["in_progress", "submitted"],
      default: "in_progress",
      index: true,
    },

    // ✅ snapshot from paper when attempt starts
    gradeId: { type: Schema.Types.ObjectId, ref: "Grade", required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, default: null },
    streamId: { type: Schema.Types.ObjectId, default: null },
    streamSubjectId: { type: Schema.Types.ObjectId, default: null },

    questionCount: { type: Number, required: true, min: 1 },
    oneQuestionAnswersCount: { type: Number, required: true, min: 2 },

    // scoring
    totalPossiblePoints: { type: Number, default: 0, min: 0 },
    totalPointsEarned: { type: Number, default: 0, min: 0 },
    correctCount: { type: Number, default: 0, min: 0 },
    wrongCount: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },

    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// one student can have multiple attempts, but attemptNo must be unique per paper+student
paperAttemptSchema.index({ paperId: 1, studentId: 1, attemptNo: 1 }, { unique: true });

const PaperAttempt =
  mongoose.models.PaperAttempt || mongoose.model("PaperAttempt", paperAttemptSchema);

export default PaperAttempt;
