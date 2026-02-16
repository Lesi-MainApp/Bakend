import mongoose from "mongoose";
const { Schema } = mongoose;

const languageSelectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    language: { type: String, enum: ["si", "en"], required: true, default: "si" },
  },
  { timestamps: true }
);

const LanguageSelection =
  mongoose.models.LanguageSelection || mongoose.model("LanguageSelection", languageSelectionSchema);

export default LanguageSelection;
