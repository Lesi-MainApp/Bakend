import mongoose from "mongoose";
import Paper from "../infastructure/schemas/paper.js";
import Question from "../infastructure/schemas/question.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const norm = (v) => String(v || "").trim();

const uniqSortedNums = (arr) =>
  [...new Set((arr || []).map(Number).filter((n) => Number.isFinite(n)))]
    .sort((a, b) => a - b);

const getPaperProgress = async (paperId) => {
  const paper = await Paper.findById(paperId).lean();
  if (!paper) return null;

  const currentCount = await Question.countDocuments({ paperId });
  const requiredCount = Number(paper.questionCount || 0);

  return {
    paperId,
    requiredCount,
    currentCount,
    remaining: Math.max(requiredCount - currentCount, 0),
    isComplete: currentCount >= requiredCount,
    oneQuestionAnswersCount: Number(paper.oneQuestionAnswersCount || 4),
  };
};

// =======================================================
// ADMIN: CREATE QUESTION
// POST /api/question
// =======================================================
export const createQuestion = async (req, res) => {
  try {
    const {
      paperId,
      questionNumber,
      lessonName = "",
      question,
      answers,

      // ✅ new multi correct
      correctAnswerIndexes,

      // ✅ old single correct support (optional)
      correctAnswerIndex,

      point = 5,
      explanationVideoUrl = "",
      explanationText = "",
      imageUrl = "",
    } = req.body;

    if (!paperId || !isValidId(paperId)) {
      return res.status(400).json({ message: "Valid paperId is required" });
    }

    const qNo = Number(questionNumber);
    if (!qNo || qNo < 1) {
      return res.status(400).json({ message: "questionNumber must be >= 1" });
    }

    if (!norm(question)) {
      return res.status(400).json({ message: "question is required" });
    }

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    // stop if paper already full
    const currentCount = await Question.countDocuments({ paperId });
    if (currentCount >= Number(paper.questionCount)) {
      return res.status(400).json({
        message: `Question limit reached for this paper (max ${paper.questionCount})`,
      });
    }

    // ✅ answers: allow 1..6 (your requirement)
    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: "answers must be an array" });
    }

    const cleanedAnswers = answers.map((a) => norm(a)).filter(Boolean);
    if (cleanedAnswers.length < 1 || cleanedAnswers.length > 6) {
      return res.status(400).json({ message: "answers must be 1..6 items" });
    }

    // ✅ correct indexes: accept array OR fallback single
    let idxs = [];
    if (Array.isArray(correctAnswerIndexes)) {
      idxs = uniqSortedNums(correctAnswerIndexes);
    } else if (correctAnswerIndex !== undefined && correctAnswerIndex !== null) {
      idxs = uniqSortedNums([Number(correctAnswerIndex)]);
    }

    if (idxs.length < 1) {
      return res.status(400).json({ message: "Select at least 1 correct answer" });
    }

    const bad = idxs.some((i) => i < 0 || i >= cleanedAnswers.length);
    if (bad) {
      return res.status(400).json({
        message: `correctAnswerIndexes must be between 0 and ${cleanedAnswers.length - 1}`,
      });
    }

    const doc = await Question.create({
      paperId,
      questionNumber: qNo,
      lessonName: norm(lessonName),
      question: norm(question),
      answers: cleanedAnswers,
      correctAnswerIndexes: idxs,

      point: Number(point || 5),
      explanationVideoUrl: norm(explanationVideoUrl),
      explanationText: norm(explanationText),
      imageUrl: norm(imageUrl),

      createdBy: req.user?.id || null,
    });

    const progress = await getPaperProgress(paperId);

    return res.status(201).json({
      message: "Question created",
      question: doc,
      progress,
    });
  } catch (err) {
    console.error("createQuestion error:", err);
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate questionNumber for this paper" });
    }
    return res.status(500).json({
      message: "Internal server error",
      errorName: err?.name,
      errorMessage: err?.message,
    });
  }
};

// =======================================================
// ADMIN: GET QUESTIONS BY PAPER
// GET /api/question/paper/:paperId
// =======================================================
export const getQuestionsByPaper = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const list = await Question.find({ paperId }).sort({ questionNumber: 1 }).lean();

    // ✅ always normalize correctAnswerIndexes (supports old docs)
    const normalized = list.map((q) => {
      const multi = Array.isArray(q.correctAnswerIndexes) ? q.correctAnswerIndexes : [];
      if (multi.length) return { ...q, correctAnswerIndexes: uniqSortedNums(multi) };

      // old docs support
      const oldIdx = Number(q.correctAnswerIndex);
      if (Number.isFinite(oldIdx)) return { ...q, correctAnswerIndexes: [oldIdx] };

      return { ...q, correctAnswerIndexes: [] };
    });

    const progress = await getPaperProgress(paperId);

    return res.status(200).json({ paper, questions: normalized, progress });
  } catch (err) {
    console.error("getQuestionsByPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ADMIN: UPDATE QUESTION (multi correct supported)
// PATCH /api/question/:questionId
// =======================================================
export const updateQuestionById = async (req, res) => {
  try {
    const { questionId } = req.params;
    if (!isValidId(questionId)) return res.status(400).json({ message: "Invalid questionId" });

    const existing = await Question.findById(questionId).lean();
    if (!existing) return res.status(404).json({ message: "Question not found" });

    const patch = {};

    if (req.body.question !== undefined) {
      const v = norm(req.body.question);
      if (!v) return res.status(400).json({ message: "question is required" });
      patch.question = v;
    }

    if (req.body.lessonName !== undefined) patch.lessonName = norm(req.body.lessonName);
    if (req.body.explanationVideoUrl !== undefined) patch.explanationVideoUrl = norm(req.body.explanationVideoUrl);
    if (req.body.explanationText !== undefined) patch.explanationText = norm(req.body.explanationText);
    if (req.body.imageUrl !== undefined) patch.imageUrl = norm(req.body.imageUrl);

    let nextAnswers = null;
    if (req.body.answers !== undefined) {
      if (!Array.isArray(req.body.answers)) return res.status(400).json({ message: "answers must be an array" });
      const cleaned = req.body.answers.map((a) => norm(a)).filter(Boolean);
      if (cleaned.length < 1 || cleaned.length > 6) return res.status(400).json({ message: "answers must be 1..6" });
      nextAnswers = cleaned;
      patch.answers = cleaned;
    }

    // ✅ correct indexes update
    let idxs = null;

    if (req.body.correctAnswerIndexes !== undefined) {
      if (!Array.isArray(req.body.correctAnswerIndexes)) {
        return res.status(400).json({ message: "correctAnswerIndexes must be an array" });
      }
      idxs = uniqSortedNums(req.body.correctAnswerIndexes);
    } else if (req.body.correctAnswerIndex !== undefined) {
      idxs = uniqSortedNums([Number(req.body.correctAnswerIndex)]);
    }

    if (idxs !== null) {
      if (idxs.length < 1) return res.status(400).json({ message: "Select at least 1 correct answer" });
      const answersToValidate = nextAnswers || existing.answers || [];
      const bad = idxs.some((i) => i < 0 || i >= answersToValidate.length);
      if (bad) {
        return res.status(400).json({
          message: `correctAnswerIndexes must be between 0 and ${Math.max(answersToValidate.length - 1, 0)}`,
        });
      }
      patch.correctAnswerIndexes = idxs;
    } else if (nextAnswers) {
      // answers changed but correct not sent -> keep old or [0]
      const old = uniqSortedNums(existing.correctAnswerIndexes || []);
      const filtered = old.filter((i) => i >= 0 && i < nextAnswers.length);
      patch.correctAnswerIndexes = filtered.length ? filtered : [0];
    }

    if (req.body.point !== undefined) patch.point = Number(req.body.point || 0);

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updated = await Question.findByIdAndUpdate(questionId, patch, { new: true }).lean();

    return res.status(200).json({
      message: "Question updated",
      question: {
        ...updated,
        correctAnswerIndexes: Array.isArray(updated.correctAnswerIndexes)
          ? uniqSortedNums(updated.correctAnswerIndexes)
          : [],
      },
    });
  } catch (err) {
    console.error("updateQuestionById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
