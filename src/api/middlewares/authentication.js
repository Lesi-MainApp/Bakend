import jwt from "jsonwebtoken";
import User from "../../infastructure/schemas/user.js";

export const authenticate = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.id || decoded?._id || decoded?.userId;
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.isActive === false) return res.status(403).json({ message: "User is inactive" });

    req.user = {
      id: String(user._id),
      role: String(user.role || "").toLowerCase().trim(),
      isApproved: !!user.isApproved,
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
