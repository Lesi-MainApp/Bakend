import mongoose from "mongoose";
const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },

    questionNumber: { type: Number, required: true, min: 1, index: true },

    lessonName: { type: String, default: "", trim: true },

    question: { type: String, required: true, trim: true },

    // store answers as array (better than answer1..answer5)
    answers: { type: [String], required: true, default: [] },

    // 0-based index of correct answer
    correctAnswerIndex: { type: Number, required: true, min: 0 },

    point: { type: Number, default: 5, min: 0 },

    explanationVideoUrl: { type: String, default: "", trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ✅ no duplicate question number in same paper
questionSchema.index({ paperId: 1, questionNumber: 1 }, { unique: true });

const Question = mongoose.models.Question || mongoose.model("Question", questionSchema);
export default Question;
