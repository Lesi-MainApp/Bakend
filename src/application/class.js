// backend/application/class.js
import mongoose from "mongoose";
import ClassModel from "../infastructure/schemas/class.js";
import Grade from "../infastructure/schemas/grade.js";
import User from "../infastructure/schemas/user.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const norm = (v) => String(v || "").trim();
const is1to11 = (g) => g >= 1 && g <= 11;

const validateTeachers = async (teacherIds) => {
  if (!Array.isArray(teacherIds)) {
    return { ok: false, code: 400, message: "teacherIds must be an array" };
  }

  // ✅ REQUIRED: at least 1 teacher
  if (teacherIds.length === 0) {
    return { ok: false, code: 400, message: "Please select at least one teacher" };
  }

  for (const tid of teacherIds) {
    if (!isValidId(tid)) {
      return { ok: false, code: 400, message: `Invalid teacherId: ${tid}` };
    }

    const t = await User.findById(tid).lean();
    if (!t || t.role !== "teacher") {
      return { ok: false, code: 404, message: `Teacher not found: ${tid}` };
    }
    if (!t.isApproved) {
      return { ok: false, code: 403, message: `Teacher must be approved: ${tid}` };
    }
  }

  return { ok: true };
};

const validateGradeAndSubject = async ({ gradeId, subjectId }) => {
  const grade = await Grade.findById(gradeId).lean();
  if (!grade) return { ok: false, code: 404, message: "Grade not found" };

  // ✅ Only 1-11 allowed
  if (!is1to11(grade.grade)) {
    return { ok: false, code: 400, message: "Class is only allowed for grades 1-11" };
  }

  // ✅ subject must belong to grade.subjects[]
  const validSubjectIds = new Set((grade.subjects || []).map((s) => String(s._id)));
  if (!validSubjectIds.has(String(subjectId))) {
    return { ok: false, code: 400, message: "subjectId does not belong to this grade" };
  }

  return { ok: true, grade };
};

// =======================================================
// CREATE CLASS
// POST /api/class
// Body: { className, gradeId, subjectId, teacherIds[] }
// =======================================================
export const createClass = async (req, res) => {
  try {
    const { className, gradeId, subjectId, teacherIds = [] } = req.body;

    if (!className || !gradeId || !subjectId) {
      return res.status(400).json({ message: "className, gradeId, subjectId are required" });
    }

    if (!isValidId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidId(subjectId)) return res.status(400).json({ message: "Invalid subjectId" });

    const rel = await validateGradeAndSubject({ gradeId, subjectId });
    if (!rel.ok) return res.status(rel.code).json({ message: rel.message });

    const tchk = await validateTeachers(teacherIds);
    if (!tchk.ok) return res.status(tchk.code).json({ message: tchk.message });

    const doc = await ClassModel.create({
      className: norm(className),
      gradeId,
      subjectId,
      teacherIds,
      createdBy: req.user?.id || null,
    });

    return res.status(201).json({ message: "Class created", class: doc });
  } catch (err) {
    console.error("createClass error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate class (same className + grade + subject)" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// GET ALL CLASSES (ONLY grade 1-11)
// GET /api/class
// =======================================================
export const getAllClass = async (req, res) => {
  try {
    const list = await ClassModel.find()
      .populate("gradeId", "grade subjects")
      .populate("teacherIds", "name email phonenumber isApproved role")
      .sort({ createdAt: -1 })
      .lean();

    // ✅ filter to grade 1-11 only
    const filtered = list.filter((c) => is1to11(Number(c?.gradeId?.grade)));

    const classes = filtered.map((c) => {
      const grade = c.gradeId;
      const subjectName =
        (grade?.subjects || []).find((s) => String(s._id) === String(c.subjectId))
          ?.subject || "Unknown";

      return {
        ...c,
        subjectName,
        gradeNo: grade?.grade,
      };
    });

    return res.status(200).json({ classes });
  } catch (err) {
    console.error("getAllClass error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// GET CLASS BY ID
// GET /api/class/:classId
// =======================================================
export const getClassById = async (req, res) => {
  try {
    const { classId } = req.params;
    if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });

    const doc = await ClassModel.findById(classId)
      .populate("gradeId", "grade subjects")
      .populate("teacherIds", "name email phonenumber isApproved role")
      .lean();

    if (!doc) return res.status(404).json({ message: "Class not found" });

    // ✅ If class belongs to grade 12/13, block returning (optional safety)
    if (!is1to11(Number(doc?.gradeId?.grade))) {
      return res.status(400).json({ message: "This class is not allowed (only grades 1-11)" });
    }

    const subjectName =
      (doc.gradeId?.subjects || []).find((s) => String(s._id) === String(doc.subjectId))
        ?.subject || "Unknown";

    return res.status(200).json({
      class: {
        ...doc,
        subjectName,
        gradeNo: doc.gradeId?.grade,
      },
    });
  } catch (err) {
    console.error("getClassById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// UPDATE CLASS BY ID
// PATCH /api/class/:classId
// Body: { className?, gradeId?, subjectId?, teacherIds?, isActive? }
// =======================================================
export const updateClassById = async (req, res) => {
  try {
    const { classId } = req.params;
    if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });

    const doc = await ClassModel.findById(classId);
    if (!doc) return res.status(404).json({ message: "Class not found" });

    const { className, gradeId, subjectId, teacherIds, isActive } = req.body;

    const newGradeId = gradeId !== undefined ? gradeId : doc.gradeId;
    const newSubjectId = subjectId !== undefined ? subjectId : doc.subjectId;

    if (gradeId !== undefined && !isValidId(newGradeId)) {
      return res.status(400).json({ message: "Invalid gradeId" });
    }
    if (subjectId !== undefined && !isValidId(newSubjectId)) {
      return res.status(400).json({ message: "Invalid subjectId" });
    }

    if (gradeId !== undefined || subjectId !== undefined) {
      const rel = await validateGradeAndSubject({ gradeId: newGradeId, subjectId: newSubjectId });
      if (!rel.ok) return res.status(rel.code).json({ message: rel.message });
    }

    if (teacherIds !== undefined) {
      const tchk = await validateTeachers(teacherIds);
      if (!tchk.ok) return res.status(tchk.code).json({ message: tchk.message });
      doc.teacherIds = teacherIds;
    }

    if (className !== undefined) doc.className = norm(className);
    if (gradeId !== undefined) doc.gradeId = newGradeId;
    if (subjectId !== undefined) doc.subjectId = newSubjectId;
    if (isActive !== undefined) doc.isActive = Boolean(isActive);

    await doc.save();
    return res.status(200).json({ message: "Class updated", class: doc });
  } catch (err) {
    console.error("updateClassById error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate class (same className + grade + subject)" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// DELETE CLASS BY ID
// DELETE /api/class/:classId
// =======================================================
export const deleteClassById = async (req, res) => {
  try {
    const { classId } = req.params;
    if (!isValidId(classId)) return res.status(400).json({ message: "Invalid classId" });

    const deleted = await ClassModel.findByIdAndDelete(classId);
    if (!deleted) return res.status(404).json({ message: "Class not found" });

    return res.status(200).json({ message: "Class deleted" });
  } catch (err) {
    console.error("deleteClassById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ PUBLIC (Student App)
// GET /api/class/public?gradeNumber=4&subjectName=Maths
export const getClassesPublic = async (req, res) => {
  try {
    const gradeNumber = Number(req.query.gradeNumber);
    const subjectName = String(req.query.subjectName || "").trim();

    if (!gradeNumber || gradeNumber < 1 || gradeNumber > 11) {
      return res.status(400).json({ message: "gradeNumber must be 1-11" });
    }
    if (!subjectName) {
      return res.status(400).json({ message: "subjectName is required" });
    }

    // ✅ find grade doc
    const gradeDoc = await Grade.findOne({ grade: gradeNumber, isActive: true }).lean();
    if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

    // ✅ find subjectId by subjectName (case insensitive)
    const subjectObj = (gradeDoc.subjects || []).find(
      (s) => String(s?.subject || "").toLowerCase() === subjectName.toLowerCase()
    );
    if (!subjectObj) {
      return res.status(404).json({ message: "Subject not found in this grade" });
    }

    // ✅ classes for gradeId + subjectId (active only)
    const list = await ClassModel.find({
      gradeId: gradeDoc._id,
      subjectId: subjectObj._id,
      isActive: true,
    })
      .populate("teacherIds", "name email phonenumber isApproved role")
      .sort({ createdAt: -1 })
      .lean();

    // ✅ response shape for mobile
    const classes = list.map((c) => ({
      _id: c._id,
      className: c.className,
      gradeNumber,
      subjectName: subjectObj.subject,
      teacherCount: Array.isArray(c.teacherIds) ? c.teacherIds.length : 0,
      teachers: (c.teacherIds || []).map((t) => ({
        _id: t._id,
        name: t.name,
      })),
      createdAt: c.createdAt,
    }));

    return res.status(200).json({ classes });
  } catch (err) {
    console.error("getClassesPublic error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
