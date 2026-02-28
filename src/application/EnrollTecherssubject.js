import User from "../infastructure/schemas/user.js";
import TeacherAssignment from "../infastructure/schemas/teacherAssignment.js";
import Enrollment from "../infastructure/schemas/enrollment.js";
import ClassModel from "../infastructure/schemas/class.js";
import Grade from "../infastructure/schemas/grade.js";

const toId = (value) => String(value || "").trim();

const uniqueValues = (arr = []) => {
  return [...new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))];
};

const getSubjectNameFromGrade = (gradeDoc, subjectId) => {
  if (!gradeDoc || !subjectId) return "";

  const normalSubjects = Array.isArray(gradeDoc.subjects) ? gradeDoc.subjects : [];
  const foundNormal = normalSubjects.find((s) => toId(s?._id) === toId(subjectId));
  if (foundNormal?.subject) return String(foundNormal.subject).trim();

  const streams = Array.isArray(gradeDoc.streams) ? gradeDoc.streams : [];
  for (const stream of streams) {
    const streamSubjects = Array.isArray(stream?.subjects) ? stream.subjects : [];
    const foundStream = streamSubjects.find((s) => toId(s?._id) === toId(subjectId));
    if (foundStream?.subject) return String(foundStream.subject).trim();
  }

  return "";
};

export const getTeacherEnrollSubjectStudents = async (req, res, next) => {
  try {
    const teacherId = toId(req.user?.id);

    if (!teacherId) {
      console.error("getTeacherEnrollSubjectStudents error: Missing teacher id");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      district = "",
      town = "",
      studentName = "",
      grade = "",
      subject = "",
    } = req.query;

    // 1) teacher assignment
    const teacherAssignment = await TeacherAssignment.findOne({ teacherId }).lean();

    if (!teacherAssignment) {
      console.error("getTeacherEnrollSubjectStudents: No teacher assignment found");
      return res.status(200).json({
        message: "No teacher assignment found",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          districts: [],
          towns: [],
        },
        students: [],
      });
    }

    const assignments = Array.isArray(teacherAssignment.assignments)
      ? teacherAssignment.assignments
      : [];

    const allowedGradeIds = uniqueValues(assignments.map((a) => a?.gradeId));
    const allowedSubjectIds = uniqueValues(assignments.flatMap((a) => a?.subjectIds || []));

    if (!allowedGradeIds.length || !allowedSubjectIds.length) {
      console.error("getTeacherEnrollSubjectStudents: No assigned grade/subject");
      return res.status(200).json({
        message: "No assigned grades or subjects",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          districts: [],
          towns: [],
        },
        students: [],
      });
    }

    // 2) only teacher classes for assigned grade + subject
    const teacherClasses = await ClassModel.find({
      teacherIds: teacherId,
      gradeId: { $in: allowedGradeIds },
      subjectId: { $in: allowedSubjectIds },
      isActive: true,
    }).lean();

    if (!teacherClasses.length) {
      console.error("getTeacherEnrollSubjectStudents: No classes for teacher");
      return res.status(200).json({
        message: "No classes found for teacher",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          districts: [],
          towns: [],
        },
        students: [],
      });
    }

    const classIds = teacherClasses.map((c) => c._id);

    // 3) approved active enrollments only
    const enrollments = await Enrollment.find({
      classId: { $in: classIds },
      status: "approved",
      isActive: true,
    }).lean();

    if (!enrollments.length) {
      return res.status(200).json({
        message: "No enrolled students found",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          districts: [],
          towns: [],
        },
        students: [],
      });
    }

    const studentIds = uniqueValues(enrollments.map((e) => e?.studentId));

    const students = await User.find({
      _id: { $in: studentIds },
      role: "student",
    })
      .select("name email district town address isActive")
      .lean();

    const studentMap = new Map(students.map((s) => [toId(s._id), s]));

    const gradeIds = uniqueValues(teacherClasses.map((c) => c?.gradeId));
    const gradeDocs = await Grade.find({ _id: { $in: gradeIds } }).lean();
    const gradeMap = new Map(gradeDocs.map((g) => [toId(g._id), g]));

    const classMap = new Map(teacherClasses.map((c) => [toId(c._id), c]));

    const rows = [];

    for (const enrollment of enrollments) {
      const classDoc = classMap.get(toId(enrollment.classId));
      if (!classDoc) continue;

      const studentDoc = studentMap.get(toId(enrollment.studentId));
      if (!studentDoc) continue;

      const gradeDoc = gradeMap.get(toId(classDoc.gradeId));
      if (!gradeDoc) continue;

      const gradeNumber = gradeDoc?.grade ? String(gradeDoc.grade) : "";
      const subjectName = getSubjectNameFromGrade(gradeDoc, classDoc.subjectId);

      rows.push({
        id: `${toId(enrollment._id)}-${toId(studentDoc._id)}-${toId(classDoc._id)}`,
        studentId: toId(studentDoc._id),
        studentName: String(studentDoc.name || "").trim(),
        email: String(studentDoc.email || "").trim(),
        district: String(studentDoc.district || "").trim(),
        town: String(studentDoc.town || "").trim(),
        address: String(studentDoc.address || "").trim(),
        grade: gradeNumber,
        subject: subjectName,
      });
    }

    let filteredRows = [...rows];

    if (district) {
      filteredRows = filteredRows.filter(
        (r) => String(r.district).toLowerCase() === String(district).toLowerCase()
      );
    }

    if (town) {
      filteredRows = filteredRows.filter(
        (r) => String(r.town).toLowerCase() === String(town).toLowerCase()
      );
    }

    if (grade) {
      filteredRows = filteredRows.filter(
        (r) => String(r.grade).toLowerCase() === String(grade).toLowerCase()
      );
    }

    if (subject) {
      filteredRows = filteredRows.filter(
        (r) => String(r.subject).toLowerCase() === String(subject).toLowerCase()
      );
    }

    if (studentName) {
      const keyword = String(studentName).trim().toLowerCase();
      filteredRows = filteredRows.filter((r) =>
        String(r.studentName).toLowerCase().includes(keyword)
      );
    }

    const filterGrades = uniqueValues(rows.map((r) => r.grade)).sort(
      (a, b) => Number(a) - Number(b)
    );
    const filterSubjects = uniqueValues(rows.map((r) => r.subject)).sort((a, b) =>
      a.localeCompare(b)
    );
    const filterDistricts = uniqueValues(rows.map((r) => r.district)).sort((a, b) =>
      a.localeCompare(b)
    );
    const filterTowns = uniqueValues(rows.map((r) => r.town)).sort((a, b) =>
      a.localeCompare(b)
    );

    return res.status(200).json({
      message: "Teacher enrolled students fetched successfully",
      total: filteredRows.length,
      filters: {
        grades: filterGrades,
        subjects: filterSubjects,
        districts: filterDistricts,
        towns: filterTowns,
      },
      students: filteredRows,
    });
  } catch (err) {
    console.error("getTeacherEnrollSubjectStudents error:", err);
    next(err);
  }
};