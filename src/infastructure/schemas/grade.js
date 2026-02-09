import mongoose from "mongoose";
const { Schema } = mongoose;

const subjectSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    subject: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const streamSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    stream: { type: String, required: true, trim: true }, // Maths, Arts, Tech...
    subjects: { type: [subjectSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const gradeSchema = new Schema(
  {
    // ✅ only grade number 1..13
    grade: { type: Number, required: true, min: 1, max: 13, unique: true, index: true },

    // ✅ subjects only for grades 1..11
    subjects: { type: [subjectSchema], default: [] },

    // ✅ streams only for grades 12..13
    streams: { type: [streamSchema], default: [] },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const Grade = mongoose.models.Grade || mongoose.model("Grade", gradeSchema);
export default Grade;
