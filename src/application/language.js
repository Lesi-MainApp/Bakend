import LanguageSelection from "../infastructure/schemas/languageSelection.js";
import User from "../infastructure/schemas/user.js";

export const getMyLanguage = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const doc = await LanguageSelection.findOne({ userId }).lean();
    const user = await User.findById(userId).lean();

    return res.status(200).json({
      language: doc?.language || user?.selectedLanguage || "si",
    });
  } catch (err) {
    console.error("getMyLanguage error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const saveLanguageSelection = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const lang = req.body?.language === "en" ? "en" : "si";

    const doc = await LanguageSelection.findOneAndUpdate(
      { userId },
      { userId, language: lang },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // also store in user for easy access
    await User.findByIdAndUpdate(userId, { selectedLanguage: lang });

    return res.status(200).json({
      message: "Language saved",
      language: doc?.language || lang,
    });
  } catch (err) {
    console.error("saveLanguageSelection error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
