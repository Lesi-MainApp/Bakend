// backend/application/live.js
import mongoose from "mongoose";
import Live from "../infastructure/schemas/live.js";
import ClassModel from "../infastructure/schemas/class.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const attachComputedFields = (liveDoc) => {
  const live = liveDoc?.toObject ? liveDoc.toObject() : liveDoc;

  const cls = live?.classId; // populated class
  const grade = cls?.gradeId; // populated grade

  let subjectName = null;
  if (grade?.subjects?.length && cls?.subjectId) {
    const sub = grade.subjects.find((s) => String(s._id) === String(cls.subjectId));
    subjectName = sub?.subject || null;
  }

  const teacherNames = Array.isArray(cls?.teacherIds)
    ? cls.teacherIds.map((t) => t?.name).filter(Boolean)
    : [];

  return {
    ...live,
    className: cls?.className || null,
    gradeName: grade?.grade || null,
    subjectName,
    teacherNames,
  };
};

// ✅ CREATE LIVE (admin)
export const createLive = async (req, res) => {
  try {
    const { classId, title, scheduledAt, zoomLink, isActive } = req.body;

    if (!classId || !title || !scheduledAt || !zoomLink) {
      return res.status(400).json({
        message: "classId, title, scheduledAt, zoomLink are required",
      });
    }

    if (!isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid classId" });
    }

    const foundClass = await ClassModel.findById(classId).select("_id");
    if (!foundClass) return res.status(404).json({ message: "Class not found" });

    const dt = new Date(scheduledAt);
    if (Number.isNaN(dt.getTime())) {
      return res.status(400).json({ message: "scheduledAt must be a valid datetime" });
    }

    const live = await Live.create({
      classId,
      title: String(title).trim(),
      scheduledAt: dt,
      zoomLink: String(zoomLink).trim(),
      isActive: typeof isActive === "boolean" ? isActive : true,
      createdBy: req.user?.id || null, // ✅ FIXED
    });

    return res.status(201).json({ message: "Live created", live });
  } catch (err) {
    console.error("createLive error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ GET ALL LIVES (admin)
export const getAllLive = async (req, res) => {
  try {
    const { classId, isActive } = req.query;
    const filter = {};

    if (classId) {
      if (!isValidObjectId(classId)) return res.status(400).json({ message: "Invalid classId" });
      filter.classId = classId;
    }

    if (typeof isActive !== "undefined") {
      filter.isActive = isActive === "true";
    }

    const lives = await Live.find(filter)
      .sort({ scheduledAt: -1 })
      .populate({
        path: "classId",
        select: "className gradeId subjectId teacherIds",
        populate: [
          { path: "gradeId", select: "grade subjects" },
          { path: "teacherIds", select: "name email" },
        ],
      })
      .lean();

    const formatted = lives.map(attachComputedFields);

    return res.status(200).json({ count: formatted.length, lives: formatted });
  } catch (err) {
    console.error("getAllLive error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ GET LIVE BY ID (admin)
export const getLiveById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid live id" });

    const live = await Live.findById(id)
      .populate({
        path: "classId",
        select: "className gradeId subjectId teacherIds",
        populate: [
          { path: "gradeId", select: "grade subjects" },
          { path: "teacherIds", select: "name email" },
        ],
      })
      .lean();

    if (!live) return res.status(404).json({ message: "Live not found" });

    return res.status(200).json({ live: attachComputedFields(live) });
  } catch (err) {
    console.error("getLiveById error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ UPDATE LIVE BY ID (admin)
export const updateLiveById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid live id" });

    const { title, scheduledAt, zoomLink, isActive, classId } = req.body;
    const update = {};

    if (typeof title === "string") update.title = title.trim();
    if (typeof zoomLink === "string") update.zoomLink = zoomLink.trim();
    if (typeof isActive === "boolean") update.isActive = isActive;

    if (scheduledAt) {
      const dt = new Date(scheduledAt);
      if (Number.isNaN(dt.getTime())) return res.status(400).json({ message: "scheduledAt must be valid" });
      update.scheduledAt = dt;
    }

    if (classId) {
      if (!isValidObjectId(classId)) return res.status(400).json({ message: "Invalid classId" });
      const foundClass = await ClassModel.findById(classId).select("_id");
      if (!foundClass) return res.status(404).json({ message: "Class not found" });
      update.classId = classId;
    }

    const live = await Live.findByIdAndUpdate(id, update, { new: true })
      .populate({
        path: "classId",
        select: "className gradeId subjectId teacherIds",
        populate: [
          { path: "gradeId", select: "grade subjects" },
          { path: "teacherIds", select: "name email" },
        ],
      })
      .lean();

    if (!live) return res.status(404).json({ message: "Live not found" });

    return res.status(200).json({ message: "Live updated", live: attachComputedFields(live) });
  } catch (err) {
    console.error("updateLiveById error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ DELETE LIVE BY ID (admin)
export const deleteLiveById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid live id" });

    const live = await Live.findByIdAndDelete(id);
    if (!live) return res.status(404).json({ message: "Live not found" });

    return res.status(200).json({ message: "Live deleted" });
  } catch (err) {
    console.error("deleteLiveById error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
