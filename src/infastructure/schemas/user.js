import mongoose from "mongoose";

const { Schema } = mongoose;

export const SL_PHONE_REGEX = /^(?:\+94|0)?(?:7[0-9]{8}|[1-9][0-9]{8})$/;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // ✅ MAKE UNIQUE
    phonenumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    password: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: ["admin", "teacher", "student"],
      default: "student",
    },

    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },

    isApproved: { type: Boolean, default: false },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    isActive: { type: Boolean, default: true },

    // student details
    district: { type: String, default: "" },
    town: { type: String, default: "" },
    address: { type: String, default: "" },

    selectedLanguage: {
      type: String,
      enum: ["si", "en"],
      default: "si",
    },

    selectedLevel: {
      type: String,
      enum: ["primary", "secondary", "al"],
      default: null,
    },
    selectedGradeNumber: { type: Number, min: 1, max: 13, default: null },
    selectedStream: { type: String, default: null, trim: true },
    gradeSelectionLocked: { type: Boolean, default: false },
    gradeSelectedAt: { type: Date, default: null },

    progressHighWaterMark: { type: Number, default: 0, min: 0, max: 1 },
    progressUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;