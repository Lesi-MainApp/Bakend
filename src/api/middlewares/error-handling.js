const GlobalErrorHandler = (err, req, res, next) => {
  console.error("Error:", err?.message || err);

  if (err?.name === "NotFoundError") return res.status(404).json({ message: err.message });
  if (err?.name === "ValidationError") return res.status(400).json({ message: err.message });
  if (err?.name === "forbiddenError") return res.status(403).json({ message: err.message });

  return res.status(500).json({ message: "Internal server error" });
};

export default GlobalErrorHandler;
