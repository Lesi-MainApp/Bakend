import bcrypt from "bcryptjs";
import User, { SL_PHONE_REGEX } from "../infastructure/schemas/user.js";
import Grade from "../infastructure/schemas/grade.js";

/* ==========================
   HELPERS
========================== */
const normalizeSLPhone = (phone) => {
  const p = String(phone || "").trim();
  if (p.startsWith("+94")) return p;
  if (p.startsWith("94")) return `+${p}`;
  if (p.startsWith("0")) return `+94${p.slice(1)}`;
  return p;
};

const safeUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phonenumber: u.phonenumber,
  district: u.district,
  town: u.town,
  address: u.address,
  role: u.role,
  isVerified: u.isVerified,
  verifiedAt: u.verifiedAt,
  isApproved: u.isApproved,
  approvedAt: u.approvedAt,
  approvedBy: u.approvedBy,
  isActive: u.isActive,

  selectedLevel: u.selectedLevel,
  selectedGradeNumber: u.selectedGradeNumber,
  selectedStream: u.selectedStream,
  gradeSelectionLocked: u.gradeSelectionLocked,
  gradeSelectedAt: u.gradeSelectedAt,

  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

/**
 * PATCH /api/user/student/grade-selection
 * body: { level, gradeNumber, stream? }
 * 🔒 only one time
 */
export const saveStudentGradeSelection = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "student") return res.status(403).json({ message: "Only students allowed" });

    if (user.gradeSelectionLocked) {
      return res.status(409).json({
        message: "Grade already selected. Cannot change.",
        user: safeUser(user),
      });
    }

    const { level, gradeNumber, stream } = req.body;

    if (!["primary", "secondary", "al"].includes(level)) {
      return res.status(400).json({ message: "Invalid level" });
    }

    const gNum = Number(gradeNumber);
    if (!gNum || gNum < 1 || gNum > 13) {
      return res.status(400).json({ message: "Invalid grade number" });
    }

    // validate grade exists
    const gradeDoc = await Grade.findOne({ grade: gNum, isActive: true });
    if (!gradeDoc) return res.status(404).json({ message: "Grade not found" });

    // boundaries
    if (level === "primary" && (gNum < 1 || gNum > 5)) {
      return res.status(400).json({ message: "Primary must be Grade 1-5" });
    }
    if (level === "secondary" && (gNum < 6 || gNum > 11)) {
      return res.status(400).json({ message: "Secondary must be Grade 6-11" });
    }

    if (level === "al") {
      if (![12, 13].includes(gNum)) {
        return res.status(400).json({ message: "A/L must be Grade 12 or 13" });
      }
      const streamName = String(stream || "").trim();
      if (!streamName) return res.status(400).json({ message: "Stream required for A/L" });

      const ok = (gradeDoc.streams || []).some((s) => s?.stream === streamName);
      if (!ok) return res.status(400).json({ message: "Invalid stream" });

      user.selectedStream = streamName;
    } else {
      user.selectedStream = null;
    }

    user.selectedLevel = level;
    user.selectedGradeNumber = gNum;
    user.gradeSelectionLocked = true;
    user.gradeSelectedAt = new Date();

    await user.save();

    return res.status(200).json({
      message: "Grade selection saved & locked",
      user: safeUser(user),
    });
  } catch (err) {
    console.error("saveStudentGradeSelection error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


/* ==========================
   ADMIN CRUD USERS
========================== */
export const createUser = async (req, res) => {
  try {
    const { name, email, whatsappnumber, district, town, address, password, role } = req.body;

    if (!name || !email || !whatsappnumber || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["admin", "teacher", "student"].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be admin, teacher, or student." });
    }

    if (role === "student" && (!district || !town || !address)) {
      return res.status(400).json({ message: "Student must provide district, town, address" });
    }

    if (!SL_PHONE_REGEX.test(String(whatsappnumber).trim())) {
      return res.status(400).json({
        message: "Invalid Sri Lankan phone number. Use 0XXXXXXXXX or +94XXXXXXXXX",
      });
    }

    const normalizedPhone = normalizeSLPhone(whatsappnumber);

    const existsEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existsEmail) return res.status(409).json({ message: "Email already in use" });

    const existsPhone = await User.findOne({ phonenumber: normalizedPhone });
    if (existsPhone) return res.status(409).json({ message: "WhatsApp number already in use" });

    const hashed = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      name,
      email: String(email).toLowerCase().trim(),
      phonenumber: normalizedPhone,
      district: role === "student" ? district : "",
      town: role === "student" ? town : "",
      address: role === "student" ? address : "",
      password: hashed,
      role,

      isVerified: false,
      verifiedAt: null,

      isApproved: role === "teacher" ? false : true,
    });

    return res.status(201).json({ message: "User created", user: safeUser(user) });
  } catch (err) {
    console.error("createUser error:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Duplicate email or phone" });
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.status(200).json({ users: users.map(safeUser) });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ user: safeUser(user) });
  } catch (err) {
    console.error("getUserById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { name, email, whatsappnumber, district, town, address, password, role } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = String(email).toLowerCase().trim();

    if (role) {
      if (!["admin", "teacher", "student"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be admin, teacher, or student." });
      }
      updateData.role = role;

      if (role !== "teacher") {
        updateData.isApproved = true;
        updateData.approvedAt = null;
        updateData.approvedBy = null;
      }
    }

    if (whatsappnumber) {
      if (!SL_PHONE_REGEX.test(String(whatsappnumber).trim())) {
        return res.status(400).json({
          message: "Invalid Sri Lankan phone number. Use 0XXXXXXXXX or +94XXXXXXXXX",
        });
      }
      updateData.phonenumber = normalizeSLPhone(whatsappnumber);

      updateData.isVerified = false;
      updateData.verifiedAt = null;
    }

    if (district !== undefined) updateData.district = district;
    if (town !== undefined) updateData.town = town;
    if (address !== undefined) updateData.address = address;

    if (password) updateData.password = await bcrypt.hash(String(password), 10);

    const updated = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User updated", user: safeUser(updated) });
  } catch (err) {
    console.error("updateUser error:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Duplicate email or phone" });
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteUserById = async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ message: "User deleted", user: safeUser(deleted) });
  } catch (err) {
    console.error("deleteUserById error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const approveTeacher = async (req, res) => {
  try {
    const teacher = await User.findById(req.params.id);
    if (!teacher) return res.status(404).json({ message: "User not found" });
    if (teacher.role !== "teacher") return res.status(400).json({ message: "This user is not a teacher" });

    teacher.isApproved = true;
    teacher.approvedAt = new Date();
    teacher.approvedBy = req.user.id;

    await teacher.save();

    return res.status(200).json({ message: "Teacher approved successfully", user: safeUser(teacher) });
  } catch (err) {
    console.error("approveTeacher error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const rejectTeacher = async (req, res) => {
  try {
    const teacher = await User.findById(req.params.id);
    if (!teacher) return res.status(404).json({ message: "User not found" });
    if (teacher.role !== "teacher") return res.status(400).json({ message: "This user is not a teacher" });

    teacher.isApproved = false;
    teacher.approvedAt = null;
    teacher.approvedBy = null;

    await teacher.save();

    return res.status(200).json({ message: "Teacher rejected successfully", user: safeUser(teacher) });
  } catch (err) {
    console.error("rejectTeacher error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

