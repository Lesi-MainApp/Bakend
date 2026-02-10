import mongoose from "mongoose";
import Enrollment from "../infastructure/schemas/enrollment.js";
import User from "../infastructure/schemas/user.js";
import ClassModel from "../infastructure/schemas/class.js";
import Grade from "../infastructure/schemas/grade.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const classReadableDetails = async (classId) => {
  const cls = await ClassModel.findById(classId)
    .populate("gradeId", "grade subjects")
    .populate("teacherIds", "name email phonenumber isApproved role")
    .lean();

  if (!cls) return null;

  const gradeNo = cls.gradeId?.grade;

  const subjectName =
    (cls.gradeId?.subjects || []).find((s) => String(s._id) === String(cls.subjectId))
      ?.subject || "Unknown";

  const teachers = (cls.teacherIds || [])
    .map((t) => t?.name)
    .filter(Boolean);

  return {
    classId: cls._id,
    className: cls.className,
    grade: gradeNo,
    subject: subjectName,
    teachers,
  };
};

// =======================================================
// STUDENT: REQUEST ENROLL
// POST /api/enroll/request
// Body: { classId, studentName, studentPhone }
// =======================================================
export const requestEnroll = async (req, res) => {
  try {
    const { classId, studentName, studentPhone } = req.body || {};

    if (!classId) return res.status(400).json({ message: "classId is required" });
    if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") {
      return res.status(403).json({ message: "Only students can request enrollment" });
    }

    const cls = await ClassModel.findById(classId).lean();
    if (!cls) return res.status(404).json({ message: "Class not found" });

    const grade = await Grade.findById(cls.gradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found for this class" });

    if (!(Number(grade.grade) >= 1 && Number(grade.grade) <= 11)) {
      return res.status(400).json({ message: "Enrollment allowed only for classes in grades 1-11" });
    }

    // ✅ take from modal first, fallback to user profile
    const snapName = String(studentName || student.name || "").trim();
    const snapPhone = String(studentPhone || student.phonenumber || "").trim();

    if (!snapName) return res.status(400).json({ message: "studentName is required" });
    if (!snapPhone) return res.status(400).json({ message: "studentPhone is required" });

    let doc;
    try {
      doc = await Enrollment.create({
        studentId: student._id,
        classId,
        studentName: snapName,
        studentPhone: snapPhone,
        status: "pending",
      });
    } catch (err) {
      if (err.code === 11000) {
        const exist = await Enrollment.findOne({ studentId: student._id, classId }).lean();
        const classDetails = await classReadableDetails(classId);

        return res.status(200).json({
          message: "Request already exists",
          request: exist,
          classDetails,
        });
      }
      throw err;
    }

    const classDetails = await classReadableDetails(classId);

    return res.status(201).json({
      message: "Enrollment request sent",
      request: doc,
      classDetails,
    });
  } catch (err) {
    console.error("requestEnroll error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// STUDENT: MY REQUESTS
// GET /api/enroll/my
// =======================================================
export const getMyEnrollRequests = async (req, res) => {
  try {
    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") {
      return res.status(403).json({ message: "Only students can view this" });
    }

    const list = await Enrollment.find({ studentId: student._id })
      .sort({ createdAt: -1 })
      .lean();

    const enriched = [];
    for (const r of list) {
      const classDetails = await classReadableDetails(r.classId);
      enriched.push({ ...r, classDetails });
    }

    return res.status(200).json({ requests: enriched });
  } catch (err) {
    console.error("getMyEnrollRequests error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ADMIN: GET PENDING REQUESTS
// GET /api/enroll/pending
// =======================================================
export const getPendingEnrollRequests = async (req, res) => {
  try {
    const list = await Enrollment.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .lean();

    const enriched = [];
    for (const r of list) {
      const classDetails = await classReadableDetails(r.classId);

      // ✅ student email
      const stu = await User.findById(r.studentId).select("email").lean();

      enriched.push({
        ...r,
        studentEmail: stu?.email || "",
        classDetails,
      });
    }

    return res.status(200).json({ requests: enriched });
  } catch (err) {
    console.error("getPendingEnrollRequests error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ADMIN: APPROVE REQUEST
// PATCH /api/enroll/approve/:enrollId
// =======================================================
export const approveEnrollRequest = async (req, res) => {
  try {
    const { enrollId } = req.params;
    if (!isValidId(enrollId)) return res.status(400).json({ message: "Invalid enrollId" });

    const doc = await Enrollment.findById(enrollId);
    if (!doc) return res.status(404).json({ message: "Request not found" });

    doc.status = "approved";
    doc.approvedAt = new Date();
    doc.approvedBy = req.user?.id || null;

    await doc.save();

    const classDetails = await classReadableDetails(doc.classId);
    return res.status(200).json({ message: "Enrollment approved", request: doc, classDetails });
  } catch (err) {
    console.error("approveEnrollRequest error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ADMIN: REJECT REQUEST
// PATCH /api/enroll/reject/:enrollId
// =======================================================
export const rejectEnrollRequest = async (req, res) => {
  try {
    const { enrollId } = req.params;
    if (!isValidId(enrollId)) return res.status(400).json({ message: "Invalid enrollId" });

    const doc = await Enrollment.findById(enrollId);
    if (!doc) return res.status(404).json({ message: "Request not found" });

    doc.status = "rejected";
    doc.approvedAt = null;
    doc.approvedBy = req.user?.id || null;

    await doc.save();

    const classDetails = await classReadableDetails(doc.classId);
    return res.status(200).json({ message: "Enrollment rejected", request: doc, classDetails });
  } catch (err) {
    console.error("rejectEnrollRequest error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
