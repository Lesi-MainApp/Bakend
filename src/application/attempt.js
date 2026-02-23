// src/application/attempt.js
import mongoose from "mongoose";
import Paper from "../infastructure/schemas/paper.js";
import Question from "../infastructure/schemas/question.js";
import PaperAttempt from "../infastructure/schemas/paperAttempt.js";
import AttemptAnswer from "../infastructure/schemas/attemptAnswer.js";

// ✅ ADD (for paid paper lock)
import Payment from "../infastructure/schemas/payment.js";

// ✅ ADD (to resolve subject name)
import Grade from "../infastructure/schemas/grade.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const uniqSortedNums = (arr) =>
  [...new Set((arr || []).map(Number).filter((n) => Number.isFinite(n)))].sort(
    (a, b) => a - b
  );

const toStr = (v) => String(v || "");

const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const computeCorrectAnswers = (questionDoc) => {
  const answers = Array.isArray(questionDoc?.answers) ? questionDoc.answers : [];
  const idxs = Array.isArray(questionDoc?.correctAnswerIndexes)
    ? uniqSortedNums(questionDoc.correctAnswerIndexes)
    : [];

  // fallback old doc
  if (!idxs.length && Number.isFinite(Number(questionDoc?.correctAnswerIndex))) {
    idxs.push(Number(questionDoc.correctAnswerIndex));
  }

  return idxs
    .filter((i) => i >= 0 && i < answers.length)
    .map((i) => answers[i]);
};

const computeIsCorrect = (questionDoc, selectedIndex) => {
  const idxs = Array.isArray(questionDoc?.correctAnswerIndexes)
    ? uniqSortedNums(questionDoc.correctAnswerIndexes)
    : [];

  if (!idxs.length && Number.isFinite(Number(questionDoc?.correctAnswerIndex))) {
    idxs.push(Number(questionDoc.correctAnswerIndex));
  }

  return idxs.includes(Number(selectedIndex));
};

const is1to11 = (g) => g >= 1 && g <= 11;
const is12or13 = (g) => g === 12 || g === 13;

const resolveSubjectName = (paper, gradeDoc) => {
  try {
    const gNo = safeNum(gradeDoc?.grade, 0);

    // Grades 1-11: subjectId stored in paper.subjectId
    if (is1to11(gNo)) {
      const subject =
        (gradeDoc?.subjects || []).find(
          (s) => String(s?._id) === String(paper?.subjectId)
        )?.subject || "";
      return toStr(subject) || "Unknown Subject";
    }

    // Grades 12-13: stream + streamSubjectId
    if (is12or13(gNo)) {
      const st = (gradeDoc?.streams || []).find(
        (x) => String(x?._id) === String(paper?.streamId)
      );
      const subject =
        (st?.subjects || []).find(
          (s) => String(s?._id) === String(paper?.streamSubjectId)
        )?.subject || "";
      return toStr(subject) || "Unknown Subject";
    }

    return "Unknown Subject";
  } catch {
    return "Unknown Subject";
  }
};

/* =========================================================
   POST /api/attempt/start
========================================================= */
export const startAttempt = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { paperId } = req.body;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(paperId))
      return res.status(400).json({ message: "Valid paperId is required" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper || !paper.isActive || !paper.isPublished) {
      return res.status(404).json({ message: "Paper not available" });
    }

    // ✅ PAID PAPER LOCK CHECK (PayHere)
    const payType = String(paper.payment || "free").toLowerCase();
    if (payType === "paid") {
      const paid = await Payment.findOne({
        userId: studentId,
        paperId,
        status: "success",
      }).lean();

      if (!paid) {
        return res.status(402).json({
          message: "Payment required",
          paperId: String(paperId),
          amount: Number(paper.amount || 0),
        });
      }
    }

    const attemptsAllowed = safeNum(paper.attempts, 1);

    // count existing attempts
    const existingAttempts = await PaperAttempt.find({ paperId, studentId })
      .sort({ attemptNo: -1 })
      .lean();

    const attemptsUsed = existingAttempts.length;
    const attemptsLeft = Math.max(attemptsAllowed - attemptsUsed, 0);

    if (attemptsLeft <= 0) {
      // last submitted attempt id (if any)
      const last = existingAttempts[0] || null;
      return res.status(400).json({
        message: "Attempt limit reached",
        attemptsAllowed,
        attemptsUsed,
        attemptsLeft,
        lastAttemptId: last?._id ? String(last._id) : null,
      });
    }

    const nextAttemptNo = attemptsUsed + 1;

    const attempt = await PaperAttempt.create({
      paperId,
      studentId,
      attemptNo: nextAttemptNo,

      status: "in_progress",

      gradeId: paper.gradeId,
      subjectId: paper.subjectId || null,
      streamId: paper.streamId || null,
      streamSubjectId: paper.streamSubjectId || null,

      questionCount: safeNum(paper.questionCount, 1),
      oneQuestionAnswersCount: safeNum(paper.oneQuestionAnswersCount, 4),

      totalPossiblePoints: 0,
      totalPointsEarned: 0,
      correctCount: 0,
      wrongCount: 0,
      percentage: 0,

      startedAt: new Date(),
      submittedAt: null,
    });

    return res.status(201).json({
      message: "Attempt started",
      attempt,
      paper: {
        _id: String(paper._id),
        timeMinutes: safeNum(paper.timeMinutes, 10),
        questionCount: safeNum(paper.questionCount, 0),
        attemptsAllowed,
      },
      meta: {
        attemptNo: nextAttemptNo,
        attemptsAllowed,
        attemptsUsed: attemptsUsed + 1,
        attemptsLeft: Math.max(attemptsAllowed - (attemptsUsed + 1), 0),
      },
    });
  } catch (err) {
    console.error("startAttempt error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   GET /api/attempt/questions/:attemptId
========================================================= */
export const getAttemptQuestions = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { attemptId } = req.params;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(attemptId))
      return res.status(400).json({ message: "Invalid attemptId" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(studentId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const paper = await Paper.findById(attempt.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const questions = await Question.find({ paperId: attempt.paperId })
      .sort({ questionNumber: 1 })
      .lean();

    const savedAnswers = await AttemptAnswer.find({ attemptId }).lean();
    const ansMap = new Map(savedAnswers.map((a) => [String(a.questionId), a]));

    // IMPORTANT: do NOT send correct answers here
    const list = questions.map((q) => {
      const a = ansMap.get(String(q._id));
      return {
        _id: String(q._id),
        questionNumber: q.questionNumber,
        lessonName: q.lessonName || "",
        question: q.question || "",
        answers: Array.isArray(q.answers) ? q.answers : [],
        imageUrl: q.imageUrl || "",
        explanationVideoUrl: q.explanationVideoUrl || "",
        explanationText: q.explanationText || "",
        selectedAnswerIndex:
          typeof a?.selectedAnswerIndex === "number" ? a.selectedAnswerIndex : null,
      };
    });

    return res.status(200).json({
      attempt: {
        _id: String(attempt._id),
        status: attempt.status,
        attemptNo: attempt.attemptNo,
      },
      paper: {
        _id: String(paper._id),
        timeMinutes: safeNum(paper.timeMinutes, 10),
      },
      questions: list,
    });
  } catch (err) {
    console.error("getAttemptQuestions error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   POST /api/attempt/answer
========================================================= */
export const saveAnswer = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { attemptId, questionId, selectedAnswerIndex } = req.body;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(attemptId))
      return res.status(400).json({ message: "Invalid attemptId" });
    if (!isValidId(questionId))
      return res.status(400).json({ message: "Invalid questionId" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(studentId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (attempt.status === "submitted") {
      return res.status(400).json({ message: "Attempt already submitted" });
    }

    const q = await Question.findById(questionId).lean();
    if (!q) return res.status(404).json({ message: "Question not found" });
    if (String(q.paperId) !== String(attempt.paperId)) {
      return res
        .status(400)
        .json({ message: "Question not in this attempt paper" });
    }

    const idx = Number(selectedAnswerIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= (q.answers || []).length) {
      return res.status(400).json({ message: "Invalid selectedAnswerIndex" });
    }

    const doc = await AttemptAnswer.findOneAndUpdate(
      { attemptId, questionId },
      {
        $set: {
          attemptId,
          paperId: attempt.paperId,
          questionId,
          questionNumber: q.questionNumber,
          selectedAnswerIndex: idx,
        },
      },
      { upsert: true, new: true }
    ).lean();

    return res.status(200).json({ message: "Answer saved", answer: doc });
  } catch (err) {
    console.error("saveAnswer error:", err);
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Answer already exists" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   POST /api/attempt/submit/:attemptId
========================================================= */
export const submitAttempt = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { attemptId } = req.params;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(attemptId))
      return res.status(400).json({ message: "Invalid attemptId" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(studentId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (attempt.status === "submitted") {
      return res.status(200).json({
        message: "Already submitted",
        percentage: safeNum(attempt.percentage, 0),
      });
    }

    const paper = await Paper.findById(attempt.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const questions = await Question.find({ paperId: attempt.paperId }).lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const answers = await AttemptAnswer.find({ attemptId }).lean();

    let totalPossible = 0;
    let earned = 0;
    let correct = 0;
    let wrong = 0;

    const updates = [];

    for (const a of answers) {
      const q = qMap.get(String(a.questionId));
      if (!q) continue;

      const point = safeNum(q.point, 0);
      totalPossible += point;

      const isCorrect = computeIsCorrect(q, a.selectedAnswerIndex);
      const earnedPoints = isCorrect ? point : 0;

      if (isCorrect) correct += 1;
      else wrong += 1;

      earned += earnedPoints;

      updates.push({
        updateOne: {
          filter: { _id: a._id },
          update: { $set: { isCorrect, earnedPoints } },
        },
      });
    }

    if (updates.length) {
      await AttemptAnswer.bulkWrite(updates);
    }

    const percentage = totalPossible ? Math.round((earned / totalPossible) * 100) : 0;

    const updated = await PaperAttempt.findByIdAndUpdate(
      attemptId,
      {
        $set: {
          status: "submitted",
          submittedAt: new Date(),
          totalPossiblePoints: totalPossible,
          totalPointsEarned: earned,
          correctCount: correct,
          wrongCount: wrong,
          percentage,
        },
      },
      { new: true }
    ).lean();

    return res.status(200).json({
      message: "Submitted",
      percentage,
      attempt: updated,
    });
  } catch (err) {
    console.error("submitAttempt error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   GET /api/attempt/my/:paperId
========================================================= */
export const myAttemptsByPaper = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { paperId } = req.params;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(paperId))
      return res.status(400).json({ message: "Invalid paperId" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const attemptsAllowed = safeNum(paper.attempts, 1);

    const attempts = await PaperAttempt.find({ paperId, studentId })
      .sort({ attemptNo: -1 })
      .lean();

    const attemptsUsed = attempts.length;
    const attemptsLeft = Math.max(attemptsAllowed - attemptsUsed, 0);

    // last submitted attempt (for View Result)
    const lastSubmitted = attempts.find((a) => a.status === "submitted") || null;

    return res.status(200).json({
      paperId: String(paperId),
      attemptsAllowed,
      attemptsUsed,
      attemptsLeft,
      lastAttemptId: lastSubmitted?._id ? String(lastSubmitted._id) : null,
      lastAttemptNo: lastSubmitted?.attemptNo || null,
      lastStatus: lastSubmitted?.status || null,
    });
  } catch (err) {
    console.error("myAttemptsByPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   GET /api/attempt/summary/:attemptId
========================================================= */
export const attemptSummary = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { attemptId } = req.params;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(attemptId))
      return res.status(400).json({ message: "Invalid attemptId" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(studentId))
      return res.status(403).json({ message: "Forbidden" });

    const paper = await Paper.findById(attempt.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const attemptsAllowed = safeNum(paper.attempts, 1);
    const used = await PaperAttempt.countDocuments({ paperId: attempt.paperId, studentId });
    const attemptsLeft = Math.max(attemptsAllowed - used, 0);
    const nextAttemptNo = used + 1;

    return res.status(200).json({
      paperId: String(paper._id),
      attemptsAllowed,
      attemptsUsed: used,
      attemptsLeft,
      attemptNo: attempt.attemptNo,
      nextAttemptNo,
    });
  } catch (err) {
    console.error("attemptSummary error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   GET /api/attempt/review/:attemptId
========================================================= */
export const attemptReview = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { attemptId } = req.params;

    if (!studentId) return res.status(401).json({ message: "Unauthorized" });
    if (!isValidId(attemptId))
      return res.status(400).json({ message: "Invalid attemptId" });

    const attempt = await PaperAttempt.findById(attemptId).lean();
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (String(attempt.studentId) !== String(studentId))
      return res.status(403).json({ message: "Forbidden" });

    const paper = await Paper.findById(attempt.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const attemptsAllowed = safeNum(paper.attempts, 1);
    const used = await PaperAttempt.countDocuments({ paperId: attempt.paperId, studentId });
    const attemptsLeft = Math.max(attemptsAllowed - used, 0);

    const questions = await Question.find({ paperId: attempt.paperId })
      .sort({ questionNumber: 1 })
      .lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const answers = await AttemptAnswer.find({ attemptId }).lean();

    const rows = answers
      .map((a) => {
        const q = qMap.get(String(a.questionId));
        if (!q) return null;

        const ansList = Array.isArray(q.answers) ? q.answers : [];

        const selectedIndex = Number(a.selectedAnswerIndex);
        const selectedAnswer =
          Number.isFinite(selectedIndex) &&
          selectedIndex >= 0 &&
          selectedIndex < ansList.length
            ? ansList[selectedIndex]
            : "";

        const correctAnswers = computeCorrectAnswers(q);
        const isCorrect = !!a.isCorrect;

        return {
          _id: String(a._id),
          questionId: String(q._id),
          questionNumber: q.questionNumber,
          question: toStr(q.question),
          answers: ansList,
          selectedAnswerIndex: selectedIndex,
          selectedAnswer,
          correctAnswers,
          isCorrect,
          point: safeNum(q.point, 0),
          earnedPoints: safeNum(a.earnedPoints, 0),
          explanationVideoUrl: toStr(q.explanationVideoUrl),
          explanationText: toStr(q.explanationText),
          imageUrl: toStr(q.imageUrl),
          lessonName: toStr(q.lessonName),
        };
      })
      .filter(Boolean)
      .sort((x, y) => x.questionNumber - y.questionNumber);

    const wrongFirst = rows.filter((r) => !r.isCorrect);
    const correctAfter = rows.filter((r) => r.isCorrect);

    const totalQuestions = safeNum(paper.questionCount, rows.length);
    const correctCount = safeNum(attempt.correctCount, correctAfter.length);
    const wrongCount = safeNum(attempt.wrongCount, wrongFirst.length);
    const percentage = safeNum(attempt.percentage, 0);

    return res.status(200).json({
      meta: {
        paperId: String(paper._id),
        attemptId: String(attempt._id),
        attemptNo: attempt.attemptNo,
        attemptsAllowed,
        attemptsLeft,
        nextAttemptNo: used + 1,
      },
      result: {
        totalQuestions,
        correctCount,
        wrongCount,
        percentage,
      },
      wrongFirst,
      correctAfter,
    });
  } catch (err) {
    console.error("attemptReview error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ BEST per paper (already)
========================================================= */
export const myCompletedPapers = async (req, res) => {
  try {
    const studentId = req.user?.id;
    if (!studentId) return res.status(401).json({ message: "Unauthorized" });

    const attempts = await PaperAttempt.find({
      studentId,
      status: "submitted",
      submittedAt: { $ne: null },
    })
      .sort({ submittedAt: -1 })
      .lean();

    if (!attempts.length) return res.status(200).json({ items: [] });

    const paperIds = [...new Set(attempts.map((a) => String(a.paperId)))];

    const papers = await Paper.find({ _id: { $in: paperIds } })
      .select("_id paperTitle paperType gradeId subjectId streamId streamSubjectId questionCount")
      .lean();

    const paperMap = new Map(papers.map((p) => [String(p._id), p]));

    const gradeIds = [...new Set(papers.map((p) => String(p.gradeId)).filter(Boolean))];
    const grades = await Grade.find({ _id: { $in: gradeIds } }).lean();
    const gradeMap = new Map(grades.map((g) => [String(g._id), g]));

    const bestMap = new Map();
    for (const a of attempts) {
      const pid = String(a.paperId);
      const curr = bestMap.get(pid);

      if (!curr) {
        bestMap.set(pid, a);
        continue;
      }

      const aCorrect = safeNum(a.correctCount, 0);
      const cCorrect = safeNum(curr.correctCount, 0);

      if (aCorrect > cCorrect) {
        bestMap.set(pid, a);
        continue;
      }

      if (aCorrect === cCorrect) {
        const aPct = safeNum(a.percentage, 0);
        const cPct = safeNum(curr.percentage, 0);

        if (aPct > cPct) {
          bestMap.set(pid, a);
          continue;
        }

        if (aPct === cPct) {
          const aTime = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const cTime = curr?.submittedAt ? new Date(curr.submittedAt).getTime() : 0;
          if (aTime > cTime) bestMap.set(pid, a);
        }
      }
    }

    const items = [...bestMap.entries()]
      .map(([paperId, a]) => {
        const p = paperMap.get(String(paperId));
        const g = p?.gradeId ? gradeMap.get(String(p.gradeId)) : null;

        const paperTitle = p?.paperTitle || "";
        const subject = p && g ? resolveSubjectName(p, g) : "Unknown Subject";

        const totalQuestions = safeNum(p?.questionCount, safeNum(a?.questionCount, 0));
        const correct = safeNum(a?.correctCount, 0);
        const percentage = safeNum(a?.percentage, 0);

        const coins = correct;

        return {
          paperId: String(paperId),
          paperTitle,
          subject,

          totalQuestions,
          correct,
          percentage,
          coins,

          attemptId: String(a?._id || ""),
          attemptNo: safeNum(a?.attemptNo, 1),
          completedAt: a?.submittedAt ? new Date(a.submittedAt).toISOString() : "",
        };
      })
      .sort((x, y) => {
        const xt = x.completedAt ? new Date(x.completedAt).getTime() : 0;
        const yt = y.completedAt ? new Date(y.completedAt).getTime() : 0;
        return yt - xt;
      });

    return res.status(200).json({ items });
  } catch (err) {
    console.error("myCompletedPapers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ NEW: GET /api/attempt/stats
   - totalFinishedExams = count of completed papers (best per paper)
   - totalCoins = sum of coins from best per paper
========================================================= */
export const myStats = async (req, res) => {
  try {
    const studentId = req.user?.id;
    if (!studentId) return res.status(401).json({ message: "Unauthorized" });

    const attempts = await PaperAttempt.find({
      studentId,
      status: "submitted",
      submittedAt: { $ne: null },
    })
      .sort({ submittedAt: -1 })
      .select("paperId correctCount percentage submittedAt")
      .lean();

    if (!attempts.length) {
      return res.status(200).json({
        totalCoins: 0,
        totalFinishedExams: 0,
      });
    }

    // pick best attempt per paper
    const bestMap = new Map(); // paperId -> bestAttempt
    for (const a of attempts) {
      const pid = String(a.paperId);
      const curr = bestMap.get(pid);

      if (!curr) {
        bestMap.set(pid, a);
        continue;
      }

      const aCorrect = safeNum(a.correctCount, 0);
      const cCorrect = safeNum(curr.correctCount, 0);

      if (aCorrect > cCorrect) {
        bestMap.set(pid, a);
        continue;
      }

      if (aCorrect === cCorrect) {
        const aPct = safeNum(a.percentage, 0);
        const cPct = safeNum(curr.percentage, 0);

        if (aPct > cPct) {
          bestMap.set(pid, a);
          continue;
        }

        if (aPct === cPct) {
          const aTime = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const cTime = curr?.submittedAt ? new Date(curr.submittedAt).getTime() : 0;
          if (aTime > cTime) bestMap.set(pid, a);
        }
      }
    }

    const totalFinishedExams = bestMap.size;

    // ✅ coins = correctCount (same rule)
    let totalCoins = 0;
    for (const [, a] of bestMap.entries()) {
      totalCoins += safeNum(a?.correctCount, 0);
    }

    return res.status(200).json({
      totalCoins,
      totalFinishedExams,
    });
  } catch (err) {
    console.error("myStats error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};