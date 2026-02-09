// backend/application/teacherAssignment.js
import mongoose from "mongoose";
import User from "../infastructure/schemas/user.js";
import Grade from "../infastructure/schemas/grade.js";
import TeacherAssignment from "../infastructure/schemas/teacherAssignment.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const str = (v) => String(v || "");
const is12or13 = (g) => g === 12 || g === 13;
const is1to11 = (g) => g >= 1 && g <= 11;

const safeTeacher = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  whatsapp: u.phonenumber,
  role: u.role,
  isVerified: u.isVerified,
  isApproved: u.isApproved,
  approvedAt: u.approvedAt,
  approvedBy: u.approvedBy,
  isActive: u.isActive, // ✅ add
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  password: null,
});

// ✅ Merge by gradeId + streamId, union subjectIds
const mergeAssignments = (assignments = []) => {
  const map = new Map();

  for (const a of assignments) {
    const gradeId = a?.gradeId ? String(a.gradeId) : "";
    const streamId = a?.streamId ? String(a.streamId) : "null";
    const key = `${gradeId}__${streamId}`;

    if (!map.has(key)) {
      map.set(key, {
        gradeId: a.gradeId,
        streamId: a.streamId || null,
        subjectIds: [],
      });
    }

    const cur = map.get(key);
    const curSet = new Set((cur.subjectIds || []).map((x) => String(x)));
    const incoming = Array.isArray(a.subjectIds) ? a.subjectIds : [];

    for (const sid of incoming) curSet.add(String(sid));
    cur.subjectIds = Array.from(curSet);

    map.set(key, cur);
  }

  return Array.from(map.values()).map((x) => ({
    gradeId: x.gradeId,
    streamId: x.streamId || null,
    subjectIds: x.subjectIds,
  }));
};

const validateAssignments = async (assignments = []) => {
  for (const a of assignments) {
    if (!a.gradeId || !Array.isArray(a.subjectIds) || a.subjectIds.length === 0) {
      return { ok: false, message: "Each assignment must have gradeId and subjectIds[]" };
    }
    if (!isValidId(a.gradeId)) return { ok: false, message: `Invalid gradeId: ${a.gradeId}` };

    const grade = await Grade.findById(a.gradeId).lean();
    if (!grade) return { ok: false, message: `Grade not found: ${a.gradeId}` };

    // Grade 1-11
    if (is1to11(grade.grade)) {
      if (a.streamId) return { ok: false, message: `Grade ${grade.grade} must not use streamId` };

      const validSubjectIds = new Set((grade.subjects || []).map((s) => String(s._id)));
      for (const sid of a.subjectIds) {
        if (!isValidId(sid)) return { ok: false, message: `Invalid subjectId: ${sid}` };
        if (!validSubjectIds.has(String(sid))) {
          return { ok: false, message: `SubjectId ${sid} does not belong to grade ${grade.grade}` };
        }
      }
    }

    // Grade 12-13
    if (is12or13(grade.grade)) {
      if (!a.streamId) return { ok: false, message: `Grade ${grade.grade} requires streamId` };
      if (!isValidId(a.streamId)) return { ok: false, message: `Invalid streamId: ${a.streamId}` };

      const st = (grade.streams || []).find((x) => String(x._id) === String(a.streamId));
      if (!st) {
        return { ok: false, message: `StreamId ${a.streamId} does not belong to grade ${grade.grade}` };
      }

      const validStreamSubjectIds = new Set((st.subjects || []).map((s) => String(s._id)));
      for (const sid of a.subjectIds) {
        if (!isValidId(sid)) return { ok: false, message: `Invalid subjectId: ${sid}` };
        if (!validStreamSubjectIds.has(String(sid))) {
          return { ok: false, message: `SubjectId ${sid} does not belong to stream ${st.stream}` };
        }
      }
    }
  }

  return { ok: true };
};

const buildReadableAssignments = async (assignmentDoc) => {
  if (!assignmentDoc?.assignments?.length) return [];

  const merged = mergeAssignments(assignmentDoc.assignments);

  const readable = [];
  for (const a of merged) {
    const grade = await Grade.findById(a.gradeId).lean();
    if (!grade) continue;

    // Grade 1-11
    if (is1to11(grade.grade)) {
      const map = new Map((grade.subjects || []).map((s) => [String(s._id), s.subject]));

      readable.push({
        gradeId: grade._id,
        grade: grade.grade,
        streamId: null,
        stream: null,
        subjects: (a.subjectIds || []).map((sid) => ({
          _id: sid,
          subject: map.get(String(sid)) || "Unknown",
        })),
      });
      continue;
    }

    // Grade 12-13
    if (is12or13(grade.grade)) {
      const st = (grade.streams || []).find((x) => String(x._id) === String(a.streamId));
      const map = new Map((st?.subjects || []).map((s) => [String(s._id), s.subject]));

      readable.push({
        gradeId: grade._id,
        grade: grade.grade,
        streamId: a.streamId,
        stream: st?.stream || "Unknown Stream",
        subjects: (a.subjectIds || []).map((sid) => ({
          _id: sid,
          subject: map.get(String(sid)) || "Unknown",
        })),
      });
    }
  }

  readable.sort((x, y) => {
    const g = (x.grade || 0) - (y.grade || 0);
    if (g !== 0) return g;
    return String(x.stream || "").localeCompare(String(y.stream || ""));
  });

  return readable;
};

// =======================================================
// 1) GET TEACHERS LIST
// =======================================================
export const getAllTeachers = async (req, res) => {
  try {
    const { status = "all" } = req.query;

    const filter = { role: "teacher" };
    if (status === "pending") filter.isApproved = false;
    if (status === "approved") filter.isApproved = true;

    const teachers = await User.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ teachers: teachers.map(safeTeacher) });
  } catch (err) {
    console.error("getAllTeachers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// 2) GET TEACHER BY ID
// =======================================================
export const getTeacherById = async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });

    const assignment = await TeacherAssignment.findOne({ teacherId }).lean();
    const readableAssignments = await buildReadableAssignments(assignment);

    return res.status(200).json({
      teacher: safeTeacher(teacher),
      assignment: assignment || null,
      readableAssignments,
    });
  } catch (err) {
    console.error("getTeacherById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// 3) UPDATE TEACHER BY ID
// =======================================================
export const updateTeacherById = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { name, email, whatsapp, isApproved } = req.body || {};

    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });

    if (name !== undefined) teacher.name = str(name).trim();
    if (email !== undefined) teacher.email = str(email).trim().toLowerCase();
    if (whatsapp !== undefined) teacher.phonenumber = str(whatsapp).trim();

    if (isApproved !== undefined) {
      teacher.isApproved = Boolean(isApproved);
      teacher.approvedAt = teacher.isApproved ? new Date() : null;
      teacher.approvedBy = teacher.isApproved ? (req.user?.id || null) : null;
    }

    await teacher.save();
    return res.status(200).json({ message: "Teacher updated", teacher: safeTeacher(teacher) });
  } catch (err) {
    console.error("updateTeacherById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// 4) DELETE TEACHER BY ID  (KEEP FILE, BUT YOU WILL REMOVE ROUTE/BTN)
// =======================================================
export const deleteTeacherById = async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });

    await TeacherAssignment.deleteOne({ teacherId });
    await User.findByIdAndDelete(teacherId);

    return res.status(200).json({ message: "Teacher deleted (and assignments removed)" });
  } catch (err) {
    console.error("deleteTeacherById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// 5) APPROVE TEACHER
// =======================================================
export const approveTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { isApproved } = req.body || {};

    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });
    if (isApproved === undefined) {
      return res.status(400).json({
        message: "isApproved is required",
        example: { isApproved: true },
      });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });

    teacher.isApproved = Boolean(isApproved);
    teacher.approvedAt = teacher.isApproved ? new Date() : null;
    teacher.approvedBy = teacher.isApproved ? (req.user?.id || null) : null;

    await teacher.save();
    return res.status(200).json({ message: "Teacher approval updated", teacher: safeTeacher(teacher) });
  } catch (err) {
    console.error("approveTeacher error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// 6) FORM DATA
// =======================================================
export const getTeacherAssignFormData = async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });

    const availableGrades = await Grade.find({ isActive: true })
      .select("grade subjects streams isActive")
      .sort({ grade: 1 })
      .lean();

    const assignment = await TeacherAssignment.findOne({ teacherId }).lean();
    const readableAssignments = await buildReadableAssignments(assignment);

    return res.status(200).json({
      teacher: safeTeacher(teacher),
      availableGrades,
      assignment: assignment || null,
      readableAssignments,
    });
  } catch (err) {
    console.error("getTeacherAssignFormData error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// 7) CREATE/UPDATE ASSIGNMENTS (APPEND + MERGE)  ✅ KEEP
// =======================================================
export const createAssignTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { assignments } = req.body || {};

    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ message: "assignments array is required" });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });
    if (!teacher.isApproved) return res.status(403).json({ message: "Teacher must be approved before assigning" });

    const check = await validateAssignments(assignments);
    if (!check.ok) return res.status(400).json({ message: check.message });

    const existing = await TeacherAssignment.findOne({ teacherId }).lean();
    const existingAssignments = existing?.assignments || [];

    const combined = [...existingAssignments, ...assignments];
    const mergedAssignments = mergeAssignments(combined);

    const saved = await TeacherAssignment.findOneAndUpdate(
      { teacherId },
      { teacherId, assignments: mergedAssignments, assignedBy: req.user?.id || null },
      { new: true, upsert: true }
    ).lean();

    const readableAssignments = await buildReadableAssignments(saved);

    return res.status(200).json({
      message: "Teacher assignment saved",
      teacher: safeTeacher(teacher),
      assignment: saved,
      readableAssignments,
    });
  } catch (err) {
    console.error("createAssignTeacher error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ 8) REPLACE ASSIGNMENTS (FOR EDIT)
// This will REMOVE old subjects/grades and set only new ones
// =======================================================
export const replaceTeacherAssignments = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { assignments } = req.body || {};

    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });
    if (!Array.isArray(assignments)) {
      return res.status(400).json({ message: "assignments array is required" });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });
    if (!teacher.isApproved) return res.status(403).json({ message: "Teacher must be approved before assigning" });

    // allow empty => clears assignments
    if (assignments.length > 0) {
      const check = await validateAssignments(assignments);
      if (!check.ok) return res.status(400).json({ message: check.message });
    }

    const mergedAssignments = mergeAssignments(assignments);

    const saved = await TeacherAssignment.findOneAndUpdate(
      { teacherId },
      { teacherId, assignments: mergedAssignments, assignedBy: req.user?.id || null },
      { new: true, upsert: true }
    ).lean();

    const readableAssignments = await buildReadableAssignments(saved);

    return res.status(200).json({
      message: "Teacher assignments replaced",
      teacher: safeTeacher(teacher),
      assignment: saved,
      readableAssignments,
    });
  } catch (err) {
    console.error("replaceTeacherAssignments error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ 9) DISABLE TEACHER ACCESS (NO DELETE)
// =======================================================
export const disableTeacherAccess = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { isActive } = req.body || {};

    if (!isValidId(teacherId)) return res.status(400).json({ message: "Invalid teacherId" });
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean", example: { isActive: false } });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") return res.status(404).json({ message: "Teacher not found" });

    teacher.isActive = isActive;
    await teacher.save();

    return res.status(200).json({ message: "Teacher access updated", teacher: safeTeacher(teacher) });
  } catch (err) {
    console.error("disableTeacherAccess error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
