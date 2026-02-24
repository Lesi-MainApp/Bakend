import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import User, { SL_PHONE_REGEX } from "../infastructure/schemas/user.js";
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

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
const hashOtp = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

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

export const signUp = async (req, res) => {
  try {
    const { name, email, whatsappnumber, password, role, district, town, address } = req.body;

    if (!name || !email || !whatsappnumber || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["admin", "teacher", "student"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!SL_PHONE_REGEX.test(String(whatsappnumber).trim())) {
      return res.status(400).json({ message: "Invalid Sri Lankan phone number" });
    }

    if (role === "student") {
      if (!String(district || "").trim()) return res.status(400).json({ message: "District is required" });
      if (!String(town || "").trim()) return res.status(400).json({ message: "Town is required" });
      if (!String(address || "").trim()) return res.status(400).json({ message: "Address is required" });
    }

    const normalizedPhone = normalizeSLPhone(whatsappnumber);
    const normalizedEmail = String(email).toLowerCase().trim();

    // ✅ check existing by email OR phone
    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { phonenumber: normalizedPhone }],
    });

    // ✅ If exists and already verified -> true conflict
    if (existing && existing.isVerified) {
      if (existing.email === normalizedEmail) return res.status(409).json({ message: "Email already in use" });
      return res.status(409).json({ message: "WhatsApp number already in use" });
    }

    // ✅ If exists but not verified -> re-send OTP (NO 409)
    if (existing && !existing.isVerified) {
      // update details (optional but helpful)
      existing.name = String(name).trim();
      existing.email = normalizedEmail;
      existing.phonenumber = normalizedPhone;
      existing.role = role;

      existing.district = role === "student" ? String(district).trim() : "";
      existing.town = role === "student" ? String(town).trim() : "";
      existing.address = role === "student" ? String(address).trim() : "";

      existing.password = await bcrypt.hash(String(password), 10);

      await existing.save();

      await Otp.deleteMany({ phonenumber: normalizedPhone, purpose: "verify_phone", consumedAt: null });

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

      await sendOtpBoth({ phone: normalizedPhone, email: normalizedEmail, otp, purpose: "verify_phone" });

      return res.status(200).json({
        message: "User already exists but not verified. OTP re-sent.",
        user: safeUser(existing),
      });
    }

    // ✅ New user create
    const hashedPass = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phonenumber: normalizedPhone,
      password: hashedPass,
      role,

      district: role === "student" ? String(district).trim() : "",
      town: role === "student" ? String(town).trim() : "",
      address: role === "student" ? String(address).trim() : "",

      isVerified: false,
      verifiedAt: null,
      isApproved: role === "teacher" ? false : true,
    });

    await Otp.deleteMany({ phonenumber: normalizedPhone, purpose: "verify_phone", consumedAt: null });

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

    await sendOtpBoth({ phone: normalizedPhone, email: normalizedEmail, otp, purpose: "verify_phone" });

    return res.status(201).json({ message: "User created. OTP sent.", user: safeUser(user) });
  } catch (err) {
    console.error("signUp error:", err);

    // ✅ handle Mongo duplicate key properly
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Duplicate email or phone" });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================
   NO CHANGES BELOW (keep yours)
========================= */

export const verifyCode = async (req, res) => {
  try {
    const { phonenumber, code } = req.body;
    if (!phonenumber || !code) return res.status(400).json({ message: "phonenumber and code are required" });

    const normalizedPhone = normalizeSLPhone(phonenumber);

    const otpDoc = await Otp.findOne({
      phonenumber: normalizedPhone,
      purpose: "verify_phone",
      consumedAt: null,
    }).sort({ createdAt: -1 });

    if (!otpDoc) return res.status(400).json({ message: "No OTP found. Please resend code." });
    if (Date.now() > new Date(otpDoc.expiresAt).getTime()) return res.status(400).json({ message: "Code expired" });
    if (otpDoc.attempts >= otpDoc.maxAttempts) return res.status(429).json({ message: "Too many attempts" });

    const isMatch = hashOtp(code) === otpDoc.codeHash;
    otpDoc.attempts += 1;
    await otpDoc.save();

    if (!isMatch) return res.status(400).json({ message: "Invalid code" });

    otpDoc.consumedAt = new Date();
    await otpDoc.save();

    const user = await User.findOne({ phonenumber: normalizedPhone });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isVerified = true;
    user.verifiedAt = new Date();
    await user.save();

    return res.status(200).json({ message: "Phone verified", user: safeUser(user) });
  } catch (err) {
    console.error("verifyCode error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const sendVerificationCode = async (req, res) => {
  try {
    const { phonenumber } = req.body;
    if (!phonenumber) return res.status(400).json({ message: "phonenumber is required" });

    const normalizedPhone = normalizeSLPhone(phonenumber);
    const user = await User.findOne({ phonenumber: normalizedPhone });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isVerified) return res.status(200).json({ message: "Already verified" });

    await Otp.deleteMany({ phonenumber: normalizedPhone, purpose: "verify_phone", consumedAt: null });

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

    await sendOtpBoth({ phone: normalizedPhone, email: user.email, otp, purpose: "verify_phone" });

    return res.status(200).json({ message: "OTP sent" });
  } catch (err) {
    console.error("sendVerificationCode error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const signIn = async (req, res) => {
  try {
    const { phonenumber, whatsappnumber, password } = req.body;
    const phoneInput = phonenumber || whatsappnumber;

    if (!phoneInput || !password) {
      return res.status(400).json({ message: "phonenumber and password are required" });
    }

    const normalizedPhone = normalizeSLPhone(phoneInput);

    const user = await User.findOne({ phonenumber: normalizedPhone }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid phone or password" });

    if (!user.isVerified) return res.status(403).json({ message: "Phone not verified. Please verify OTP first." });
    if (user.role === "teacher" && !user.isApproved) return res.status(403).json({ message: "Teacher not approved yet." });

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ message: "Invalid phone or password" });

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

export const forgotPasswordSendOtp = async (req, res) => res.status(501).json({ message: "Implement / keep your existing" });
export const forgotPasswordReset = async (req, res) => res.status(501).json({ message: "Implement / keep your existing" });
export const submitStudentDetails = async (req, res) => res.status(501).json({ message: "Optional / keep your existing" });