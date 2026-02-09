import mongoose from "mongoose";
const { Schema } = mongoose;

const enrollmentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },

    // snapshot (so even if student edits profile later, request keeps original)
    studentName: { type: String, required: true, trim: true },
    studentPhone: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    requestedAt: { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // admin

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ✅ prevent duplicate request for same student+class (even if they click many times)
enrollmentSchema.index({ studentId: 1, classId: 1 }, { unique: true });

const Enrollment =
  mongoose.models.Enrollment || mongoose.model("Enrollment", enrollmentSchema);

export default Enrollment;
