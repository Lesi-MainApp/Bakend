export const authorize = (roles = []) => {
  const allowed = roles.map((r) => String(r).toLowerCase().trim());

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase().trim();
    if (!role) return res.status(401).json({ message: "Unauthorized" });
    if (!allowed.includes(role)) return res.status(403).json({ message: "Forbidden: role not allowed" });
    next();
  };
};
