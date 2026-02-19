import mongoose from "mongoose";
import Paper from "../infastructure/schemas/paper.js";
import Grade from "../infastructure/schemas/grade.js";
import Question from "../infastructure/schemas/question.js";
import PaperAttempt from "../infastructure/schemas/paperAttempt.js";
import AttemptAnswer from "../infastructure/schemas/attemptAnswer.js";
import User from "../infastructure/schemas/user.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const is1to11 = (g) => g >= 1 && g <= 11;
const is12or13 = (g) => g === 12 || g === 13;

const readablePaperMeta = (paper, grade) => {
  const gNo = Number(grade?.grade);
  let subject = null;
  let stream = null;

  if (is1to11(gNo)) {
    subject =
      (grade.subjects || []).find((s) => String(s._id) === String(paper.subjectId))?.subject ||
      "Unknown Subject";
  } else if (is12or13(gNo)) {
    const st = (grade.streams || []).find((x) => String(x._id) === String(paper.streamId));
    stream = st?.stream || "Unknown Stream";
    subject =
      (st?.subjects || []).find((s) => String(s._id) === String(paper.streamSubjectId))?.subject ||
      "Unknown Subject";
  }

  return { grade: gNo, stream, subject };
};

// =======================================================
// STUDENT: START ATTEMPT
// POST /api/attempt/start
// Body: { paperId }
// =======================================================
export const startAttempt = async (req, res) => {
  try {
    const { paperId } = req.body;

    if (!paperId || !isValidId(paperId)) {
      return res.status(400).json({ message: "Valid paperId is required" });
    }

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") {
      return res.status(403).json({ message: "Only students can start attempt" });
    }

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    if (!paper.isPublished || paper.isActive === false) {
      return res.status(403).json({ message: "Paper not available" });
    }

    const grade = await Grade.findById(paper.gradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    // attempts limit (count only submitted attempts)
    const used = await PaperAttempt.countDocuments({
      paperId,
      studentId: student._id,
      status: "submitted",
    });

    if (used >= Number(paper.attempts || 1)) {
      return res.status(403).json({
        message: "Attempts limit reached",
        attemptsUsed: used,
        attemptsAllowed: Number(paper.attempts || 1),
      });
    }

    // if in-progress attempt exists, return it
    const existing = await PaperAttempt.findOne({
      paperId,
      studentId: student._id,
      status: "in_progress",
    }).lean();

    if (existing) {
      return res.status(200).json({
        message: "Continue existing attempt",
        attempt: existing,
        paper: {
          _id: String(paper._id),
          paperTitle: paper.paperTitle,
          timeMinutes: Number(paper.timeMinutes || 0),
          questionCount: Number(paper.questionCount || 0),
        },
        meta: readablePaperMeta(paper, grade),
        attemptsUsed: used,
        attemptsAllowed: Number(paper.attempts || 1),
      });
    }

    const attemptNo = used + 1;

    // total possible points
    const questions = await Question.find({ paperId }).select("point").lean();
    const totalPossiblePoints = questions.length
      ? questions.reduce((sum, q) => sum + Number(q.point || 0), 0)
      : Number(paper.questionCount || 0) * 5;

    const doc = await PaperAttempt.create({
      paperId,
      studentId: student._id,
      attemptNo,
      gradeId: paper.gradeId,
      subjectId: paper.subjectId,
      streamId: paper.streamId,
      streamSubjectId: paper.streamSubjectId,
      questionCount: Number(paper.questionCount),
      oneQuestionAnswersCount: Number(paper.oneQuestionAnswersCount),
      totalPossiblePoints,
    });

    return res.status(201).json({
      message: "Attempt started",
      attempt: doc,
      paper: {
        _id: String(paper._id),
        paperTitle: paper.paperTitle,
        timeMinutes: Number(paper.timeMinutes || 0),
        questionCount: Number(paper.questionCount || 0),
      },
      meta: readablePaperMeta(paper, grade),
      attemptsUsed: used,
      attemptsAllowed: Number(paper.attempts || 1),
    });
  } catch (err) {
    console.error("startAttempt error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ STUDENT: GET QUESTIONS (NO CORRECT ANSWERS)
// GET /api/attempt/questions/:attemptId
// =======================================================
export const getAttemptQuestions = async (req, res) => {
  try {
    const { attemptId } = req.params;
    if (!isValidId(attemptId)) return res.status(400).json({ message: "Invalid attemptId" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Only students" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(student._id)) return res.status(403).json({ message: "Not your attempt" });

    const paper = await Paper.findById(attempt.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const questions = await Question.find({ paperId: attempt.paperId, isActive: true })
      .sort({ questionNumber: 1 })
      .select("questionNumber lessonName question answers point explanationVideoUrl explanationText imageUrl")
      .lean();

    // existing answers (for resume)
    const answers = await AttemptAnswer.find({ attemptId: attempt._id }).lean();
    const ansMap = new Map(answers.map((a) => [String(a.questionId), a]));

    const formatted = questions.map((q) => {
      const a = ansMap.get(String(q._id));
      return {
        _id: String(q._id),
        questionNumber: Number(q.questionNumber),
        lessonName: q.lessonName || "",
        question: q.question || "",
        answers: Array.isArray(q.answers) ? q.answers : [],
        point: Number(q.point || 0),
        explanationVideoUrl: q.explanationVideoUrl || "",
        explanationText: q.explanationText || "",
        imageUrl: q.imageUrl || "",
        selectedAnswerIndex: a ? Number(a.selectedAnswerIndex) : null,
      };
    });

    return res.status(200).json({
      attemptId: String(attempt._id),
      paper: {
        _id: String(paper._id),
        paperTitle: paper.paperTitle,
        timeMinutes: Number(paper.timeMinutes || 0),
        questionCount: Number(paper.questionCount || 0),
      },
      questions: formatted,
    });
  } catch (err) {
    console.error("getAttemptQuestions error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// STUDENT: SAVE/UPDATE ONE ANSWER
// POST /api/attempt/answer
// Body: { attemptId, questionId, selectedAnswerIndex }
// =======================================================
export const saveAnswer = async (req, res) => {
  try {
    const { attemptId, questionId, selectedAnswerIndex } = req.body;

    if (!attemptId || !isValidId(attemptId)) return res.status(400).json({ message: "Valid attemptId is required" });
    if (!questionId || !isValidId(questionId)) return res.status(400).json({ message: "Valid questionId is required" });

    const idx = Number(selectedAnswerIndex);
    if (Number.isNaN(idx) || idx < 0) return res.status(400).json({ message: "selectedAnswerIndex is invalid" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Only students can answer" });

    const attempt = await PaperAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(student._id)) return res.status(403).json({ message: "Not your attempt" });
    if (attempt.status !== "in_progress") return res.status(400).json({ message: "Attempt already submitted" });

    const q = await Question.findById(questionId).lean();
    if (!q) return res.status(404).json({ message: "Question not found" });
    if (String(q.paperId) !== String(attempt.paperId)) {
      return res.status(400).json({ message: "Question does not belong to this paper" });
    }

    const answerCount = (q.answers || []).length;
    if (idx >= answerCount) return res.status(400).json({ message: "selectedAnswerIndex out of range" });

    const doc = await AttemptAnswer.findOneAndUpdate(
      { attemptId: attempt._id, questionId: q._id },
      {
        attemptId: attempt._id,
        paperId: attempt.paperId,
        questionId: q._id,
        questionNumber: q.questionNumber,
        selectedAnswerIndex: idx,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const answeredCount = await AttemptAnswer.countDocuments({ attemptId: attempt._id });

    return res.status(200).json({
      message: "Answer saved",
      answer: doc,
      answeredCount,
      totalQuestions: Number(attempt.questionCount),
    });
  } catch (err) {
    console.error("saveAnswer error:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Duplicate answer record" });
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ STUDENT: SUBMIT ATTEMPT (MULTI CORRECT)
// POST /api/attempt/submit/:attemptId
// =======================================================
export const submitAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    if (!isValidId(attemptId)) return res.status(400).json({ message: "Invalid attemptId" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Only students can submit" });

    const attempt = await PaperAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(student._id)) return res.status(403).json({ message: "Not your attempt" });
    if (attempt.status !== "in_progress") return res.status(400).json({ message: "Attempt already submitted" });

    const paper = await Paper.findById(attempt.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const grade = await Grade.findById(paper.gradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const questions = await Question.find({ paperId: attempt.paperId }).lean();
    if (!questions.length) return res.status(400).json({ message: "No questions found for this paper" });

    const answers = await AttemptAnswer.find({ attemptId: attempt._id }).lean();
    const ansMap = new Map(answers.map((a) => [String(a.questionId), a]));

    let correctCount = 0;
    let wrongCount = 0;
    let earned = 0;
    let possible = 0;

    for (const q of questions) {
      const qPoint = Number(q.point || 0);
      possible += qPoint;

      const a = ansMap.get(String(q._id));
      if (!a) {
        wrongCount += 1;
        continue;
      }

      const selected = Number(a.selectedAnswerIndex);

      const correctList = Array.isArray(q.correctAnswerIndexes) ? q.correctAnswerIndexes : [];
      const isCorrect = correctList.includes(selected);

      if (isCorrect) {
        correctCount += 1;
        earned += qPoint;
      } else {
        wrongCount += 1;
      }

      await AttemptAnswer.updateOne(
        { _id: a._id },
        { $set: { isCorrect, earnedPoints: isCorrect ? qPoint : 0 } }
      );
    }

    const totalQuestions = questions.length;
    const percentage = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;

    attempt.status = "submitted";
    attempt.submittedAt = new Date();
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.totalPointsEarned = earned;
    attempt.totalPossiblePoints = possible;
    attempt.percentage = percentage;
    await attempt.save();

    const used = await PaperAttempt.countDocuments({
      paperId: attempt.paperId,
      studentId: student._id,
      status: "submitted",
    });

    return res.status(200).json({
      message: "Attempt submitted",
      attemptId: String(attempt._id),
      attemptNo: attempt.attemptNo,
      attemptsUsed: used,
      attemptsAllowed: Number(paper.attempts || 1),

      totalQuestions,
      correctCount,
      wrongCount,

      totalPointsEarned: earned,
      totalPossiblePoints: possible,
      percentage,

      meta: readablePaperMeta(paper, grade),
    });
  } catch (err) {
    console.error("submitAttempt error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// STUDENT: LIST MY ATTEMPTS FOR A PAPER
// GET /api/attempt/my/:paperId
// =======================================================
export const myAttemptsByPaper = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Only students" });

    const list = await PaperAttempt.find({ paperId, studentId: student._id })
      .sort({ attemptNo: -1 })
      .lean();

    return res.status(200).json({ attempts: list });
  } catch (err) {
    console.error("myAttemptsByPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// STUDENT: SUMMARY
// GET /api/attempt/summary/:attemptId
// =======================================================
export const attemptSummary = async (req, res) => {
  try {
    const { attemptId } = req.params;
    if (!isValidId(attemptId)) return res.status(400).json({ message: "Invalid attemptId" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Only students" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(student._id)) return res.status(403).json({ message: "Not your attempt" });

    const paper = await Paper.findById(attempt.paperId).lean();
    const grade = paper ? await Grade.findById(paper.gradeId).lean() : null;

    return res.status(200).json({
      attempt,
      meta: paper && grade ? readablePaperMeta(paper, grade) : null,
    });
  } catch (err) {
    console.error("attemptSummary error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ STUDENT: REVIEW (wrong first, then correct)
// GET /api/attempt/review/:attemptId
// =======================================================
export const attemptReview = async (req, res) => {
  try {
    const { attemptId } = req.params;
    if (!isValidId(attemptId)) return res.status(400).json({ message: "Invalid attemptId" });

    const student = await User.findById(req.user?.id).lean();
    if (!student || student.role !== "student") return res.status(403).json({ message: "Only students" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(student._id)) return res.status(403).json({ message: "Not your attempt" });

    if (attempt.status !== "submitted") {
      return res.status(400).json({ message: "Attempt not submitted yet" });
    }

    const questions = await Question.find({ paperId: attempt.paperId }).sort({ questionNumber: 1 }).lean();
    const answers = await AttemptAnswer.find({ attemptId: attempt._id }).lean();
    const ansMap = new Map(answers.map((a) => [String(a.questionId), a]));

    const wrong = [];
    const correct = [];

    for (const q of questions) {
      const a = ansMap.get(String(q._id)) || null;
      const selectedIndex = a ? Number(a.selectedAnswerIndex) : null;

      const correctIdxs = Array.isArray(q.correctAnswerIndexes) ? q.correctAnswerIndexes : [];
      const isCorrect = a ? Boolean(a.isCorrect) : false;

      const firstCorrectIndex = correctIdxs.length ? correctIdxs[0] : null;

      const item = {
        _id: String(q._id),
        questionNumber: q.questionNumber,
        lessonName: q.lessonName,
        question: q.question,
        answers: q.answers,
        point: q.point,

        selectedAnswerIndex,
        selectedAnswer: selectedIndex !== null ? q.answers?.[selectedIndex] : null,

        correctAnswerIndexes: correctIdxs,
        correctAnswers: correctIdxs.map((i) => q.answers?.[i]).filter(Boolean),

        // keep these for UI compatibility (first correct)
        correctAnswerIndex: firstCorrectIndex,
        correctAnswer: firstCorrectIndex !== null ? q.answers?.[firstCorrectIndex] : null,

        explanationVideoUrl: q.explanationVideoUrl || "",
        explanationText: q.explanationText || "",
      };

      if (isCorrect) correct.push(item);
      else wrong.push(item);
    }

    return res.status(200).json({
      attemptId: String(attempt._id),
      result: {
        totalQuestions: questions.length,
        correctCount: attempt.correctCount,
        wrongCount: attempt.wrongCount,
        totalPointsEarned: attempt.totalPointsEarned,
        totalPossiblePoints: attempt.totalPossiblePoints,
        percentage: attempt.percentage,
      },
      wrongFirst: wrong,
      correctAfter: correct,
    });
  } catch (err) {
    console.error("attemptReview error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
