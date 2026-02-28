import TeacherAssignment from "../infastructure/schemas/teacherAssignment.js";
import ClassModel from "../infastructure/schemas/class.js";
import Grade from "../infastructure/schemas/grade.js";
import Paper, { PAPER_TYPES } from "../infastructure/schemas/paper.js";

const toId = (value) => String(value || "").trim();

const uniqueValues = (arr = []) => {
  return [...new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))];
};

const getSubjectNameFromGrade = (gradeDoc, subjectId) => {
  if (!gradeDoc || !subjectId) return "";

  const subjects = Array.isArray(gradeDoc.subjects) ? gradeDoc.subjects : [];
  const normal = subjects.find((s) => toId(s?._id) === toId(subjectId));
  if (normal?.subject) return String(normal.subject).trim();

  const streams = Array.isArray(gradeDoc.streams) ? gradeDoc.streams : [];
  for (const stream of streams) {
    const streamSubjects = Array.isArray(stream?.subjects) ? stream.subjects : [];
    const found = streamSubjects.find((s) => toId(s?._id) === toId(subjectId));
    if (found?.subject) return String(found.subject).trim();
  }

  return "";
};

export const getTechersPaperReport = async (req, res, next) => {
  try {
    const teacherId = toId(req.user?.id);

    if (!teacherId) {
      console.error("getTechersPaperReport error: Missing teacher id");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      paperName = "",
      subject = "",
      grade = "",
      paperType = "",
    } = req.query;

    // 1) teacher assignment
    const teacherAssignment = await TeacherAssignment.findOne({ teacherId }).lean();

    if (!teacherAssignment) {
      console.error("getTechersPaperReport: No teacher assignment found");
      return res.status(200).json({
        message: "No teacher assignment found",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          paperTypes: PAPER_TYPES,
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
      console.error("getTechersPaperReport: No assigned grade or subject found");
      return res.status(200).json({
        message: "No assigned grade or subject found",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          paperTypes: PAPER_TYPES,
        },
        reports: [],
      });
    }

    // 2) only classes handled by this teacher
    const teacherClasses = await ClassModel.find({
      teacherIds: teacherId,
      gradeId: { $in: allowedGradeIds },
      subjectId: { $in: allowedSubjectIds },
      isActive: true,
    }).lean();

    if (!teacherClasses.length) {
      console.error("getTechersPaperReport: No classes found for teacher");
      return res.status(200).json({
        message: "No classes found for teacher",
        total: 0,
        filters: {
          grades: [],
          subjects: [],
          paperTypes: PAPER_TYPES,
        },
        reports: [],
      });
    }

    // 3) grade docs used for grade label + subject label
    const gradeDocs = await Grade.find({
      _id: { $in: uniqueValues(teacherClasses.map((c) => c?.gradeId)) },
    }).lean();

    const gradeMap = new Map(gradeDocs.map((g) => [toId(g._id), g]));

    // 4) papers only under assigned grade + subject
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
          grades: [],
          subjects: [],
          paperTypes: PAPER_TYPES,
        },
        reports: [],
      });
    }

    let rows = papers.map((paper) => {
      const gradeDoc = gradeMap.get(toId(paper.gradeId));
      const gradeNumber = Number(gradeDoc?.grade || 0);
      const gradeLabel = gradeNumber
        ? `Grade ${String(gradeNumber).padStart(2, "0")}`
        : "";
      const subjectName = getSubjectNameFromGrade(gradeDoc, paper.subjectId);

      return {
        paperId: toId(paper._id),
        paperType: String(paper.paperType || "").trim(),
        paperName: String(paper.paperTitle || "").trim(),
        grade: gradeLabel,
        subject: subjectName,
        time: `${Number(paper.timeMinutes || 0)} min`,
        questionCount: Number(paper.questionCount || 0),
        createdBy: String(paper.createdPersonName || "").trim(),
      };
    });

    // filters
    if (paperName) {
      const key = String(paperName).trim().toLowerCase();
      rows = rows.filter((r) => String(r.paperName).toLowerCase().includes(key));
    }

    if (subject) {
      rows = rows.filter(
        (r) => String(r.subject).toLowerCase() === String(subject).toLowerCase()
      );
    }

    if (grade) {
      rows = rows.filter(
        (r) => String(r.grade).toLowerCase() === String(grade).toLowerCase()
      );
    }

    if (paperType) {
      rows = rows.filter(
        (r) => String(r.paperType).toLowerCase() === String(paperType).toLowerCase()
      );
    }

    const gradeOptions = uniqueValues(
      papers.map((paper) => {
        const gradeDoc = gradeMap.get(toId(paper.gradeId));
        const gradeNumber = Number(gradeDoc?.grade || 0);
        return gradeNumber ? `Grade ${String(gradeNumber).padStart(2, "0")}` : "";
      })
    ).sort((a, b) => {
      const na = Number(String(a).replace(/\D/g, ""));
      const nb = Number(String(b).replace(/\D/g, ""));
      return na - nb;
    });

    const subjectOptions = uniqueValues(
      papers.map((paper) => {
        const gradeDoc = gradeMap.get(toId(paper.gradeId));
        return getSubjectNameFromGrade(gradeDoc, paper.subjectId);
      })
    ).sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      message: "Teacher paper report fetched successfully",
      total: rows.length,
      filters: {
        grades: gradeOptions,
        subjects: subjectOptions,
        paperTypes: PAPER_TYPES, // ✅ always all paper types
      },
      reports: rows,
    });
  } catch (err) {
    console.error("getTechersPaperReport error:", err);
    next(err);
  }
};