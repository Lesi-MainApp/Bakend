import mongoose from "mongoose";
import Paper from "../infastructure/schemas/paper.js";
import Question from "../infastructure/schemas/question.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const norm = (v) => String(v || "").trim();

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
    oneQuestionAnswersCount: Number(paper.oneQuestionAnswersCount || 0),
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
      correctAnswerIndex,
      point = 5,

      explanationVideoUrl = "",
      explanationText = "",

      imageUrl = "",
    } = req.body;

    if (!paperId || !isValidId(paperId)) {
      return res.status(400).json({ message: "Valid paperId is required" });
    }
    if (questionNumber === undefined) {
      return res.status(400).json({ message: "questionNumber is required" });
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

    // answers validation based on paper.oneQuestionAnswersCount
    const requiredAnswers = Number(paper.oneQuestionAnswersCount || 0);
    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: "answers must be an array" });
    }

    const cleanedAnswers = answers.map((a) => norm(a)).filter(Boolean);

    if (cleanedAnswers.length !== requiredAnswers) {
      return res.status(400).json({
        message: `This paper requires exactly ${requiredAnswers} answers per question`,
      });
    }

    const qNo = Number(questionNumber);
    if (!qNo || qNo < 1) {
      return res.status(400).json({ message: "questionNumber must be >= 1" });
    }

    const correctIdx = Number(correctAnswerIndex);
    if (
      Number.isNaN(correctIdx) ||
      correctIdx < 0 ||
      correctIdx >= cleanedAnswers.length
    ) {
      return res.status(400).json({ message: "correctAnswerIndex is invalid" });
    }

    const doc = await Question.create({
      paperId,
      questionNumber: qNo,
      lessonName: norm(lessonName),
      question: norm(question),
      answers: cleanedAnswers,
      correctAnswerIndex: correctIdx,
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
      return res
        .status(409)
        .json({ message: "Duplicate questionNumber for this paper" });
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
    if (!isValidId(paperId))
      return res.status(400).json({ message: "Invalid paperId" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const list = await Question.find({ paperId })
      .sort({ questionNumber: 1 })
      .lean();

    const progress = await getPaperProgress(paperId);

    return res.status(200).json({ paper, questions: list, progress });
  } catch (err) {
    console.error("getQuestionsByPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ADMIN: UPDATE QUESTION (ONLY question + answers + correctAnswerIndex)
// PATCH /api/question/:questionId
// =======================================================
export const updateQuestionById = async (req, res) => {
  try {
    const { questionId } = req.params;
    if (!isValidId(questionId)) {
      return res.status(400).json({ message: "Invalid questionId" });
    }

    const existing = await Question.findById(questionId).lean();
    if (!existing) return res.status(404).json({ message: "Question not found" });

    // Only allow updating these fields:
    const nextQuestion =
      req.body.question !== undefined ? norm(req.body.question) : null;
    const nextAnswersRaw =
      req.body.answers !== undefined ? req.body.answers : null;
    const nextCorrectIndex =
      req.body.correctAnswerIndex !== undefined
        ? Number(req.body.correctAnswerIndex)
        : null;

    const patch = {};

    if (nextQuestion !== null) {
      if (!nextQuestion) return res.status(400).json({ message: "question is required" });
      patch.question = nextQuestion;
    }

    if (nextAnswersRaw !== null) {
      if (!Array.isArray(nextAnswersRaw))
        return res.status(400).json({ message: "answers must be an array" });

      const cleanedAnswers = nextAnswersRaw.map((a) => norm(a)).filter(Boolean);
      if (cleanedAnswers.length < 1) {
        return res.status(400).json({ message: "answers must have at least 1 item" });
      }
      patch.answers = cleanedAnswers;

      // if answers updated but correct index not provided, keep old index if valid
      if (nextCorrectIndex === null) {
        const oldIdx = Number(existing.correctAnswerIndex || 0);
        patch.correctAnswerIndex =
          oldIdx >= 0 && oldIdx < cleanedAnswers.length ? oldIdx : 0;
      }
    }

    if (nextCorrectIndex !== null) {
      if (Number.isNaN(nextCorrectIndex) || nextCorrectIndex < 0) {
        return res.status(400).json({ message: "correctAnswerIndex is invalid" });
      }

      // validate against either new answers (if provided) or existing answers
      const answersToValidate =
        patch.answers || existing.answers || [];

      if (nextCorrectIndex >= answersToValidate.length) {
        return res.status(400).json({
          message: `correctAnswerIndex must be between 0 and ${Math.max(
            answersToValidate.length - 1,
            0
          )}`,
        });
      }

      patch.correctAnswerIndex = nextCorrectIndex;
    }

    // If nothing to update
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updated = await Question.findByIdAndUpdate(questionId, patch, {
      new: true,
    }).lean();

    return res.status(200).json({ message: "Question updated", question: updated });
  } catch (err) {
    console.error("updateQuestionById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
