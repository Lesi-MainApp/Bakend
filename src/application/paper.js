// backend/application/paper.js
import mongoose from "mongoose";
import Paper, {
  PAPER_TYPES,
  PAYMENT_TYPES,
  ATTEMPTS_ALLOWED,
} from "../infastructure/schemas/paper.js";
import Grade from "../infastructure/schemas/grade.js";
import Question from "../infastructure/schemas/question.js";

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
      (grade.subjects || []).find((s) => String(s._id) === String(paper.subjectId))
        ?.subject || "Unknown Subject";
  } else if (is12or13(gNo)) {
    const st = (grade.streams || []).find((x) => String(x._id) === String(paper.streamId));
    stream = st?.stream || "Unknown Stream";
    subject =
      (st?.subjects || []).find((s) => String(s._id) === String(paper.streamSubjectId))
        ?.subject || "Unknown Subject";
  }

  return { grade: gNo, stream, subject };
};

const getProgressForPaper = async (paper) => {
  const requiredCount = Number(paper?.questionCount || 0);
  const currentCount = await Question.countDocuments({ paperId: paper._id });

  return {
    paperId: String(paper._id),
    requiredCount,
    currentCount,
    remaining: Math.max(requiredCount - currentCount, 0),
    isComplete: currentCount >= requiredCount,
    oneQuestionAnswersCount: Number(paper?.oneQuestionAnswersCount || 0),
  };
};

const computeStatus = (paper, progress) => {
  if (paper?.isPublished) return "publish";
  if (progress?.isComplete) return "complete";
  return "in_progress";
};

/* =========================================================
   ✅ ADMIN: FORM DATA
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
        minAnswerCount: 1,
        maxAnswerCount: 6,
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
      oneQuestionAnswersCount = 4,
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
    if (!oq || oq < 1 || oq > 6) {
      return res.status(400).json({ message: "oneQuestionAnswersCount must be 1..6" });
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

      isPublished: false,
      publishedAt: null,

      isActive: Boolean(isActive),
      createdBy: req.user?.id || null,
    });

    const gradeMeta = readablePaperMeta(doc.toObject(), grade);
    const progress = await getProgressForPaper(doc.toObject());
    const status = computeStatus(doc.toObject(), progress);

    return res.status(201).json({
      message: "Paper created",
      paper: { ...doc.toObject(), meta: gradeMeta, progress, status },
    });
  } catch (err) {
    console.error("createPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: GET ALL PAPERS (with progress + status)
========================================================= */
export const getAllPapers = async (req, res) => {
  try {
    const list = await Paper.find().sort({ createdAt: -1 }).lean();

    const gradeIds = [...new Set(list.map((p) => String(p.gradeId)))];
    const grades = await Grade.find({ _id: { $in: gradeIds } }).lean();
    const gradeMap = new Map(grades.map((g) => [String(g._id), g]));

    const papers = await Promise.all(
      list.map(async (p) => {
        const g = gradeMap.get(String(p.gradeId)) || null;
        const meta = g ? readablePaperMeta(p, g) : null;
        const progress = await getProgressForPaper(p);
        const status = computeStatus(p, progress);
        return { ...p, meta, progress, status };
      })
    );

    return res.status(200).json({ papers });
  } catch (err) {
    console.error("getAllPapers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: UPDATE PAPER
========================================================= */
export const updatePaperById = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const existing = await Paper.findById(paperId).lean();
    if (!existing) return res.status(404).json({ message: "Paper not found" });

    if (existing.isPublished) {
      return res.status(400).json({ message: "Published paper cannot be edited" });
    }

    const nextGradeId = req.body.gradeId !== undefined ? req.body.gradeId : existing.gradeId;
    if (!isValidId(nextGradeId)) return res.status(400).json({ message: "Valid gradeId is required" });

    const grade = await Grade.findById(nextGradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const gradeNo = Number(grade.grade);

    const patch = {};
    patch.gradeId = nextGradeId;

    if (is1to11(gradeNo)) {
      const nextSubjectId = req.body.subjectId !== undefined ? req.body.subjectId : existing.subjectId;

      if (!isValidId(nextSubjectId)) {
        return res.status(400).json({ message: "subjectId is required for grades 1-11" });
      }

      const ok = (grade.subjects || []).some((s) => String(s._id) === String(nextSubjectId));
      if (!ok) return res.status(400).json({ message: "subjectId not found in this grade" });

      patch.subjectId = nextSubjectId;
      patch.streamId = null;
      patch.streamSubjectId = null;
    } else if (is12or13(gradeNo)) {
      const nextStreamId = req.body.streamId !== undefined ? req.body.streamId : existing.streamId;
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
      if (!oq || oq < 1 || oq > 6) {
        return res.status(400).json({ message: "oneQuestionAnswersCount must be 1..6" });
      }
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

    const g = await Grade.findById(updated.gradeId).lean();
    const meta = g ? readablePaperMeta(updated, g) : null;
    const progress = await getProgressForPaper(updated);
    const status = computeStatus(updated, progress);

    return res.status(200).json({ message: "Paper updated", paper: { ...updated, meta, progress, status } });
  } catch (err) {
    console.error("updatePaperById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: DELETE PAPER
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

/* =========================================================
   ✅ ADMIN: PUBLISH PAPER (ONLY if complete)
========================================================= */
export const publishPaperById = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const paper = await Paper.findById(paperId).lean();
    if (!paper) return res.status(404).json({ message: "Paper not found" });

    if (paper.isPublished) {
      return res.status(400).json({ message: "Paper already published" });
    }

    const progress = await getProgressForPaper(paper);
    if (!progress.isComplete) {
      return res.status(400).json({ message: "Only complete papers can be published" });
    }

    const updated = await Paper.findByIdAndUpdate(
      paperId,
      { isPublished: true, publishedAt: new Date() },
      { new: true }
    ).lean();

    const g = await Grade.findById(updated.gradeId).lean();
    const meta = g ? readablePaperMeta(updated, g) : null;
    const nextProgress = await getProgressForPaper(updated);
    const status = computeStatus(updated, nextProgress);

    return res.status(200).json({
      message: "Paper published",
      paper: { ...updated, meta, progress: nextProgress, status },
    });
  } catch (err) {
    console.error("publishPaperById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ PUBLIC: GET PUBLISHED PAPERS FOR STUDENT APP
   GET /api/paper/public?gradeNumber=10&paperType=Model%20paper&subject=Science
   GET /api/paper/public?gradeNumber=12&paperType=Model%20paper&stream=Maths&subject=Physics
========================================================= */
export const getPublishedPapersPublic = async (req, res) => {
  try {
    const gradeNumber = Number(req.query?.gradeNumber);
    const paperType = normalizePaperType(req.query?.paperType || "Model paper");
    const subjectName = toStr(req.query?.subject);
    const streamName = toStr(req.query?.stream);

    if (!gradeNumber || gradeNumber < 1 || gradeNumber > 13) {
      return res.status(400).json({ message: "Invalid gradeNumber" });
    }

    if (!PAPER_TYPES.includes(paperType)) {
      return res.status(400).json({ message: `paperType must be one of: ${PAPER_TYPES.join(", ")}` });
    }

    const gradeDoc = await Grade.findOne({ grade: gradeNumber, isActive: true }).lean();
    if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

    const gradeId = String(gradeDoc._id);

    const query = {
      gradeId,
      paperType,
      isActive: true,
      isPublished: true,
    };

    if (is1to11(gradeNumber)) {
      if (!subjectName) return res.status(400).json({ message: "subject is required" });

      const sub = (gradeDoc.subjects || []).find(
        (s) => toStr(s.subject).toLowerCase() === subjectName.toLowerCase()
      );
      if (!sub) return res.status(404).json({ message: "Subject not found for this grade" });

      query.subjectId = String(sub._id);
    } else if (is12or13(gradeNumber)) {
      if (!streamName) return res.status(400).json({ message: "stream is required for A/L" });
      if (!subjectName) return res.status(400).json({ message: "subject is required" });

      const st = (gradeDoc.streams || []).find(
        (x) => toStr(x.stream).toLowerCase() === streamName.toLowerCase()
      );
      if (!st) return res.status(404).json({ message: "Stream not found for this grade" });

      const sub = (st.subjects || []).find(
        (s) => toStr(s.subject).toLowerCase() === subjectName.toLowerCase()
      );
      if (!sub) return res.status(404).json({ message: "Subject not found for this stream" });

      query.streamId = String(st._id);
      query.streamSubjectId = String(sub._id);
    }

    const papers = await Paper.find(query).sort({ createdAt: -1 }).lean();

    // return minimal fields for mobile UI
    const formatted = papers.map((p) => ({
      _id: String(p._id),
      paperTitle: p.paperTitle,
      questionCount: Number(p.questionCount || 0),
      timeMinutes: Number(p.timeMinutes || 0),
      attempts: Number(p.attempts || 1),
      payment: p.payment,
      amount: Number(p.amount || 0),
    }));

    return res.status(200).json({ papers: formatted });
  } catch (err) {
    console.error("getPublishedPapersPublic error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
