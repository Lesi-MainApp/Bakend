import express from "express";
import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../infastructure/schemas/cloudinary.js";

import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// ✅ test route
router.get("/test", (req, res) => {
  res.json({ ok: true, route: "/api/upload" });
});

/**
 * ✅ helper upload function
 */
const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * ✅ POST /api/upload/question-image
 * FormData field name: "image"
 * Returns: { url, publicId }
 */
router.post(
  "/question-image",
  authenticate,
  authorize(["admin"]),
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Image is required" });
      }

      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ message: "Only image files allowed" });
      }

      const result = await uploadToCloudinary(req.file.buffer, "questions");

      return res.status(201).json({
        message: "Uploaded",
        url: result.secure_url,
        publicId: result.public_id,
      });
    } catch (err) {
      console.error("Question image upload error:", err);
      return res.status(500).json({
        message: "Upload failed",
        error: err?.message || String(err),
      });
    }
  }
);

/**
 * ✅ POST /api/upload/class-image
 * FormData field name: "image"
 * Returns: { url, publicId }
 */
router.post(
  "/class-image",
  authenticate,
  authorize(["admin"]),
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Image is required" });
      }

      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ message: "Only image files allowed" });
      }

      const result = await uploadToCloudinary(req.file.buffer, "classes");

      return res.status(201).json({
        message: "Uploaded",
        url: result.secure_url,
        publicId: result.public_id,
      });
    } catch (err) {
      console.error("Class image upload error:", err);
      return res.status(500).json({
        message: "Upload failed",
        error: err?.message || String(err),
      });
    }
  }
);

export default router;