// src/application/student.js
import mongoose from "mongoose";
import User from "../infastructure/schemas/user.js";

let Enrollment = null;
let PaperAttempt = null;
let ClassModel = null;

try {
  Enrollment = (await import("../infastructure/schemas/enrollment.js")).default;
} catch (_) {}

try {
  PaperAttempt = (await import("../infastructure/schemas/paperAttempt.js")).default;
} catch (_) {}

try {
  ClassModel = (await import("../infastructure/schemas/class.js")).default;
} catch (_) {}

const asBoolStatus = (v) => {
  const s = String(v || "").toLowerCase().trim();
  if (!s) return null;
  if (s === "active") return true;
  if (s === "inactive") return false;
  return null;
};

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ✅ role safe match: allow role missing/null/"" and role student (any case)
const studentRoleMatch = {
  $or: [
    { role: { $regex: /^student$/i } },
    { role: { $exists: false } },
    { role: null },
    { role: "" },
  ],
};

// ✅ Build pipeline that ALWAYS returns students when no filters
export const buildStudentListPipeline = (query = {}) => {
  const {
    status = "",
    email = "",
    district = "",
    level = "",
    grade = "",
    classId = "",
    completedCount = "",
  } = query;

  const match = { ...studentRoleMatch };

  // status => isActive
  const isActive = asBoolStatus(status);
  if (isActive !== null) match.isActive = isActive;

  // email contains
  const emailQ = String(email || "").trim();
  if (emailQ) {
    match.email = {
      $regex: emailQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  // district exact
  const districtQ = String(district || "").trim();
  if (districtQ) match.district = districtQ;

  // level exact
  const levelQ = String(level || "").trim();
  if (levelQ) match.selectedLevel = levelQ;

  // grade exact (number)
  const gradeN = safeNum(grade);
  if (gradeN !== null) match.selectedGradeNumber = gradeN;

  const classObjId =
    classId && mongoose.Types.ObjectId.isValid(classId)
      ? new mongoose.Types.ObjectId(classId)
      : null;

  const completedN = safeNum(completedCount);

  const pipeline = [
    { $match: match },

    // ✅ Completed papers count (CORRECT):
    // Count DISTINCT submitted paperId values for this student.
    ...(PaperAttempt
      ? [
          {
            $lookup: {
              from: "paperattempts", // PaperAttempt -> paperattempts
              let: { sid: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$studentId", "$$sid"] },
                  },
                },
                { $match: { status: "submitted" } },
                { $group: { _id: "$paperId" } }, // distinct papers
                { $count: "count" },
              ],
              as: "completedAgg",
            },
          },
          {
            $addFields: {
              completedPapersCount: {
                $ifNull: [{ $arrayElemAt: ["$completedAgg.count", 0] }, 0],
              },
            },
          },
        ]
      : [{ $addFields: { completedPapersCount: 0 } }]),

    // ✅ Enrollment + className
    ...(Enrollment
      ? [
          {
            $lookup: {
              from: "enrollments",
              let: { sid: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$studentId", "$$sid"] },
                  },
                },
                // if you want only approved enrollments, keep this line:
                { $match: { status: "approved" } },
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
              ],
              as: "enrollAgg",
            },
          },
          {
            $addFields: {
              classId: { $arrayElemAt: ["$enrollAgg.classId", 0] },
            },
          },
        ]
      : [{ $addFields: { classId: null } }]),

    ...(ClassModel
      ? [
          {
            $lookup: {
              from: "classes",
              localField: "classId",
              foreignField: "_id",
              as: "classAgg",
            },
          },
          {
            $addFields: {
              className: { $ifNull: [{ $arrayElemAt: ["$classAgg.className", 0] }, ""] },
            },
          },
        ]
      : [{ $addFields: { className: "" } }]),

    // ✅ classId filter (after computed)
    ...(classObjId ? [{ $match: { classId: classObjId } }] : []),

    // ✅ completed count filter (after computed)
    ...(completedN !== null ? [{ $match: { completedPapersCount: completedN } }] : []),

    // cleanup
    {
      $project: {
        password: 0,
        completedAgg: 0,
        enrollAgg: 0,
        classAgg: 0,
      },
    },

    { $sort: { createdAt: -1 } },
  ];

  return pipeline;
};

export const listStudents = async (query = {}, { page = 1, limit = 20 } = {}) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (p - 1) * l;

  const base = buildStudentListPipeline(query);

  const [rows, countArr] = await Promise.all([
    User.aggregate([...base, { $skip: skip }, { $limit: l }]),
    User.aggregate([...base, { $count: "total" }]),
  ]);

  const total = countArr?.[0]?.total || 0;

  return { page: p, limit: l, total, rows };
};

export const getStudentById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const e = new Error("Invalid student id");
    e.name = "ValidationError";
    throw e;
  }

  const student = await User.findOne({ _id: id, ...studentRoleMatch })
    .select("-password")
    .lean();

  if (!student) {
    const e = new Error("Student not found");
    e.name = "NotFoundError";
    throw e;
  }
  return student;
};

export const updateStudentById = async (id, body = {}) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const e = new Error("Invalid student id");
    e.name = "ValidationError";
    throw e;
  }

  const allowed = [
    "name",
    "email",
    "phonenumber",
    "district",
    "town",
    "address",
    "selectedLanguage",
    "selectedLevel",
    "selectedGradeNumber",
    "selectedStream",
    "gradeSelectionLocked",
  ];

  const payload = {};
  for (const k of allowed) if (body[k] !== undefined) payload[k] = body[k];

  const updated = await User.findOneAndUpdate(
    { _id: id, ...studentRoleMatch },
    { $set: payload },
    { new: true, runValidators: true }
  )
    .select("-password")
    .lean();

  if (!updated) {
    const e = new Error("Student not found");
    e.name = "NotFoundError";
    throw e;
  }
  return updated;
};

export const setStudentBan = async (id, banned = true) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const e = new Error("Invalid student id");
    e.name = "ValidationError";
    throw e;
  }

  const updated = await User.findOneAndUpdate(
    { _id: id, ...studentRoleMatch },
    { $set: { isActive: banned ? false : true } },
    { new: true }
  )
    .select("-password")
    .lean();

  if (!updated) {
    const e = new Error("Student not found");
    e.name = "NotFoundError";
    throw e;
  }
  return updated;
};

export const deleteStudentHard = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const e = new Error("Invalid student id");
    e.name = "ValidationError";
    throw e;
  }

  const user = await User.findOne({ _id: id, ...studentRoleMatch }).lean();
  if (!user) {
    const e = new Error("Student not found");
    e.name = "NotFoundError";
    throw e;
  }

  if (Enrollment) await Enrollment.deleteMany({ studentId: id });
  if (PaperAttempt) await PaperAttempt.deleteMany({ studentId: id });

  await User.deleteOne({ _id: id });
  return { ok: true };
};

// ✅ dropdown data from backend
export const getStudentFilterOptions = async () => {
  // districts
  const districtsAgg = await User.aggregate([
    { $match: { ...studentRoleMatch, district: { $ne: "" } } },
    { $group: { _id: "$district" } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, district: "$_id" } },
  ]);

  const districts = (districtsAgg || []).map((x) => x.district).filter(Boolean);

  // levels and grades are stable enums
  const levels = ["primary", "secondary", "al"];
  const grades = Array.from({ length: 13 }, (_, i) => i + 1);

  // classes
  let classes = [];
  if (ClassModel) {
    const cls = await ClassModel.find({}).select("_id className").lean();
    classes = (cls || []).map((c) => ({ id: String(c._id), className: c.className }));
  }

  return { districts, levels, grades, classes };
};