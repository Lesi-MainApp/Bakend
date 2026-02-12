// backend/infastructure/schemas/question.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const questionSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    questionNumber: { type: Number, required: true, min: 1, index: true },
    lessonName: { type: String, default: "", trim: true },
    question: { type: String, required: true, trim: true },

    answers: { type: [String], required: true, default: [] },
    correctAnswerIndex: { type: Number, required: true, min: 0 },

    point: { type: Number, default: 5, min: 0 },

    // ✅ explanation URL + explanation text
    explanationVideoUrl: { type: String, default: "", trim: true },
    explanationText: { type: String, default: "", trim: true },

    imageUrl: { type: String, default: "", trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

questionSchema.index({ paperId: 1, questionNumber: 1 }, { unique: true });

const Question = mongoose.models.Question || mongoose.model("Question", questionSchema);
export default Question;
