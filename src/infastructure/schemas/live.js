import mongoose from "mongoose";
const { Schema } = mongoose;

const liveSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },

    scheduledAt: { type: Date, required: true },

    zoomLink: { type: String, required: true, trim: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

liveSchema.index({ classId: 1, scheduledAt: -1 });

const Live = mongoose.models.Live || mongoose.model("Live", liveSchema);
export default Live;
