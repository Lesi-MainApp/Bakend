import User from "../infastructure/schemas/user.js";
import Grade from "../infastructure/schemas/grade.js";
import Paper from "../infastructure/schemas/paper.js";
import PaperAttempt from "../infastructure/schemas/paperAttempt.js";

const DEFAULT_PAPER_TYPE = "Daily Quiz";

const toId = (value) => String(value || "").trim();

const uniqueValues = (arr = []) => {
  return [...new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))];
};

const formatGradeLabel = (gradeNumber) => {
  const num = Number(gradeNumber || 0);
  if (!num) return "";
  return `Grade ${String(num).padStart(2, "0")}`;
};

const formatPercentage = (value) => {
  const num = Number(value || 0);
  return `${num}%`;
};

const getSubjectNameFromGrade = (gradeDoc, subjectId) => {
  if (!gradeDoc || !subjectId) return "";

  const normalSubjects = Array.isArray(gradeDoc.subjects) ? gradeDoc.subjects : [];
  const normalFound = normalSubjects.find((s) => toId(s?._id) === toId(subjectId));
  if (normalFound?.subject) return String(normalFound.subject).trim();

  const streams = Array.isArray(gradeDoc.streams) ? gradeDoc.streams : [];
  for (const stream of streams) {
    const streamSubjects = Array.isArray(stream?.subjects) ? stream.subjects : [];
    const found = streamSubjects.find((s) => toId(s?._id) === toId(subjectId));
    if (found?.subject) return String(found.subject).trim();
  }

  return "";
};

const isBetterAttempt = (nextAttempt, currentBest) => {
  if (!currentBest) return true;

  const nextPercentage = Number(nextAttempt?.percentage || 0);
  const currentPercentage = Number(currentBest?.percentage || 0);

  if (nextPercentage > currentPercentage) return true;
  if (nextPercentage < currentPercentage) return false;

  const nextMarks = Number(nextAttempt?.totalPointsEarned || 0);
  const currentMarks = Number(currentBest?.totalPointsEarned || 0);

  if (nextMarks > currentMarks) return true;
  if (nextMarks < currentMarks) return false;

  const nextSubmitted = new Date(nextAttempt?.submittedAt || nextAttempt?.updatedAt || 0).getTime();
  const currentSubmitted = new Date(
    currentBest?.submittedAt || currentBest?.updatedAt || 0
  ).getTime();

  return nextSubmitted > currentSubmitted;
};

export const getAdminResultReport = async (req, res, next) => {
  try {
    const {
      paperType = DEFAULT_PAPER_TYPE,
      subject = "",
      grade = "",
      completedPaperCount = "",
    } = req.query;

    const allPapers = await Paper.find({ isActive: true })
      .select("_id paperType paperTitle gradeId subjectId")
      .lean();

    if (!allPapers.length) {
      return res.status(200).json({
        message: "No papers found",
        total: 0,
        filters: {
          paperTypes: [],
          subjects: [],
          grades: [],
        },
        rows: [],
      });
    }

    const gradeIds = uniqueValues(allPapers.map((p) => p.gradeId));
    const gradeDocs = await Grade.find({ _id: { $in: gradeIds } }).lean();
    const gradeMap = new Map(gradeDocs.map((g) => [toId(g._id), g]));

    const enrichedPapers = allPapers.map((paper) => {
      const gradeDoc = gradeMap.get(toId(paper.gradeId));
      return {
        _id: toId(paper._id),
        paperType: String(paper.paperType || "").trim(),
        paperName: String(paper.paperTitle || "").trim(),
        grade: formatGradeLabel(gradeDoc?.grade),
        subject: getSubjectNameFromGrade(gradeDoc, paper.subjectId),
      };
    });

    const filterPaperTypes = uniqueValues(
      enrichedPapers.map((p) => p.paperType)
    ).sort((a, b) => a.localeCompare(b));

    const filterSubjects = uniqueValues(
      enrichedPapers.map((p) => p.subject)
    ).sort((a, b) => a.localeCompare(b));

    const filterGrades = uniqueValues(
      enrichedPapers.map((p) => p.grade)
    ).sort((a, b) => {
      const na = Number(String(a).replace(/\D/g, ""));
      const nb = Number(String(b).replace(/\D/g, ""));
      return na - nb;
    });

    // ✅ default page should still show data even if subject/grade not selected
    let filteredPapers = [...enrichedPapers];

    if (paperType) {
      filteredPapers = filteredPapers.filter(
        (p) => String(p.paperType).toLowerCase() === String(paperType).toLowerCase()
      );
    }

    if (subject) {
      filteredPapers = filteredPapers.filter(
        (p) => String(p.subject).toLowerCase() === String(subject).toLowerCase()
      );
    }

    if (grade) {
      filteredPapers = filteredPapers.filter(
        (p) => String(p.grade).toLowerCase() === String(grade).toLowerCase()
      );
    }

    if (!filteredPapers.length) {
      return res.status(200).json({
        message: "No matching papers found",
        total: 0,
        filters: {
          paperTypes: filterPaperTypes,
          subjects: filterSubjects,
          grades: filterGrades,
        },
        rows: [],
      });
    }

    const filteredPaperIds = filteredPapers.map((p) => p._id);
    const filteredPaperMap = new Map(filteredPapers.map((p) => [p._id, p]));

    const attempts = await PaperAttempt.find({
      paperId: { $in: filteredPaperIds },
      status: "submitted",
    })
      .select(
        "paperId studentId attemptNo questionCount totalPossiblePoints totalPointsEarned correctCount percentage submittedAt updatedAt"
      )
      .lean();

    if (!attempts.length) {
      return res.status(200).json({
        message: "No result records found",
        total: 0,
        filters: {
          paperTypes: filterPaperTypes,
          subjects: filterSubjects,
          grades: filterGrades,
        },
        rows: [],
      });
    }

    const studentPaperBestMap = new Map();

    for (const attempt of attempts) {
      const key = `${toId(attempt.studentId)}__${toId(attempt.paperId)}`;

      if (!studentPaperBestMap.has(key)) {
        studentPaperBestMap.set(key, {
          studentId: toId(attempt.studentId),
          paperId: toId(attempt.paperId),
          bestAttempt: null,
        });
      }

      const current = studentPaperBestMap.get(key);

      if (isBetterAttempt(attempt, current.bestAttempt)) {
        current.bestAttempt = attempt;
      }
    }

    const studentIds = uniqueValues(
      [...studentPaperBestMap.values()].map((x) => x.studentId)
    );

    const students = await User.find({
      _id: { $in: studentIds },
      role: "student",
    })
      .select("name selectedGradeNumber")
      .lean();

    const studentMap = new Map(
      students.map((s) => [
        toId(s._id),
        {
          name: String(s.name || "").trim(),
          grade: formatGradeLabel(s.selectedGradeNumber),
        },
      ])
    );

    const groupedByStudent = new Map();

    for (const item of studentPaperBestMap.values()) {
      const student = studentMap.get(item.studentId);
      const paper = filteredPaperMap.get(item.paperId);
      const best = item.bestAttempt;

      if (!student || !paper || !best) continue;

      if (!groupedByStudent.has(item.studentId)) {
        groupedByStudent.set(item.studentId, {
          id: item.studentId,
          studentId: item.studentId,
          studentName: student.name || "-",
          grade: student.grade || paper.grade || "-",
          subjects: [],
          completedPapersCount: 0,
          results: [],
          highestScore: 0,
        });
      }

      const group = groupedByStudent.get(item.studentId);

      group.subjects.push(paper.subject || "-");
      group.completedPapersCount += 1;
      group.results.push({
        paperName: paper.paperName || "-",
        subject: paper.subject || "-",
        grade: paper.grade || "-",
        paperType: paper.paperType || "-",
        correctAnswers: `${Number(best.correctCount || 0)}/${Number(best.questionCount || 0)}`,
        marks: `${Number(best.totalPointsEarned || 0)}/${Number(best.totalPossiblePoints || 0)}`,
        progress: formatPercentage(best.percentage),
        percentageValue: Number(best.percentage || 0),
      });

      if (Number(best.percentage || 0) > group.highestScore) {
        group.highestScore = Number(best.percentage || 0);
      }
    }

    let rows = [...groupedByStudent.values()].map((row) => ({
      ...row,
      subjects: uniqueValues(row.subjects).sort((a, b) => a.localeCompare(b)),
      results: [...row.results].sort((a, b) => {
        const bp = Number(b.percentageValue || 0);
        const ap = Number(a.percentageValue || 0);
        if (bp !== ap) return bp - ap;
        return String(a.paperName).localeCompare(String(b.paperName));
      }),
    }));

    if (completedPaperCount) {
      const wanted = Number(completedPaperCount);
      if (!Number.isNaN(wanted)) {
        rows = rows.filter((r) => Number(r.completedPapersCount || 0) === wanted);
      }
    }

    rows = rows.sort((a, b) => {
      const byScore = Number(b.highestScore || 0) - Number(a.highestScore || 0);
      if (byScore !== 0) return byScore;
      return String(a.studentName).localeCompare(String(b.studentName));
    });

    return res.status(200).json({
      message: "",
      total: rows.length,
      filters: {
        paperTypes: filterPaperTypes,
        subjects: filterSubjects,
        grades: filterGrades,
      },
      rows,
    });
  } catch (err) {
    console.error("getAdminResultReport error:", err);
    next(err);
  }
};