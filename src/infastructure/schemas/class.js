// backend/infastructure/schemas/class.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const classSchema = new Schema(
  {
    className: { type: String, required: true, trim: true },

    // ✅ only grades 1-11
    gradeId: { type: Schema.Types.ObjectId, ref: "Grade", required: true },

    // ✅ subjectId must belong to Grade.subjects[]
    subjectId: { type: Schema.Types.ObjectId, required: true },

    // ✅ assigned teachers (must be approved teachers)
    teacherIds: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ✅ No duplicate classes for same grade + subject + class name
classSchema.index({ className: 1, gradeId: 1, subjectId: 1 }, { unique: true });

const ClassModel = mongoose.models.Class || mongoose.model("Class", classSchema);
export default ClassModel;
