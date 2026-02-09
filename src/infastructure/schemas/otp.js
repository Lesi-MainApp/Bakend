import mongoose from "mongoose";
const { Schema } = mongoose;

const otpSchema = new Schema(
  {
    phonenumber: { type: String, required: true, index: true },
    email: { type: String, default: "", lowercase: true, trim: true, index: true },

    codeHash: { type: String, required: true },

    purpose: {
      type: String,
      enum: ["verify_phone", "reset_password"],
      required: true,
    },

    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },

    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// TTL index: auto-delete after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Otp = mongoose.models.Otp || mongoose.model("Otp", otpSchema);
export default Otp;
