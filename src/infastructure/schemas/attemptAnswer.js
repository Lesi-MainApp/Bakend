import mongoose from "mongoose";
const { Schema } = mongoose;

const attemptAnswerSchema = new Schema(
  {
    attemptId: { type: Schema.Types.ObjectId, ref: "PaperAttempt", required: true, index: true },
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },

    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true, index: true },
    questionNumber: { type: Number, required: true, min: 1 },

    // what student chose
    selectedAnswerIndex: { type: Number, required: true, min: 0 },

    // calculated on submit (optional store)
    isCorrect: { type: Boolean, default: false, index: true },
    earnedPoints: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// one answer per question per attempt
attemptAnswerSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

const AttemptAnswer =
  mongoose.models.AttemptAnswer || mongoose.model("AttemptAnswer", attemptAnswerSchema);

export default AttemptAnswer;
