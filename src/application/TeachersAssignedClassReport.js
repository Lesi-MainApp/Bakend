import TeacherAssignment from "../infastructure/schemas/teacherAssignment.js";
import ClassModel from "../infastructure/schemas/class.js";
import Grade from "../infastructure/schemas/grade.js";
import Enrollment from "../infastructure/schemas/enrollment.js";
import Lesson from "../infastructure/schemas/lesson.js";
import Live from "../infastructure/schemas/live.js";

const toId = (value) => String(value || "").trim();

const uniqueValues = (arr = []) => {
  return [...new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))];
};

const getSubjectNameFromGrade = (gradeDoc, subjectId) => {
  if (!gradeDoc || !subjectId) return "";

  const subjects = Array.isArray(gradeDoc.subjects) ? gradeDoc.subjects : [];
  const foundNormal = subjects.find((s) => toId(s?._id) === toId(subjectId));
  if (foundNormal?.subject) return String(foundNormal.subject).trim();

  const streams = Array.isArray(gradeDoc.streams) ? gradeDoc.streams : [];
  for (const stream of streams) {
    const streamSubjects = Array.isArray(stream?.subjects) ? stream.subjects : [];
    const foundStream = streamSubjects.find((s) => toId(s?._id) === toId(subjectId));
    if (foundStream?.subject) return String(foundStream.subject).trim();
  }

  return "";
};

const formatDateTime = (value) => {
  try {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${year}-${month}-${day} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  } catch (err) {
    console.error("formatDateTime error:", err);
    return "";
  }
};

export const getTeachersAssignedClassReport = async (req, res, next) => {
  try {
    const teacherId = toId(req.user?.id);

    if (!teacherId) {
      console.error("getTeachersAssignedClassReport error: Missing teacher id");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const teacherAssignment = await TeacherAssignment.findOne({ teacherId }).lean();

    if (!teacherAssignment) {
      console.error("getTeachersAssignedClassReport: No teacher assignment found");
      return res.status(200).json({
        message: "No teacher assignment found",
        total: 0,
        reports: [],
      });
    }

    const assignments = Array.isArray(teacherAssignment.assignments)
      ? teacherAssignment.assignments
      : [];

    const allowedGradeIds = uniqueValues(assignments.map((a) => a?.gradeId));
    const allowedSubjectIds = uniqueValues(assignments.flatMap((a) => a?.subjectIds || []));

    if (!allowedGradeIds.length || !allowedSubjectIds.length) {
      console.error("getTeachersAssignedClassReport: No assigned grade or subject found");
      return res.status(200).json({
        message: "No assigned grade or subject found",
        total: 0,
        reports: [],
      });
    }

    const classes = await ClassModel.find({
      teacherIds: teacherId,
      gradeId: { $in: allowedGradeIds },
      subjectId: { $in: allowedSubjectIds },
      isActive: true,
    }).lean();

    if (!classes.length) {
      return res.status(200).json({
        message: "No classes found for teacher",
        total: 0,
        reports: [],
      });
    }

    const classIds = classes.map((c) => c._id);

    const gradeDocs = await Grade.find({
      _id: { $in: uniqueValues(classes.map((c) => c?.gradeId)) },
    }).lean();

    const gradeMap = new Map(gradeDocs.map((g) => [toId(g._id), g]));

    const enrollments = await Enrollment.find({
      classId: { $in: classIds },
      status: "approved",
      isActive: true,
    })
      .select("_id classId")
      .lean();

    const lessons = await Lesson.find({
      classId: { $in: classIds },
      isActive: true,
    })
      .select("_id classId")
      .lean();

    const lives = await Live.find({
      classId: { $in: classIds },
      isActive: true,
    })
      .select("_id classId")
      .lean();

    const enrollCountMap = new Map();
    const lessonCountMap = new Map();
    const liveCountMap = new Map();

    for (const item of enrollments) {
      const key = toId(item.classId);
      enrollCountMap.set(key, Number(enrollCountMap.get(key) || 0) + 1);
    }

    for (const item of lessons) {
      const key = toId(item.classId);
      lessonCountMap.set(key, Number(lessonCountMap.get(key) || 0) + 1);
    }

    for (const item of lives) {
      const key = toId(item.classId);
      liveCountMap.set(key, Number(liveCountMap.get(key) || 0) + 1);
    }

    const rows = classes.map((classDoc) => {
      const gradeDoc = gradeMap.get(toId(classDoc.gradeId));
      const gradeNumber = Number(gradeDoc?.grade || 0);

      return {
        id: toId(classDoc._id),
        className: String(classDoc.className || "").trim(),
        grade: gradeNumber ? `Grade ${String(gradeNumber).padStart(2, "0")}` : "",
        subject: getSubjectNameFromGrade(gradeDoc, classDoc.subjectId),
        enrollStudentCount: Number(enrollCountMap.get(toId(classDoc._id)) || 0),
        createdDateTime: formatDateTime(classDoc.createdAt),
        lessonCount: Number(lessonCountMap.get(toId(classDoc._id)) || 0),
        liveClassCount: Number(liveCountMap.get(toId(classDoc._id)) || 0),
      };
    });

    return res.status(200).json({
      message: "Teachers assigned class report fetched successfully",
      total: rows.length,
      reports: rows,
    });
  } catch (err) {
    console.error("getTeachersAssignedClassReport error:", err);
    next(err);
  }
};