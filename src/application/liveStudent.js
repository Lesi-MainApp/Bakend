// backend/application/liveStudent.js
import Enrollment from "../infastructure/schemas/enrollment.js";
import Live from "../infastructure/schemas/live.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const attachComputedFields = (liveDoc) => {
  const live = liveDoc?.toObject ? liveDoc.toObject() : liveDoc;

  const cls = live?.classId; // populated class
  const grade = cls?.gradeId; // populated grade

  let subjectName = null;
  if (grade?.subjects?.length && cls?.subjectId) {
    const sub = grade.subjects.find((s) => String(s._id) === String(cls.subjectId));
    subjectName = sub?.subject || null;
  }

  const teacherNames = Array.isArray(cls?.teacherIds)
    ? cls.teacherIds.map((t) => t?.name).filter(Boolean)
    : [];

  return {
    ...live,
    className: cls?.className || null,
    gradeName: grade?.grade || null,
    subjectName,
    teacherNames,
  };
};

// ✅ Student: lives for enrolled classes only + not expired
export const getStudentLives = async (req, res) => {
  try {
    const studentId = req.user?.id;
    if (!studentId) return res.status(401).json({ message: "Unauthorized" });

    // ✅ only approved enrollments
    const enrolls = await Enrollment.find({
      studentId,
      status: "approved",
      isActive: true,
    })
      .select("classId")
      .lean();

    const classIds = enrolls.map((e) => e.classId).filter(Boolean);

    if (classIds.length === 0) {
      return res.status(200).json({ count: 0, lives: [] });
    }

    const now = Date.now();
    const validFrom = new Date(now - ONE_DAY_MS); // show only last 24h + future

    const lives = await Live.find({
      classId: { $in: classIds },
      isActive: true,
      scheduledAt: { $gte: validFrom },
    })
      .sort({ scheduledAt: -1 })
      .populate({
        path: "classId",
        select: "className gradeId subjectId teacherIds",
        populate: [
          { path: "gradeId", select: "grade subjects" },
          { path: "teacherIds", select: "name email" },
        ],
      })
      .lean();

    const formatted = lives.map(attachComputedFields);

    return res.status(200).json({ count: formatted.length, lives: formatted });
  } catch (err) {
    console.error("getStudentLives error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
