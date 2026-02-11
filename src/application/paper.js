import mongoose from "mongoose";
import Paper, { PAPER_TYPES, PAYMENT_TYPES, ATTEMPTS_ALLOWED } from "../infastructure/schemas/paper.js";
import Grade from "../infastructure/schemas/grade.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const toStr = (v) => String(v || "").trim();

const normalizePaperType = (v) => {
  const raw = toStr(v);
  if (!raw) return "";
  const lower = raw.toLowerCase();

  const map = new Map([
    ["daily quiz", "Daily Quiz"],
    ["topic wise paper", "Topic wise paper"],
    ["topic-wise paper", "Topic wise paper"],
    ["model paper", "Model paper"],
    ["past paper", "Past paper"],
  ]);

  return map.get(lower) || raw;
};

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

const attachMeta = async (paperLean) => {
  if (!paperLean) return null;
  const grade = await Grade.findById(paperLean.gradeId).lean();
  return {
    ...paperLean,
    meta: grade ? readablePaperMeta(paperLean, grade) : null,
  };
};

/* =========================================================
   ✅ ADMIN: FORM DATA (Grades + enums)
   GET /api/paper/form-data
========================================================= */
export const getPaperFormData = async (req, res) => {
  try {
    const grades = await Grade.find({ isActive: true }).sort({ grade: 1 }).lean();

    return res.status(200).json({
      enums: {
        paperTypes: PAPER_TYPES,
        paymentTypes: PAYMENT_TYPES,
        attemptsAllowed: ATTEMPTS_ALLOWED,
        maxTimeMinutes: 180,
        maxQuestionCount: 50,
      },
      grades,
    });
  } catch (err) {
    console.error("getPaperFormData error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: CREATE PAPER
   POST /api/paper
========================================================= */
export const createPaper = async (req, res) => {
  try {
    const {
      gradeId,
      subjectId,
      streamId,
      streamSubjectId,

      paperType,
      paperTitle,
      timeMinutes,
      questionCount,
      oneQuestionAnswersCount = 5,
      createdPersonName,

      payment = "free",
      amount = 0,
      attempts = 1,
      isActive = true,
    } = req.body;

    if (!isValidId(gradeId)) return res.status(400).json({ message: "Valid gradeId is required" });

    const grade = await Grade.findById(gradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const gradeNo = Number(grade.grade);

    const pType = normalizePaperType(paperType);
    if (!PAPER_TYPES.includes(pType)) {
      return res.status(400).json({ message: `paperType must be one of: ${PAPER_TYPES.join(", ")}` });
    }

    const title = toStr(paperTitle);
    if (!title) return res.status(400).json({ message: "paperTitle is required" });

    const t = Number(timeMinutes);
    if (!t || t < 1 || t > 180) return res.status(400).json({ message: "timeMinutes must be 1..180" });

    const qc = Number(questionCount);
    if (!qc || qc < 1 || qc > 50) return res.status(400).json({ message: "questionCount must be 1..50" });

    const oq = Number(oneQuestionAnswersCount);
    if (!oq || oq < 2 || oq > 10) {
      return res.status(400).json({ message: "oneQuestionAnswersCount must be 2..10" });
    }

    const creator = toStr(createdPersonName);
    if (!creator) return res.status(400).json({ message: "createdPersonName is required" });

    const pay = toStr(payment).toLowerCase();
    if (!PAYMENT_TYPES.includes(pay)) {
      return res.status(400).json({ message: `payment must be one of: ${PAYMENT_TYPES.join(", ")}` });
    }

    const att = Number(attempts);
    if (!ATTEMPTS_ALLOWED.includes(att)) {
      return res.status(400).json({ message: "attempts must be 1, 2, or 3" });
    }

    let finalSubjectId = null;
    let finalStreamId = null;
    let finalStreamSubjectId = null;

    if (is1to11(gradeNo)) {
      if (!isValidId(subjectId)) return res.status(400).json({ message: "subjectId is required for grades 1-11" });

      const ok = (grade.subjects || []).some((s) => String(s._id) === String(subjectId));
      if (!ok) return res.status(400).json({ message: "subjectId not found in this grade" });

      finalSubjectId = subjectId;
    } else if (is12or13(gradeNo)) {
      if (!isValidId(streamId)) return res.status(400).json({ message: "streamId is required for grade 12-13" });
      if (!isValidId(streamSubjectId)) {
        return res.status(400).json({ message: "streamSubjectId is required for grade 12-13" });
      }

      const st = (grade.streams || []).find((x) => String(x._id) === String(streamId));
      if (!st) return res.status(400).json({ message: "streamId not found in this grade" });

      const ok = (st.subjects || []).some((s) => String(s._id) === String(streamSubjectId));
      if (!ok) return res.status(400).json({ message: "streamSubjectId not found in this stream" });

      finalStreamId = streamId;
      finalStreamSubjectId = streamSubjectId;
    } else {
      return res.status(400).json({ message: "Invalid grade number" });
    }

    let finalAmount = 0;
    if (pay === "paid") {
      const a = Number(amount);
      if (!a || a <= 0) return res.status(400).json({ message: "amount must be > 0 for paid papers" });
      finalAmount = a;
    }

    const doc = await Paper.create({
      gradeId,
      subjectId: finalSubjectId,
      streamId: finalStreamId,
      streamSubjectId: finalStreamSubjectId,

      paperType: pType,
      paperTitle: title,

      timeMinutes: t,
      questionCount: qc,
      oneQuestionAnswersCount: oq,

      createdPersonName: creator,

      payment: pay,
      amount: finalAmount,
      attempts: att,

      isActive: Boolean(isActive),
      createdBy: req.user?.id || null,
    });

    const paperWithMeta = await attachMeta(doc.toObject());

    return res.status(201).json({ message: "Paper created", paper: paperWithMeta });
  } catch (err) {
    console.error("createPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: GET ALL PAPERS
   GET /api/paper
========================================================= */
export const getAllPapers = async (req, res) => {
  try {
    const list = await Paper.find().sort({ createdAt: -1 }).lean();

    const gradeIds = [...new Set(list.map((p) => String(p.gradeId)))];
    const grades = await Grade.find({ _id: { $in: gradeIds } }).lean();
    const gradeMap = new Map(grades.map((g) => [String(g._id), g]));

    const papers = list.map((p) => {
      const g = gradeMap.get(String(p.gradeId)) || null;
      return { ...p, meta: g ? readablePaperMeta(p, g) : null };
    });

    return res.status(200).json({ papers });
  } catch (err) {
    console.error("getAllPapers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: UPDATE PAPER (NOW supports grade/subject/stream edit)
   PATCH /api/paper/:paperId
========================================================= */
export const updatePaperById = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const existing = await Paper.findById(paperId).lean();
    if (!existing) return res.status(404).json({ message: "Paper not found" });

    // ✅ decide target grade
    const nextGradeId = req.body.gradeId !== undefined ? req.body.gradeId : existing.gradeId;
    if (!isValidId(nextGradeId)) return res.status(400).json({ message: "Valid gradeId is required" });

    const grade = await Grade.findById(nextGradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const gradeNo = Number(grade.grade);

    const patch = {};
    patch.gradeId = nextGradeId;

    // ✅ grade-based subject/stream edits
    if (is1to11(gradeNo)) {
      const nextSubjectId =
        req.body.subjectId !== undefined ? req.body.subjectId : existing.subjectId;

      if (!isValidId(nextSubjectId)) {
        return res.status(400).json({ message: "subjectId is required for grades 1-11" });
      }

      const ok = (grade.subjects || []).some((s) => String(s._id) === String(nextSubjectId));
      if (!ok) return res.status(400).json({ message: "subjectId not found in this grade" });

      patch.subjectId = nextSubjectId;
      patch.streamId = null;
      patch.streamSubjectId = null;
    } else if (is12or13(gradeNo)) {
      const nextStreamId =
        req.body.streamId !== undefined ? req.body.streamId : existing.streamId;
      const nextStreamSubjectId =
        req.body.streamSubjectId !== undefined ? req.body.streamSubjectId : existing.streamSubjectId;

      if (!isValidId(nextStreamId)) return res.status(400).json({ message: "streamId is required for grade 12-13" });
      if (!isValidId(nextStreamSubjectId)) {
        return res.status(400).json({ message: "streamSubjectId is required for grade 12-13" });
      }

      const st = (grade.streams || []).find((x) => String(x._id) === String(nextStreamId));
      if (!st) return res.status(400).json({ message: "streamId not found in this grade" });

      const ok = (st.subjects || []).some((s) => String(s._id) === String(nextStreamSubjectId));
      if (!ok) return res.status(400).json({ message: "streamSubjectId not found in this stream" });

      patch.subjectId = null;
      patch.streamId = nextStreamId;
      patch.streamSubjectId = nextStreamSubjectId;
    } else {
      return res.status(400).json({ message: "Invalid grade number" });
    }

    // ✅ other fields (same validation)
    if (req.body.paperTitle !== undefined) {
      const v = toStr(req.body.paperTitle);
      if (!v) return res.status(400).json({ message: "paperTitle is required" });
      patch.paperTitle = v;
    }

    if (req.body.createdPersonName !== undefined) {
      const v = toStr(req.body.createdPersonName);
      if (!v) return res.status(400).json({ message: "createdPersonName is required" });
      patch.createdPersonName = v;
    }

    if (req.body.paperType !== undefined) {
      const pType = normalizePaperType(req.body.paperType);
      if (!PAPER_TYPES.includes(pType)) {
        return res.status(400).json({ message: `paperType must be one of: ${PAPER_TYPES.join(", ")}` });
      }
      patch.paperType = pType;
    }

    if (req.body.timeMinutes !== undefined) {
      const t = Number(req.body.timeMinutes);
      if (!t || t < 1 || t > 180) return res.status(400).json({ message: "timeMinutes must be 1..180" });
      patch.timeMinutes = t;
    }

    if (req.body.questionCount !== undefined) {
      const qc = Number(req.body.questionCount);
      if (!qc || qc < 1 || qc > 50) return res.status(400).json({ message: "questionCount must be 1..50" });
      patch.questionCount = qc;
    }

    if (req.body.oneQuestionAnswersCount !== undefined) {
      const oq = Number(req.body.oneQuestionAnswersCount);
      if (!oq || oq < 2 || oq > 10) return res.status(400).json({ message: "oneQuestionAnswersCount must be 2..10" });
      patch.oneQuestionAnswersCount = oq;
    }

    if (req.body.attempts !== undefined) {
      const att = Number(req.body.attempts);
      if (!ATTEMPTS_ALLOWED.includes(att)) return res.status(400).json({ message: "attempts must be 1, 2, or 3" });
      patch.attempts = att;
    }

    if (req.body.payment !== undefined) {
      const pay = toStr(req.body.payment).toLowerCase();
      if (!PAYMENT_TYPES.includes(pay)) {
        return res.status(400).json({ message: `payment must be one of: ${PAYMENT_TYPES.join(", ")}` });
      }
      patch.payment = pay;

      if (pay === "paid") {
        const a = Number(req.body.amount);
        if (!a || a <= 0) return res.status(400).json({ message: "amount must be > 0 for paid papers" });
        patch.amount = a;
      } else {
        patch.amount = 0;
      }
    } else if (req.body.amount !== undefined) {
      return res.status(400).json({ message: "Provide payment together with amount" });
    }

    if (req.body.isActive !== undefined) patch.isActive = Boolean(req.body.isActive);

    const updated = await Paper.findByIdAndUpdate(paperId, patch, { new: true }).lean();
    const updatedWithMeta = await attachMeta(updated);

    return res.status(200).json({ message: "Paper updated", paper: updatedWithMeta });
  } catch (err) {
    console.error("updatePaperById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: DELETE PAPER
   DELETE /api/paper/:paperId
========================================================= */
export const deletePaperById = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const deleted = await Paper.findByIdAndDelete(paperId);
    if (!deleted) return res.status(404).json({ message: "Paper not found" });

    return res.status(200).json({ message: "Paper deleted" });
  } catch (err) {
    console.error("deletePaperById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
