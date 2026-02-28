import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import User, {
  SL_PHONE_REGEX,
  DISTRICT_ENUMS,
} from "../infastructure/schemas/user.js";
import Otp from "../infastructure/schemas/otp.js";
import { sendWhatsApp } from "../api/whatsapp.js";
import { sendEmail } from "../api/email.js";

const OTP_TTL_MINUTES = 5;

const normalizeSLPhone = (phone) => {
  const p = String(phone || "").trim();
  if (p.startsWith("+94")) return p;
  if (p.startsWith("94")) return `+${p}`;
  if (p.startsWith("0")) return `+94${p.slice(1)}`;
  return p;
};

const normalizeDistrict = (district) => {
  const d = String(district || "").trim();
  return DISTRICT_ENUMS.includes(d) ? d : "";
};

const safeUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phonenumber: u.phonenumber,
  district: u.district,
  town: u.town,
  address: u.address,
  birthday: u.birthday,
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

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashOtp = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

const issueToken = (userId) => {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
};

const setAuthCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const sendOtpBoth = async ({ phone, email, otp, purpose }) => {
  const msg = `Your Lesi Iskole verification code is: ${otp} (valid for ${OTP_TTL_MINUTES} minutes)`;

  try {
    await sendWhatsApp(phone, msg);
  } catch (e) {
    console.error("WhatsApp OTP send failed:", e);
  }

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject:
          purpose === "reset_password"
            ? "Lesi Iskole Password Reset Code"
            : "Lesi Iskole Verification Code",
        text: msg,
      });
    } catch (e) {
      console.error("Email OTP send failed:", e);
    }
  }
};

const findUserByIdentifier = async (identifier) => {
  const raw = String(identifier || "").trim();
  if (!raw) return null;

  if (raw.includes("@")) {
    return User.findOne({ email: raw.toLowerCase() });
  }

  const normalizedPhone = normalizeSLPhone(raw);
  return User.findOne({ phonenumber: normalizedPhone });
};

export const signUp = async (req, res) => {
  try {
    const {
      name,
      email,
      whatsappnumber,
      password,
      role,
      district,
      town,
      address,
      birthday,
    } = req.body;

    if (!name || !email || !whatsappnumber || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["admin", "teacher", "student"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!SL_PHONE_REGEX.test(String(whatsappnumber).trim())) {
      return res
        .status(400)
        .json({ message: "Invalid Sri Lankan phone number" });
    }

    let normalizedBirthday = null;
    if (birthday) {
      const bd = new Date(birthday);
      if (Number.isNaN(bd.getTime())) {
        return res.status(400).json({ message: "Invalid birthday" });
      }
      normalizedBirthday = bd;
    }

    if (role === "student") {
      const normalizedDistrict = normalizeDistrict(district);

      if (!normalizedDistrict) {
        return res
          .status(400)
          .json({ message: "District must be a valid English district value" });
      }
      if (!String(town || "").trim()) {
        return res.status(400).json({ message: "Town is required" });
      }
      if (!String(address || "").trim()) {
        return res.status(400).json({ message: "Address is required" });
      }
      if (!normalizedBirthday) {
        return res.status(400).json({ message: "Birthday is required" });
      }
    }

    const normalizedPhone = normalizeSLPhone(whatsappnumber);
    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { phonenumber: normalizedPhone }],
    });

    if (existing && existing.isVerified) {
      if (existing.email === normalizedEmail) {
        return res.status(409).json({ message: "Email already in use" });
      }
      return res
        .status(409)
        .json({ message: "WhatsApp number already in use" });
    }

    if (existing && !existing.isVerified) {
      existing.name = String(name).trim();
      existing.email = normalizedEmail;
      existing.phonenumber = normalizedPhone;
      existing.role = role;

      existing.district =
        role === "student" ? normalizeDistrict(district) : "";
      existing.town = role === "student" ? String(town).trim() : "";
      existing.address = role === "student" ? String(address).trim() : "";
      existing.birthday = role === "student" ? normalizedBirthday : null;

      existing.password = await bcrypt.hash(String(password), 10);

      await existing.save();

      await Otp.deleteMany({
        phonenumber: normalizedPhone,
        purpose: "verify_phone",
        consumedAt: null,
      });

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

      await Otp.create({
        phonenumber: normalizedPhone,
        email: normalizedEmail,
        codeHash: hashOtp(otp),
        purpose: "verify_phone",
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
      });

      await sendOtpBoth({
        phone: normalizedPhone,
        email: normalizedEmail,
        otp,
        purpose: "verify_phone",
      });

      return res.status(200).json({
        message: "User already exists but not verified. OTP re-sent.",
        user: safeUser(existing),
      });
    }

    const hashedPass = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phonenumber: normalizedPhone,
      password: hashedPass,
      role,

      district: role === "student" ? normalizeDistrict(district) : "",
      town: role === "student" ? String(town).trim() : "",
      address: role === "student" ? String(address).trim() : "",
      birthday: role === "student" ? normalizedBirthday : null,

      isVerified: false,
      verifiedAt: null,
      isApproved: role === "teacher" ? false : true,
    });

    await Otp.deleteMany({
      phonenumber: normalizedPhone,
      purpose: "verify_phone",
      consumedAt: null,
    });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.create({
      phonenumber: normalizedPhone,
      email: normalizedEmail,
      codeHash: hashOtp(otp),
      purpose: "verify_phone",
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
    });

    await sendOtpBoth({
      phone: normalizedPhone,
      email: normalizedEmail,
      otp,
      purpose: "verify_phone",
    });

    return res
      .status(201)
      .json({ message: "User created. OTP sent.", user: safeUser(user) });
  } catch (err) {
    console.error("signUp error:", err);

    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate email or phone" });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyCode = async (req, res) => {
  try {
    const { phonenumber, identifier, code, purpose } = req.body;

    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    const otpPurpose =
      purpose === "reset_password" ? "reset_password" : "verify_phone";

    let user = null;
    let normalizedPhone = "";

    if (otpPurpose === "reset_password") {
      const lookup = String(identifier || phonenumber || "").trim();
      if (!lookup) {
        return res
          .status(400)
          .json({ message: "identifier is required for reset password OTP" });
      }

      user = await findUserByIdentifier(lookup);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      normalizedPhone = user.phonenumber;
    } else {
      if (!phonenumber) {
        return res
          .status(400)
          .json({ message: "phonenumber and code are required" });
      }

      normalizedPhone = normalizeSLPhone(phonenumber);
    }

    const otpDoc = await Otp.findOne({
      phonenumber: normalizedPhone,
      purpose: otpPurpose,
      consumedAt: null,
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({ message: "No OTP found. Please resend code." });
    }

    if (Date.now() > new Date(otpDoc.expiresAt).getTime()) {
      return res.status(400).json({ message: "Code expired" });
    }

    if (otpDoc.attempts >= otpDoc.maxAttempts) {
      return res.status(429).json({ message: "Too many attempts" });
    }

    const isMatch = hashOtp(code) === otpDoc.codeHash;
    otpDoc.attempts += 1;
    await otpDoc.save();

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid code" });
    }

    otpDoc.consumedAt = new Date();
    await otpDoc.save();

    if (otpPurpose === "verify_phone") {
      user = await User.findOne({ phonenumber: normalizedPhone });
      if (!user) return res.status(404).json({ message: "User not found" });

      user.isVerified = true;
      user.verifiedAt = new Date();
      await user.save();

      return res.status(200).json({
        message: "Phone verified",
        user: safeUser(user),
      });
    }

    return res.status(200).json({
      message: "Reset OTP verified",
      identifier: identifier || user?.email || user?.phonenumber || "",
    });
  } catch (err) {
    console.error("verifyCode error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const sendVerificationCode = async (req, res) => {
  try {
    const { phonenumber } = req.body;
    if (!phonenumber) {
      return res.status(400).json({ message: "phonenumber is required" });
    }

    const normalizedPhone = normalizeSLPhone(phonenumber);
    const user = await User.findOne({ phonenumber: normalizedPhone });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isVerified) {
      return res.status(200).json({ message: "Already verified" });
    }

    await Otp.deleteMany({
      phonenumber: normalizedPhone,
      purpose: "verify_phone",
      consumedAt: null,
    });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.create({
      phonenumber: normalizedPhone,
      email: user.email || "",
      codeHash: hashOtp(otp),
      purpose: "verify_phone",
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
    });

    await sendOtpBoth({
      phone: normalizedPhone,
      email: user.email,
      otp,
      purpose: "verify_phone",
    });

    return res.status(200).json({ message: "OTP sent" });
  } catch (err) {
    console.error("sendVerificationCode error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const signIn = async (req, res) => {
  try {
    const { phonenumber, whatsappnumber, password, clientType } = req.body;
    const phoneInput = phonenumber || whatsappnumber;

    if (!phoneInput || !password) {
      return res
        .status(400)
        .json({ message: "phonenumber and password are required" });
    }

    const normalizedPhone = normalizeSLPhone(phoneInput);

    const user = await User.findOne({ phonenumber: normalizedPhone }).select(
      "+password"
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Phone not verified. Please verify OTP first." });
    }

    if (clientType === "student_app" && user.role !== "student") {
      return res.status(403).json({
        message:
          "This mobile app is only for student accounts. Please use the teacher/admin web panel.",
      });
    }

    if (user.role === "teacher" && !user.isApproved) {
      return res.status(403).json({ message: "Teacher not approved yet." });
    }

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    const token = issueToken(user._id);
    setAuthCookie(res, token);

    return res.status(200).json({
      message: "Logged in successfully",
      token,
      user: safeUser(user),
    });
  } catch (err) {
    console.error("signIn error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const signOut = async (req, res) => {
  res.clearCookie("token");
  return res.status(200).json({ message: "Signed out successfully" });
};

export const forgotPasswordSendOtp = async (req, res) => {
  try {
    const { identifier } = req.body;
    const raw = String(identifier || "").trim();

    if (!raw) {
      return res
        .status(400)
        .json({ message: "Please enter your email or phone number" });
    }

    const user = await findUserByIdentifier(raw);
    if (!user) {
      return res.status(404).json({ message: "No account found for this email or phone number" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "This account is not verified yet. Please complete signup OTP verification first.",
      });
    }

    await Otp.deleteMany({
      phonenumber: user.phonenumber,
      purpose: "reset_password",
      consumedAt: null,
    });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.create({
      phonenumber: user.phonenumber,
      email: user.email || "",
      codeHash: hashOtp(otp),
      purpose: "reset_password",
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
    });

    await sendOtpBoth({
      phone: user.phonenumber,
      email: user.email,
      otp,
      purpose: "reset_password",
    });

    return res.status(200).json({
      message: "OTP sent to your WhatsApp and email",
      phone: user.phonenumber,
      email: user.email,
    });
  } catch (err) {
    console.error("forgotPasswordSendOtp error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const forgotPasswordReset = async (req, res) => {
  try {
    const { identifier, code, newPassword, confirmPassword } = req.body;

    const raw = String(identifier || "").trim();
    if (!raw) {
      return res
        .status(400)
        .json({ message: "identifier is required" });
    }

    if (!code || String(code).trim().length !== 6) {
      return res.status(400).json({ message: "Valid 6 digit OTP is required" });
    }

    if (!newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ message: "New password and confirm password are required" });
    }

    if (String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (String(newPassword).length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const user = await findUserByIdentifier(raw);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otpDoc = await Otp.findOne({
      phonenumber: user.phonenumber,
      purpose: "reset_password",
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({ message: "No reset OTP found. Please request a new OTP." });
    }

    if (Date.now() > new Date(otpDoc.expiresAt).getTime()) {
      return res.status(400).json({ message: "Code expired" });
    }

    const isMatch = hashOtp(code) === otpDoc.codeHash;
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid code" });
    }

    if (!otpDoc.consumedAt) {
      otpDoc.consumedAt = new Date();
      await otpDoc.save();
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    if (user.role === "student") {
      const token = issueToken(user._id);
      setAuthCookie(res, token);

      return res.status(200).json({
        message: "Password reset successful",
        token,
        user: safeUser(user),
      });
    }

    return res.status(200).json({
      message: "Password reset successful. Please sign in from your web panel.",
    });
  } catch (err) {
    console.error("forgotPasswordReset error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const submitStudentDetails = async (req, res) =>
  res.status(501).json({ message: "Optional / keep your existing" });