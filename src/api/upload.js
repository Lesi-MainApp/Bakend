import express from "express";
import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../infastructure/schemas/cloudinary.js";

import { authenticate } from "./middlewares/authentication.js";
import { authorize } from "./middlewares/authrization.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/class-image",
  authenticate,
  authorize(["admin"]),
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Image is required" });
      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ message: "Only image files allowed" });
      }

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "classes", resource_type: "image" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });

      return res.status(201).json({
        message: "Uploaded",
        url: result.secure_url,
        publicId: result.public_id,
      });
    } catch (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ message: "Upload failed", error: err?.message || String(err) });
    }
  }
);

export default router;
