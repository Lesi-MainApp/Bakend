// backend/application/grade.js
import mongoose from "mongoose";
import Grade from "../infastructure/schemas/grade.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const toStr = (x) => String(x || "").trim();

/* =========================================================
   ✅ ADMIN: Grades
========================================================= */

export const createGrade = async (req, res) => {
  try {
    const gradeNumber = Number(req.body?.grade);

    if (!gradeNumber || gradeNumber < 1 || gradeNumber > 13) {
      return res.status(400).json({ message: "grade must be between 1 and 13" });
    }

    const exists = await Grade.findOne({ grade: gradeNumber });
    if (exists) {
      return res.status(409).json({ message: "Grade already exists", grade: exists });
    }

    const grade = await Grade.create({
      grade: gradeNumber,
      subjects: [],
      streams: [],
      isActive: true,
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({ grade });
  } catch (err) {
    console.error("createGrade error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateGradeById = async (req, res) => {
  try {
    const { gradeId } = req.params;
    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });

    // allow updating isActive only (safe)
    const isActive = req.body?.isActive;
    const patch = {};
    if (typeof isActive === "boolean") patch.isActive = isActive;

    const updated = await Grade.findByIdAndUpdate(gradeId, patch, { new: true });
    if (!updated) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ grade: updated });
  } catch (err) {
    console.error("updateGradeById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteGradeById = async (req, res) => {
  try {
    const { gradeId } = req.params;
    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });

    const deleted = await Grade.findByIdAndDelete(gradeId);
    if (!deleted) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ message: "Grade deleted" });
  } catch (err) {
    console.error("deleteGradeById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: Subjects (Grades 1..11)
   Frontend uses:
   - GET    /subjects/:gradeId
   - POST   /subject
   - PATCH  /subject/:gradeId/:subjectId
   - DELETE /subject/:gradeId/:subjectId
========================================================= */

export const getSubjectsByGrade = async (req, res) => {
  try {
    const { gradeId } = req.params;
    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ subjects: grade.subjects || [] });
  } catch (err) {
    console.error("getSubjectsByGrade error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createSubject = async (req, res) => {
  try {
    const gradeId = req.body?.gradeId;
    const subject = toStr(req.body?.subject);

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!subject) return res.status(400).json({ message: "subject is required" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    if (grade.grade >= 12) {
      return res.status(400).json({ message: "Subjects are only allowed for grades 1-11" });
    }

    const dup = (grade.subjects || []).some((s) => toStr(s.subject).toLowerCase() === subject.toLowerCase());
    if (dup) return res.status(409).json({ message: "Subject already exists" });

    grade.subjects.push({ subject });
    await grade.save();

    return res.status(201).json({ subjects: grade.subjects });
  } catch (err) {
    console.error("createSubject error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateSubjectById = async (req, res) => {
  try {
    const { gradeId, subjectId } = req.params;
    const subject = toStr(req.body?.subject);

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(subjectId)) return res.status(400).json({ message: "Invalid subjectId" });
    if (!subject) return res.status(400).json({ message: "subject is required" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const sub = (grade.subjects || []).id(subjectId);
    if (!sub) return res.status(404).json({ message: "Subject not found" });

    sub.subject = subject;
    await grade.save();

    return res.status(200).json({ subjects: grade.subjects });
  } catch (err) {
    console.error("updateSubjectById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteSubjectById = async (req, res) => {
  try {
    const { gradeId, subjectId } = req.params;

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(subjectId)) return res.status(400).json({ message: "Invalid subjectId" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const sub = (grade.subjects || []).id(subjectId);
    if (!sub) return res.status(404).json({ message: "Subject not found" });

    sub.deleteOne();
    await grade.save();

    return res.status(200).json({ subjects: grade.subjects });
  } catch (err) {
    console.error("deleteSubjectById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: Streams (Grades 12..13)
   Frontend uses:
   - GET    /streams/:gradeId
   - POST   /stream
   - PATCH  /stream/:gradeId/:streamId
   - DELETE /stream/:gradeId/:streamId
========================================================= */

export const getStreamsByGradeId = async (req, res) => {
  try {
    const { gradeId } = req.params;
    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ streams: grade.streams || [] });
  } catch (err) {
    console.error("getStreamsByGradeId error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createStream = async (req, res) => {
  try {
    const gradeId = req.body?.gradeId;
    const stream = toStr(req.body?.stream);

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!stream) return res.status(400).json({ message: "stream is required" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    if (grade.grade < 12) {
      return res.status(400).json({ message: "Streams are only allowed for grades 12-13" });
    }

    const dup = (grade.streams || []).some((s) => toStr(s.stream).toLowerCase() === stream.toLowerCase());
    if (dup) return res.status(409).json({ message: "Stream already exists" });

    grade.streams.push({ stream, subjects: [] });
    await grade.save();

    return res.status(201).json({ streams: grade.streams });
  } catch (err) {
    console.error("createStream error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateStreamById = async (req, res) => {
  try {
    const { gradeId, streamId } = req.params;
    const stream = toStr(req.body?.stream);

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(streamId)) return res.status(400).json({ message: "Invalid streamId" });
    if (!stream) return res.status(400).json({ message: "stream is required" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const st = (grade.streams || []).id(streamId);
    if (!st) return res.status(404).json({ message: "Stream not found" });

    st.stream = stream;
    await grade.save();

    return res.status(200).json({ streams: grade.streams });
  } catch (err) {
    console.error("updateStreamById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteStreamById = async (req, res) => {
  try {
    const { gradeId, streamId } = req.params;

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(streamId)) return res.status(400).json({ message: "Invalid streamId" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const st = (grade.streams || []).id(streamId);
    if (!st) return res.status(404).json({ message: "Stream not found" });

    st.deleteOne();
    await grade.save();

    return res.status(200).json({ streams: grade.streams });
  } catch (err) {
    console.error("deleteStreamById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ ADMIN: Stream Subjects (Grades 12..13)
   Frontend uses:
   - GET    /stream/subjects/:gradeId/:streamId
   - POST   /stream/subject
   - PATCH  /stream/subject/:gradeId/:streamId/:subjectId
   - DELETE /stream/subject/:gradeId/:streamId/:subjectId
========================================================= */

export const getStreamSubjects = async (req, res) => {
  try {
    const { gradeId, streamId } = req.params;

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(streamId)) return res.status(400).json({ message: "Invalid streamId" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const st = (grade.streams || []).id(streamId);
    if (!st) return res.status(404).json({ message: "Stream not found" });

    return res.status(200).json({ subjects: st.subjects || [] });
  } catch (err) {
    console.error("getStreamSubjects error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createStreamSubject = async (req, res) => {
  try {
    const gradeId = req.body?.gradeId;
    const streamId = req.body?.streamId;
    const subject = toStr(req.body?.subject);

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(streamId)) return res.status(400).json({ message: "Invalid streamId" });
    if (!subject) return res.status(400).json({ message: "subject is required" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const st = (grade.streams || []).id(streamId);
    if (!st) return res.status(404).json({ message: "Stream not found" });

    const dup = (st.subjects || []).some((s) => toStr(s.subject).toLowerCase() === subject.toLowerCase());
    if (dup) return res.status(409).json({ message: "Subject already exists in this stream" });

    st.subjects.push({ subject });
    await grade.save();

    return res.status(201).json({ subjects: st.subjects });
  } catch (err) {
    console.error("createStreamSubject error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateStreamSubjectById = async (req, res) => {
  try {
    const { gradeId, streamId, subjectId } = req.params;
    const subject = toStr(req.body?.subject);

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(streamId)) return res.status(400).json({ message: "Invalid streamId" });
    if (!isValidObjectId(subjectId)) return res.status(400).json({ message: "Invalid subjectId" });
    if (!subject) return res.status(400).json({ message: "subject is required" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const st = (grade.streams || []).id(streamId);
    if (!st) return res.status(404).json({ message: "Stream not found" });

    const sub = (st.subjects || []).id(subjectId);
    if (!sub) return res.status(404).json({ message: "Stream subject not found" });

    sub.subject = subject;
    await grade.save();

    return res.status(200).json({ subjects: st.subjects });
  } catch (err) {
    console.error("updateStreamSubjectById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteStreamSubjectById = async (req, res) => {
  try {
    const { gradeId, streamId, subjectId } = req.params;

    if (!isValidObjectId(gradeId)) return res.status(400).json({ message: "Invalid gradeId" });
    if (!isValidObjectId(streamId)) return res.status(400).json({ message: "Invalid streamId" });
    if (!isValidObjectId(subjectId)) return res.status(400).json({ message: "Invalid subjectId" });

    const grade = await Grade.findById(gradeId);
    if (!grade) return res.status(404).json({ message: "Grade not found" });

    const st = (grade.streams || []).id(streamId);
    if (!st) return res.status(404).json({ message: "Stream not found" });

    const sub = (st.subjects || []).id(subjectId);
    if (!sub) return res.status(404).json({ message: "Stream subject not found" });

    sub.deleteOne();
    await grade.save();

    return res.status(200).json({ subjects: st.subjects });
  } catch (err) {
    console.error("deleteStreamSubjectById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   ✅ PUBLIC: Student App
========================================================= */

// ✅ PUBLIC: get active grades
export const getGradesPublic = async (req, res) => {
  try {
    const grades = await Grade.find({ isActive: true }).sort({ grade: 1 });
    return res.status(200).json({ grades });
  } catch (err) {
    console.error("getGradesPublic error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ PUBLIC: get streams for grade 12/13 (by gradeNumber)
export const getStreamsPublic = async (req, res) => {
  try {
    const gradeNumber = Number(req.params.gradeNumber);
    if (!gradeNumber || gradeNumber < 1 || gradeNumber > 13) {
      return res.status(400).json({ message: "Invalid gradeNumber" });
    }

    const gradeDoc = await Grade.findOne({ grade: gradeNumber, isActive: true });
    if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ streams: gradeDoc.streams || [] });
  } catch (err) {
    console.error("getStreamsPublic error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ PUBLIC: grade detail (subjects/streams)
export const getGradeDetailPublic = async (req, res) => {
  try {
    const gradeNumber = Number(req.params.gradeNumber);
    if (!gradeNumber || gradeNumber < 1 || gradeNumber > 13) {
      return res.status(400).json({ message: "Invalid gradeNumber" });
    }

    const gradeDoc = await Grade.findOne({ grade: gradeNumber, isActive: true });
    if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ grade: gradeDoc });
  } catch (err) {
    console.error("getGradeDetailPublic error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ SMART: streams by gradeNumber (12/13) OR by gradeId (ObjectId)
// This avoids route conflict without changing frontend.
export const getStreamsSmart = async (req, res) => {
  try {
    const value = String(req.params.value || "").trim();

    // Case 1: value is number (student flow)
    const asNumber = Number(value);
    const isNumeric = value !== "" && !Number.isNaN(asNumber);

    if (isNumeric) {
      // allow only grade 12 or 13 (streams exist only there)
      if (asNumber !== 12 && asNumber !== 13) {
        return res.status(400).json({ message: "Streams only available for grade 12 or 13" });
      }

      const gradeDoc = await Grade.findOne({ grade: asNumber, isActive: true });
      if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

      return res.status(200).json({ streams: gradeDoc.streams || [] });
    }

    // Case 2: value is ObjectId (dashboard flow)
    if (!isValidObjectId(value)) {
      return res.status(400).json({ message: "Invalid grade id or grade number" });
    }

    const gradeDoc = await Grade.findById(value);
    if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

    return res.status(200).json({ streams: gradeDoc.streams || [] });
  } catch (err) {
    console.error("getStreamsSmart error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
