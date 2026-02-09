import mongoose from "mongoose";
const { Schema } = mongoose;

const paperSchema = new Schema(
  {
    gradeId: { type: Schema.Types.ObjectId, ref: "Grade", required: true, index: true },

    // grade 1-11
    subjectId: { type: Schema.Types.ObjectId, default: null, index: true },

    // grade 12-13
    streamId: { type: Schema.Types.ObjectId, default: null, index: true },
    streamSubjectId: { type: Schema.Types.ObjectId, default: null, index: true },

    paperType: { type: String, required: true, trim: true },
    paperTitle: { type: String, required: true, trim: true },

    timeMinutes: { type: Number, required: true, min: 1 },
    questionCount: { type: Number, required: true, min: 1 },
    oneQuestionAnswersCount: { type: Number, required: true, min: 2, max: 10, default: 5 },

    createdPersonName: { type: String, required: true, trim: true },

    payment: { type: String, enum: ["free", "paid"], default: "free", index: true },
    amount: { type: Number, default: 0, min: 0 },

    attempts: { type: Number, default: 1, min: 1 },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const Paper = mongoose.models.Paper || mongoose.model("Paper", paperSchema);
export default Paper;
