import mongoose from "mongoose";
import Grade from "../infastructure/schemas/grade.js";
import Paper from "../infastructure/schemas/paper.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const norm = (v) => String(v || "").trim();
const low = (v) => norm(v).toLowerCase();

const is1to11 = (g) => g >= 1 && g <= 11;
const is12or13 = (g) => g === 12 || g === 13;

const getReadablePaper = (paperDoc, gradeDoc) => {
  if (!paperDoc) return null;

  const g = gradeDoc || paperDoc.gradeId; // if populated
  const gradeNo = g?.grade;

  let subjectName = null;
  let streamName = null;

  if (gradeNo && is1to11(Number(gradeNo))) {
    subjectName =
      (g?.subjects || []).find((s) => String(s._id) === String(paperDoc.subjectId))?.subject || "Unknown*Unknown Subject";
  }

  if (gradeNo && is12or13(Number(gradeNo))) {
    const stream =
      (g?.streams || []).find((st) => String(st._id) === String(paperDoc.streamId)) || null;
    streamName = stream?.stream || "*Unknown Stream";
    subjectName =
      (stream?.subjects || []).find((s) => String(s._id) === String(paperDoc.streamSubjectId))?.subject ||
      "*Unknown Subject";
  }

  return {
    ...paperDoc,
    readable: {
      grade: gradeNo,
      stream: streamName,
      subject: subjectName,
    },
  };
};

// =======================================================
// ✅ FORM DATA (Admin): available grades + subjects + streams
// GET /api/paper/form-data
// =======================================================
export const getPaperFormData = async (req, res) => {
  try {
    const grades = await Grade.find({ isActive: true })
      .select("grade subjects streams")
      .sort({ grade: 1 })
      .lean();

    return res.status(200).json({
      grades,
      note:
        "For grade 1-11 use subjectId from grade.subjects[]. For grade 12-13 use streamId from grade.streams[] and streamSubjectId from grade.streams[i].subjects[].",
    });
  } catch (err) {
    console.error("getPaperFormData error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ CREATE PAPER (Admin only)
// POST /api/paper
// =======================================================
export const createPaper = async (req, res) => {
  try {
    const {
      gradeId,
      paperType,
      paperTitle,
      timeMinutes,
      questionCount,
      oneQuestionAnswersCount = 5,
      createdPersonName,
      payment = "free",
      amount = 0,
      attempts = 1,

      // relationship fields
      subjectId, // for 1-11
      streamId, // for 12-13
      streamSubjectId, // for 12-13
    } = req.body;

    if (!gradeId || !isValidId(gradeId)) return res.status(400).json({ message: "Valid gradeId is required" });
    if (!paperType || !paperTitle) return res.status(400).json({ message: "paperType and paperTitle are required" });

    const t = Number(timeMinutes);
    const qc = Number(questionCount);
    const ansC = Number(oneQuestionAnswersCount);

    if (!t || t < 1) return res.status(400).json({ message: "timeMinutes must be >= 1" });
    if (!qc || qc < 1) return res.status(400).json({ message: "questionCount must be >= 1" });
    if (!ansC || ansC < 2) return res.status(400).json({ message: "oneQuestionAnswersCount must be >= 2" });

    if (!createdPersonName) return res.status(400).json({ message: "createdPersonName is required" });

    const pay = low(payment);
    if (!["free", "paid"].includes(pay)) return res.status(400).json({ message: "payment must be free or paid" });

    const grade = await Grade.findById(gradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const gNo = Number(grade.grade);

    // ✅ validate relationship
    if (is1to11(gNo)) {
      if (!subjectId || !isValidId(subjectId)) {
        return res.status(400).json({ message: "For grades 1-11, subjectId is required" });
      }

      const allowed = new Set((grade.subjects || []).map((s) => String(s._id)));
      if (!allowed.has(String(subjectId))) {
        return res.status(400).json({ message: "subjectId does not belong to this grade" });
      }
    }

    if (is12or13(gNo)) {
      if (!streamId || !isValidId(streamId)) return res.status(400).json({ message: "For grades 12-13, streamId is required" });
      if (!streamSubjectId || !isValidId(streamSubjectId)) {
        return res.status(400).json({ message: "For grades 12-13, streamSubjectId is required" });
      }

      const stream = (grade.streams || []).find((st) => String(st._id) === String(streamId));
      if (!stream) return res.status(400).json({ message: "streamId does not belong to this grade" });

      const allowed = new Set((stream.subjects || []).map((s) => String(s._id)));
      if (!allowed.has(String(streamSubjectId))) {
        return res.status(400).json({ message: "streamSubjectId does not belong to this stream" });
      }
    }

    // ✅ payment rules (works for 1-13)
    const amt = Number(amount || 0);
    if (pay === "free" && amt !== 0) {
      return res.status(400).json({ message: "If payment is free, amount must be 0" });
    }
    if (pay === "paid" && (!amt || amt <= 0)) {
      return res.status(400).json({ message: "If payment is paid, amount must be > 0" });
    }

    const doc = await Paper.create({
      gradeId,
      subjectId: is1to11(gNo) ? subjectId : null,
      streamId: is12or13(gNo) ? streamId : null,
      streamSubjectId: is12or13(gNo) ? streamSubjectId : null,

      paperType: norm(paperType),
      paperTitle: norm(paperTitle),
      timeMinutes: t,
      questionCount: qc,
      oneQuestionAnswersCount: ansC,
      createdPersonName: norm(createdPersonName),

      payment: pay,
      amount: pay === "paid" ? amt : 0,
      attempts: Number(attempts || 1),

      createdBy: req.user?.id || null,
    });

    return res.status(201).json({
      message: "Paper created",
      paper: getReadablePaper(doc.toObject(), grade),
    });
  } catch (err) {
    console.error("createPaper error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ GET ALL PAPERS (Admin)
// GET /api/paper
// =======================================================
export const getAllPapers = async (req, res) => {
  try {
    const papers = await Paper.find()
      .populate("gradeId", "grade subjects streams")
      .sort({ createdAt: -1 })
      .lean();

    const mapped = papers.map((p) => getReadablePaper(p, p.gradeId));
    return res.status(200).json({ papers: mapped });
  } catch (err) {
    console.error("getAllPapers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ UPDATE PAPER (Admin)
// PATCH /api/paper/:paperId
// RULE: questionCount CANNOT reduce, only can increase.
// =======================================================
export const updatePaperById = async (req, res) => {
  try {
    const { paperId } = req.params;
    if (!isValidId(paperId)) return res.status(400).json({ message: "Invalid paperId" });

    const doc = await Paper.findById(paperId);
    if (!doc) return res.status(404).json({ message: "Paper not found" });

    const grade = await Grade.findById(doc.gradeId).lean();
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const gNo = Number(grade.grade);

    const {
      paperType,
      paperTitle,
      timeMinutes,
      questionCount,
      oneQuestionAnswersCount,
      createdPersonName,
      payment,
      amount,
      attempts,

      // (optional) allow change relation ONLY inside same grade structure
      subjectId,
      streamId,
      streamSubjectId,
    } = req.body;

    if (paperType !== undefined) doc.paperType = norm(paperType);
    if (paperTitle !== undefined) doc.paperTitle = norm(paperTitle);

    if (timeMinutes !== undefined) {
      const t = Number(timeMinutes);
      if (!t || t < 1) return res.status(400).json({ message: "timeMinutes must be >= 1" });
      doc.timeMinutes = t;
    }

    // ✅ questionCount rule
    if (questionCount !== undefined) {
      const qc = Number(questionCount);
      if (!qc || qc < 1) return res.status(400).json({ message: "questionCount must be >= 1" });
      if (qc < Number(doc.questionCount)) {
        return res.status(400).json({ message: "questionCount cannot be reduced" });
      }
      doc.questionCount = qc;
    }

    if (oneQuestionAnswersCount !== undefined) {
      const ansC = Number(oneQuestionAnswersCount);
      if (!ansC || ansC < 2) return res.status(400).json({ message: "oneQuestionAnswersCount must be >= 2" });
      doc.oneQuestionAnswersCount = ansC;
    }

    if (createdPersonName !== undefined) doc.createdPersonName = norm(createdPersonName);

    if (attempts !== undefined) {
      const a = Number(attempts);
      if (!a || a < 1) return res.status(400).json({ message: "attempts must be >= 1" });
      doc.attempts = a;
    }

    // ✅ payment update
    if (payment !== undefined) {
      const pay = low(payment);
      if (!["free", "paid"].includes(pay)) return res.status(400).json({ message: "payment must be free or paid" });
      doc.payment = pay;
    }
    if (amount !== undefined) {
      const amt = Number(amount || 0);
      if (doc.payment === "free" && amt !== 0) return res.status(400).json({ message: "If payment is free, amount must be 0" });
      if (doc.payment === "paid" && (!amt || amt <= 0)) return res.status(400).json({ message: "If payment is paid, amount must be > 0" });
      doc.amount = doc.payment === "paid" ? amt : 0;
    }

    // ✅ relation update (validated)
    if (is1to11(gNo)) {
      if (subjectId !== undefined) {
        if (!isValidId(subjectId)) return res.status(400).json({ message: "Invalid subjectId" });
        const allowed = new Set((grade.subjects || []).map((s) => String(s._id)));
        if (!allowed.has(String(subjectId))) return res.status(400).json({ message: "subjectId does not belong to this grade" });
        doc.subjectId = subjectId;
      }
      doc.streamId = null;
      doc.streamSubjectId = null;
    }

    if (is12or13(gNo)) {
      if (streamId !== undefined) {
        if (!isValidId(streamId)) return res.status(400).json({ message: "Invalid streamId" });
        const stream = (grade.streams || []).find((st) => String(st._id) === String(streamId));
        if (!stream) return res.status(400).json({ message: "streamId does not belong to this grade" });
        doc.streamId = streamId;
      }

      if (streamSubjectId !== undefined) {
        if (!isValidId(streamSubjectId)) return res.status(400).json({ message: "Invalid streamSubjectId" });

        const stream = (grade.streams || []).find((st) => String(st._id) === String(doc.streamId));
        if (!stream) return res.status(400).json({ message: "streamId is missing/invalid on this paper" });

        const allowed = new Set((stream.subjects || []).map((s) => String(s._id)));
        if (!allowed.has(String(streamSubjectId))) return res.status(400).json({ message: "streamSubjectId does not belong to this stream" });

        doc.streamSubjectId = streamSubjectId;
      }

      doc.subjectId = null;
    }

    await doc.save();

    const populated = await Paper.findById(doc._id).populate("gradeId", "grade subjects streams").lean();

    return res.status(200).json({
      message: "Paper updated",
      paper: getReadablePaper(populated, populated.gradeId),
    });
  } catch (err) {
    console.error("updatePaperById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =======================================================
// ✅ DELETE PAPER (Admin)
// DELETE /api/paper/:paperId
// =======================================================
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
