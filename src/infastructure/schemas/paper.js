import mongoose from "mongoose";
const { Schema } = mongoose;

export const PAPER_TYPES = [
  "Daily Quiz",
  "Topic wise paper",
  "Model paper",
  "Past paper",
];

export const PAYMENT_TYPES = ["free", "paid", "practise"];
export const ATTEMPTS_ALLOWED = [1, 2, 3];

const paperSchema = new Schema(
  {
    gradeId: {
      type: Schema.Types.ObjectId,
      ref: "Grade",
      required: true,
      index: true,
    },

    subjectId: { type: Schema.Types.ObjectId, default: null, index: true },
    streamId: { type: Schema.Types.ObjectId, default: null, index: true },
    streamSubjectId: { type: Schema.Types.ObjectId, default: null, index: true },

    paperType: {
      type: String,
      required: true,
      trim: true,
      enum: PAPER_TYPES,
    },

    paperTitle: {
      type: String,
      required: true,
      trim: true,
    },

    timeMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 180,
    },

    questionCount: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
    },

    // ✅ REQUIRED (2–6 only)
    oneQuestionAnswersCount: {
      type: Number,
      required: true,
      min: 2,
      max: 6,
    },

    createdPersonName: {
      type: String,
      required: true,
      trim: true,
    },

    payment: {
      type: String,
      enum: PAYMENT_TYPES,
      default: "free",
      index: true,
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    attempts: {
      type: Number,
      default: 1,
      enum: ATTEMPTS_ALLOWED,
    },

    isActive: { type: Boolean, default: true },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

const Paper = mongoose.models.Paper || mongoose.model("Paper", paperSchema);
export default Paper;