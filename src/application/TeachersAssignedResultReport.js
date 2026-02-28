import TeacherAssignment from "../infastructure/schemas/teacherAssignment.js";
import ClassModel from "../infastructure/schemas/class.js";
import Grade from "../infastructure/schemas/grade.js";
import Enrollment from "../infastructure/schemas/enrollment.js";
import User from "../infastructure/schemas/user.js";
import Paper from "../infastructure/schemas/paper.js";
import PaperAttempt from "../infastructure/schemas/paperAttempt.js";

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

const buildBreakdownItem = (attempt, paper) => {
  const questionCount = Number(attempt?.questionCount || paper?.questionCount || 0);
  const correctCount = Number(attempt?.correctCount || 0);
  const totalPointsEarned = Number(attempt?.totalPointsEarned || 0);
  const totalPossiblePoints =
    Number(attempt?.totalPossiblePoints || 0) || Number(questionCount * 5 || 0);
  const percentage = Number(
    attempt?.percentage ||
      (totalPossiblePoints > 0
        ? (totalPointsEarned / totalPossiblePoints) * 100
        : 0)
  );

  return {
    title: String(paper?.paperTitle || "Paper").trim(),
    correctAnswers: `${correctCount}/${questionCount}`,
    marks: `${totalPointsEarned}/${totalPossiblePoints}`,
    progress: `${Math.round(percentage)}%`,
    submittedAt: attempt?.submittedAt || attempt?.updatedAt || attempt?.createdAt || null,
  };
};

export const getTeachersAssignedResultReport = async (req, res, next) => {
  try {
    const teacherId = toId(req.user?.id);

    if (!teacherId) {
      console.error("getTeachersAssignedResultReport error: Missing teacher id");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { paperType = "", subject = "" } = req.query;

    // 1) teacher assignment
    const teacherAssignment = await TeacherAssignment.findOne({ teacherId }).lean();

    if (!teacherAssignment) {
      console.error("getTeachersAssignedResultReport: No teacher assignment found");
      return res.status(200).json({
        message: "No teacher assignment found",
        total: 0,
        filters: {
          paperTypes: [],
          subjects: [],
        },
        reports: [],
      });
    }

    const assignments = Array.isArray(teacherAssignment.assignments)
      ? teacherAssignment.assignments
      : [];

    const allowedGradeIds = uniqueValues(assignments.map((a) => a?.gradeId));
    const allowedSubjectIds = uniqueValues(assignments.flatMap((a) => a?.subjectIds || []));

    if (!allowedGradeIds.length || !allowedSubjectIds.length) {
      console.error("getTeachersAssignedResultReport: No assigned grade or subject found");
      return res.status(200).json({
        message: "No assigned grade or subject found",
        total: 0,
        filters: {
          paperTypes: [],
          subjects: [],
        },
        reports: [],
      });
    }

    // 2) teacher classes
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
        filters: {
          paperTypes: [],
          subjects: [],
        },
        reports: [],
      });
    }

    const classIds = classes.map((c) => c._id);

    // 3) approved enrollments only
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
          paperTypes: [],
          subjects: [],
        },
        reports: [],
      });
    }

    const studentIds = uniqueValues(enrollments.map((e) => e?.studentId));
    const students = await User.find({
      _id: { $in: studentIds },
      role: "student",
      isActive: true,
    })
      .select("_id name")
      .lean();

    if (!students.length) {
      return res.status(200).json({
        message: "No students found",
        total: 0,
        filters: {
          paperTypes: [],
          subjects: [],
        },
        reports: [],
      });
    }

    // 4) grade docs
    const gradeDocs = await Grade.find({
      _id: { $in: uniqueValues(classes.map((c) => c?.gradeId)) },
    }).lean();

    const gradeMap = new Map(gradeDocs.map((g) => [toId(g._id), g]));

    // 5) papers under teacher assigned grade+subject
    const papers = await Paper.find({
      gradeId: { $in: allowedGradeIds },
      subjectId: { $in: allowedSubjectIds },
      isActive: true,
    }).lean();

    if (!papers.length) {
      return res.status(200).json({
        message: "No papers found",
        total: 0,
        filters: {
          paperTypes: [],
          subjects: [],
        },
        reports: [],
      });
    }

    const paperMap = new Map(papers.map((p) => [toId(p._id), p]));
    const paperIds = papers.map((p) => p._id);

    // 6) submitted attempts only
    const attempts = await PaperAttempt.find({
      paperId: { $in: paperIds },
      studentId: { $in: students.map((s) => s._id) },
      status: "submitted",
    }).lean();

    if (!attempts.length) {
      return res.status(200).json({
        message: "No result records found",
        total: 0,
        filters: {
          paperTypes: uniqueValues(papers.map((p) => p?.paperType)).sort((a, b) =>
            a.localeCompare(b)
          ),
          subjects: uniqueValues(
            papers.map((p) => {
              const gradeDoc = gradeMap.get(toId(p.gradeId));
              return getSubjectNameFromGrade(gradeDoc, p.subjectId);
            })
          ).sort((a, b) => a.localeCompare(b)),
        },
        reports: [],
      });
    }

    const studentMap = new Map(students.map((s) => [toId(s._id), s]));

    // 7) group results by student + grade + subject + paperType
    const grouped = new Map();

    for (const attempt of attempts) {
      const paper = paperMap.get(toId(attempt.paperId));
      if (!paper) continue;

      const student = studentMap.get(toId(attempt.studentId));
      if (!student) continue;

      const gradeDoc = gradeMap.get(toId(paper.gradeId));
      if (!gradeDoc) continue;

      const gradeNumber = Number(gradeDoc?.grade || 0);
      const gradeLabel = gradeNumber
        ? `Grade ${String(gradeNumber).padStart(2, "0")}`
        : "";
      const subjectName = getSubjectNameFromGrade(gradeDoc, paper.subjectId);
      const currentPaperType = String(paper.paperType || "").trim();

      const key = [
        toId(student._id),
        gradeLabel,
        subjectName,
        currentPaperType,
      ].join("__");

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          studentId: toId(student._id),
          studentName: String(student.name || "").trim(),
          paperType: currentPaperType,
          grade: gradeLabel,
          subject: subjectName,
          resultBreakdown: [],
        });
      }

      grouped.get(key).resultBreakdown.push(buildBreakdownItem(attempt, paper));
    }

    let rows = Array.from(grouped.values()).map((row) => {
      const sortedBreakdown = [...row.resultBreakdown].sort((a, b) => {
        const da = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const db = b?.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return db - da;
      });

      return {
        ...row,
        resultBreakdown: sortedBreakdown.map(({ submittedAt, ...rest }) => rest),
      };
    });

    // 8) filters
    if (paperType) {
      rows = rows.filter(
        (r) => String(r.paperType).toLowerCase() === String(paperType).toLowerCase()
      );
    }

    if (subject) {
      rows = rows.filter(
        (r) => String(r.subject).toLowerCase() === String(subject).toLowerCase()
      );
    }

    const paperTypeOptions = uniqueValues(
      papers.map((p) => String(p.paperType || "").trim())
    ).sort((a, b) => a.localeCompare(b));

    const subjectOptions = uniqueValues(
      papers.map((p) => {
        const gradeDoc = gradeMap.get(toId(p.gradeId));
        return getSubjectNameFromGrade(gradeDoc, p.subjectId);
      })
    ).sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      message: "Teachers assigned result report fetched successfully",
      total: rows.length,
      filters: {
        paperTypes: paperTypeOptions,
        subjects: subjectOptions,
      },
      reports: rows,
    });
  } catch (err) {
    console.error("getTeachersAssignedResultReport error:", err);
    next(err);
  }
};