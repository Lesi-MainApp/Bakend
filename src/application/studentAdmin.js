import User, { DISTRICT_ENUMS } from "../infastructure/schemas/user.js";
import Grade from "../infastructure/schemas/grade.js";
import ClassModel from "../infastructure/schemas/class.js";
import Enrollment from "../infastructure/schemas/enrollment.js";

const toId = (value) => String(value || "").trim();

const uniqueValues = (arr = []) => {
  return [...new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))];
};

const getStatusFromProgressDate = (progressUpdatedAt) => {
  if (!progressUpdatedAt) return "inactive";

  const last = new Date(progressUpdatedAt);
  if (Number.isNaN(last.getTime())) return "inactive";

  const now = Date.now();
  const diffMs = now - last.getTime();
  const days30 = 30 * 24 * 60 * 60 * 1000;

  return diffMs <= days30 ? "active" : "inactive";
};

export const getStudentOptions = async (req, res, next) => {
  try {
    const gradeDocs = await Grade.find({ isActive: true })
      .select("grade")
      .sort({ grade: 1 })
      .lean();

    const classDocs = await ClassModel.find({ isActive: true })
      .select("_id className")
      .sort({ className: 1 })
      .lean();

    return res.status(200).json({
      districts: DISTRICT_ENUMS,
      levels: ["primary", "secondary", "al"],
      grades: gradeDocs.map((g) => Number(g.grade)).filter(Boolean),
      classes: classDocs.map((c) => ({
        id: toId(c._id),
        className: String(c.className || "").trim(),
      })),
    });
  } catch (err) {
    console.error("getStudentOptions error:", err);
    next(err);
  }
};

export const getStudents = async (req, res, next) => {
  try {
    const {
      status = "",
      email = "",
      district = "",
      level = "",
      grade = "",
      classId = "",
      page = "1",
      limit = "20",
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (pageNumber - 1) * limitNumber;

    const userQuery = {
      role: "student",
    };

    if (email) {
      userQuery.email = { $regex: String(email).trim(), $options: "i" };
    }

    if (district) {
      userQuery.district = String(district).trim();
    }

    if (level) {
      userQuery.selectedLevel = String(level).trim();
    }

    if (grade) {
      userQuery.selectedGradeNumber = Number(grade);
    }

    const students = await User.find(userQuery)
      .select(
        "name email district town address selectedLevel selectedGradeNumber progressUpdatedAt isActive"
      )
      .sort({ createdAt: -1 })
      .lean();

    if (!students.length) {
      return res.status(200).json({
        total: 0,
        page: pageNumber,
        limit: limitNumber,
        rows: [],
      });
    }

    const studentIds = students.map((s) => s._id);

    const enrollments = await Enrollment.find({
      studentId: { $in: studentIds },
      status: "approved",
      isActive: true,
    })
      .select("studentId classId")
      .lean();

    const enrolledClassIds = uniqueValues(enrollments.map((e) => e.classId));

    const classDocs = enrolledClassIds.length
      ? await ClassModel.find({
          _id: { $in: enrolledClassIds },
          isActive: true,
        })
          .select("_id className")
          .lean()
      : [];

    const classMap = new Map(
      classDocs.map((c) => [toId(c._id), String(c.className || "").trim()])
    );

    const classNamesByStudentId = new Map();

    for (const enrollment of enrollments) {
      const studentKey = toId(enrollment.studentId);
      const className = classMap.get(toId(enrollment.classId));
      if (!className) continue;

      if (!classNamesByStudentId.has(studentKey)) {
        classNamesByStudentId.set(studentKey, []);
      }

      classNamesByStudentId.get(studentKey).push(className);
    }

    let rows = students.map((student) => {
      const statusKey = getStatusFromProgressDate(student.progressUpdatedAt);
      const classNames = uniqueValues(classNamesByStudentId.get(toId(student._id)) || []);

      return {
        _id: toId(student._id),
        name: String(student.name || "").trim(),
        email: String(student.email || "").trim(),
        district: String(student.district || "").trim(),
        town: String(student.town || "").trim(),
        address: String(student.address || "").trim(),
        selectedLevel: String(student.selectedLevel || "").trim(),
        selectedGradeNumber: Number(student.selectedGradeNumber || 0) || null,
        classNames,
        statusKey,
        isActive: Boolean(student.isActive),
      };
    });

    if (status) {
      const wanted = String(status).trim().toLowerCase();
      rows = rows.filter((row) => String(row.statusKey).toLowerCase() === wanted);
    }

    if (classId) {
      const targetClass = await ClassModel.findById(classId).select("className").lean();
      const className = String(targetClass?.className || "").trim();

      if (!className) {
        rows = [];
      } else {
        rows = rows.filter((row) => row.classNames.includes(className));
      }
    }

    const total = rows.length;
    const pagedRows = rows.slice(skip, skip + limitNumber);

    return res.status(200).json({
      total,
      page: pageNumber,
      limit: limitNumber,
      rows: pagedRows,
    });
  } catch (err) {
    console.error("getStudents error:", err);
    next(err);
  }
};

export const banStudent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await User.findOneAndUpdate(
      { _id: id, role: "student" },
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.status(200).json({
      message: "Student banned successfully",
      id: toId(student._id),
      isActive: false,
    });
  } catch (err) {
    console.error("banStudent error:", err);
    next(err);
  }
};

export const unbanStudent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await User.findOneAndUpdate(
      { _id: id, role: "student" },
      { $set: { isActive: true } },
      { new: true }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.status(200).json({
      message: "Student unbanned successfully",
      id: toId(student._id),
      isActive: true,
    });
  } catch (err) {
    console.error("unbanStudent error:", err);
    next(err);
  }
};