import mongoose from "mongoose";
import Paper from "../infastructure/schemas/paper.js";
import Question from "../infastructure/schemas/question.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
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
// ADMIN: CREATE QUESTION (until paper.questionCount is full)
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
    } = req.body;

    if (!paperId || !isValidId(paperId)) return res.status(400).json({ message: "Valid paperId is required" });
    if (questionNumber === undefined) return res.status(400).json({ message: "questionNumber is required" });
    if (!question) return res.status(400).json({ message: "question is required" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    // ✅ stop if paper already has full questions
    const currentCount = await Question.countDocuments({ paperId });
    if (currentCount >= Number(paper.questionCount)) {
      return res.status(400).json({
        message: `Question limit reached for this paper (max ${paper.questionCount})`,
      });
    }

    // ✅ answers validation based on paper.oneQuestionAnswersCount
    const requiredAnswers = Number(paper.oneQuestionAnswersCount);
    if (!Array.isArray(answers)) return res.status(400).json({ message: "answers must be an array" });

    const cleanedAnswers = answers.map((a) => norm(a)).filter(Boolean);

    if (cleanedAnswers.length !== requiredAnswers) {
      return res.status(400).json({
        message: `This paper requires exactly ${requiredAnswers} answers per question`,
      });
    }

    const qNo = Number(questionNumber);
    if (!qNo || qNo < 1) return res.status(400).json({ message: "questionNumber must be >= 1" });

    const correctIdx = Number(correctAnswerIndex);
    if (Number.isNaN(correctIdx) || correctIdx < 0 || correctIdx >= cleanedAnswers.length) {
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
    if (err.code === 11000) return res.status(409).json({ message: "Duplicate questionNumber for this paper" });

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
    const progress = await getPaperProgress(paperId);

    return res.status(200).json({ paper, questions: list, progress });
  } catch (err) {
    console.error("getQuestionsByPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ADMIN: UPDATE QUESTION
// PATCH /api/question/:questionId
// =======================================================
export const updateQuestionById = async (req, res) => {
  try {
    const { questionId } = req.params;
    if (!isValidId(questionId)) return res.status(400).json({ message: "Invalid questionId" });

    const doc = await Question.findById(questionId);
    if (!doc) return res.status(404).json({ message: "Question not found" });

    const paper = await Paper.findById(doc.paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    const {
      questionNumber,
      lessonName,
      question,
      answers,
      correctAnswerIndex,
      point,
      explanationVideoUrl,
      isActive,
    } = req.body;

    // ✅ if changing answers, must still match paper.oneQuestionAnswersCount
    if (answers !== undefined) {
      if (!Array.isArray(answers)) return res.status(400).json({ message: "answers must be an array" });

      const requiredAnswers = Number(paper.oneQuestionAnswersCount);
      const cleanedAnswers = answers.map((a) => norm(a)).filter(Boolean);

      if (cleanedAnswers.length !== requiredAnswers) {
        return res.status(400).json({
          message: `This paper requires exactly ${requiredAnswers} answers per question`,
        });
      }

      doc.answers = cleanedAnswers;

      // if answers changed, validate correctAnswerIndex
      const idx = correctAnswerIndex !== undefined ? Number(correctAnswerIndex) : doc.correctAnswerIndex;
      if (Number.isNaN(idx) || idx < 0 || idx >= cleanedAnswers.length) {
        return res.status(400).json({ message: "correctAnswerIndex is invalid" });
      }
      doc.correctAnswerIndex = idx;
    }

    if (correctAnswerIndex !== undefined && answers === undefined) {
      const idx = Number(correctAnswerIndex);
      if (Number.isNaN(idx) || idx < 0 || idx >= (doc.answers || []).length) {
        return res.status(400).json({ message: "correctAnswerIndex is invalid" });
      }
      doc.correctAnswerIndex = idx;
    }

    if (questionNumber !== undefined) {
      const qNo = Number(questionNumber);
      if (!qNo || qNo < 1) return res.status(400).json({ message: "questionNumber must be >= 1" });
      doc.questionNumber = qNo;
    }

    if (lessonName !== undefined) doc.lessonName = norm(lessonName);
    if (question !== undefined) doc.question = norm(question);
    if (point !== undefined) doc.point = Number(point || 0);
    if (explanationVideoUrl !== undefined) doc.explanationVideoUrl = norm(explanationVideoUrl);
    if (isActive !== undefined) doc.isActive = Boolean(isActive);

    await doc.save();

    const progress = await getPaperProgress(doc.paperId);

    return res.status(200).json({ message: "Question updated", question: doc, progress });
  } catch (err) {
    console.error("updateQuestionById error:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Duplicate questionNumber for this paper" });

    return res.status(500).json({
      message: "Internal server error",
      errorName: err?.name,
      errorMessage: err?.message,
    });
  }
};

// =======================================================
// ADMIN: DELETE QUESTION
// DELETE /api/question/:questionId
// =======================================================
export const deleteQuestionById = async (req, res) => {
  try {
    const { questionId } = req.params;
    if (!isValidId(questionId)) return res.status(400).json({ message: "Invalid questionId" });

    const doc = await Question.findByIdAndDelete(questionId);
    if (!doc) return res.status(404).json({ message: "Question not found" });

    const progress = await getPaperProgress(doc.paperId);

    return res.status(200).json({ message: "Question deleted", progress });
  } catch (err) {
    console.error("deleteQuestionById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
