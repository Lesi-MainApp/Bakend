import mongoose from "mongoose";
const { Schema } = mongoose;

const lessonSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },

    title: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true }, // "2026-01-29"
    time: { type: String, required: true, trim: true }, // "10:30"
    description: { type: String, default: "", trim: true },

    // ✅ NEW: YouTube URL
    youtubeUrl: { type: String, default: "", trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ✅ prevent duplicate lesson in same class at same date+time with same title
lessonSchema.index({ classId: 1, title: 1, date: 1, time: 1 }, { unique: true });

const Lesson = mongoose.models.Lesson || mongoose.model("Lesson", lessonSchema);
export default Lesson;
