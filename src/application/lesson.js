import mongoose from "mongoose";
import Lesson from "../infastructure/schemas/lesson.js";
import ClassModel from "../infastructure/schemas/class.js";
import Enrollment from "../infastructure/schemas/enrollment.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const norm = (v) => String(v || "").trim();

const getClassDetails = async (classId) => {
  const cls = await ClassModel.findById(classId)
    .populate("gradeId", "grade subjects")
    .populate("teacherIds", "name email phonenumber isApproved role")
    .lean();

  if (!cls) return null;

  const gradeNo = cls.gradeId?.grade;
  const subjectName =
    (cls.gradeId?.subjects || []).find((s) => String(s._id) === String(cls.subjectId))
      ?.subject || "Unknown";

  const teacherNames = (cls.teacherIds || []).map((t) => t?.name).filter(Boolean);

  return {
    classId: cls._id,
    className: cls.className,
    grade: gradeNo,
    subject: subjectName,
    teachers: teacherNames,
  };
};

const canStudentViewClassLessons = async (studentId, classId) => {
  const ok = await Enrollment.findOne({
    studentId,
    classId,
    status: "approved",
    isActive: true,
  }).lean();

  return Boolean(ok);
};

// ✅ CREATE LESSON (admin only) - keep your existing
export const createLesson = async (req, res) => {
  try {
    const { classId, title, date, time, description = "", youtubeUrl = "" } = req.body;

    if (!classId || !title || !date || !time) {
      return res.status(400).json({ message: "classId, title, date, time are required" });
    }
    if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });

    const classDetails = await getClassDetails(classId);
    if (!classDetails) return res.status(404).json({ message: "Class not found" });

    const doc = await Lesson.create({
      classId,
      title: norm(title),
      date: norm(date),
      time: norm(time),
      description: norm(description),
      youtubeUrl: norm(youtubeUrl),
      createdBy: req.user?.id || null,
    });

    return res.status(201).json({
      message: "Lesson created",
      lesson: doc,
      classDetails,
    });
  } catch (err) {
    console.error("createLesson error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate lesson (same class + title + date + time)" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ GET ALL LESSONS (admin only)
// GET /api/lesson
// =======================================================
export const getAllLessons = async (req, res) => {
  try {
    const lessons = await Lesson.find().sort({ createdAt: -1 }).lean();

    const enriched = [];
    for (const l of lessons) {
      const classDetails = await getClassDetails(l.classId);
      enriched.push({ ...l, classDetails });
    }

    return res.status(200).json({ lessons: enriched });
  } catch (err) {
    console.error("getAllLessons error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ STUDENT/ADMIN: GET LESSONS BY CLASS
// GET /api/lesson/class/:classId
// - admin: always allowed
// - student: only if enrolled + approved
// =======================================================
export const getLessonsByClassId = async (req, res) => {
  try {
    const { classId } = req.params;
    if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });

    const classDetails = await getClassDetails(classId);
    if (!classDetails) return res.status(404).json({ message: "Class not found" });

    // ✅ student permission
    if (req.user?.role === "student") {
      const ok = await canStudentViewClassLessons(req.user.id, classId);
      if (!ok) return res.status(403).json({ message: "You are not enrolled or not approved for this class" });
    }

    const lessons = await Lesson.find({ classId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ lessons, classDetails });
  } catch (err) {
    console.error("getLessonsByClassId error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ GET LESSON BY ID (admin or enrolled student)
export const getLessonById = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!isValidId(lessonId)) return res.status(400).json({ message: "Invalid lessonId" });

    const lesson = await Lesson.findById(lessonId).lean();
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    const classDetails = await getClassDetails(lesson.classId);

    if (req.user?.role === "student") {
      const ok = await canStudentViewClassLessons(req.user.id, lesson.classId);
      if (!ok) return res.status(403).json({ message: "You are not enrolled or not approved for this class" });
    }

    return res.status(200).json({ lesson: { ...lesson, classDetails } });
  } catch (err) {
    console.error("getLessonById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ UPDATE LESSON (admin only) - keep your existing
export const updateLessonById = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!isValidId(lessonId)) return res.status(400).json({ message: "Invalid lessonId" });

    const doc = await Lesson.findById(lessonId);
    if (!doc) return res.status(404).json({ message: "Lesson not found" });

    const { classId, title, date, time, description, youtubeUrl, isActive } = req.body;

    if (classId !== undefined) {
      if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });
      const classDetails = await getClassDetails(classId);
      if (!classDetails) return res.status(404).json({ message: "Class not found" });
      doc.classId = classId;
    }

    if (title !== undefined) doc.title = norm(title);
    if (date !== undefined) doc.date = norm(date);
    if (time !== undefined) doc.time = norm(time);
    if (description !== undefined) doc.description = norm(description);
    if (youtubeUrl !== undefined) doc.youtubeUrl = norm(youtubeUrl);
    if (isActive !== undefined) doc.isActive = Boolean(isActive);

    await doc.save();

    const classDetails = await getClassDetails(doc.classId);

    return res.status(200).json({ message: "Lesson updated", lesson: doc, classDetails });
  } catch (err) {
    console.error("updateLessonById error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate lesson (same class + title + date + time)" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ DELETE LESSON (admin only) - keep your existing
export const deleteLessonById = async (req, res) => {
  try {
    const { lessonId } = req.params;
    if (!isValidId(lessonId)) return res.status(400).json({ message: "Invalid lessonId" });

    const deleted = await Lesson.findByIdAndDelete(lessonId);
    if (!deleted) return res.status(404).json({ message: "Lesson not found" });

    return res.status(200).json({ message: "Lesson deleted" });
  } catch (err) {
    console.error("deleteLessonById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
