const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { issueApiToken } = require("../middleware/apiAuth");

const router = express.Router();
const LEGACY_DISABLED_EMAILS = new Set(["admin@canal.io", "user@canal.io"]);
const BOOTSTRAP_SUPERADMIN_EMAIL = String(
  process.env.BOOTSTRAP_SUPERADMIN_EMAIL || "bootstrap-superadmin@canal.io",
)
  .toLowerCase()
  .trim();
const BOOTSTRAP_SUPERADMIN_PASSWORD =
  process.env.BOOTSTRAP_SUPERADMIN_PASSWORD || "TempSuperAdmin@123";
const ENABLE_BOOTSTRAP_SUPERADMIN_RECOVERY =
  String(process.env.ENABLE_BOOTSTRAP_SUPERADMIN_RECOVERY || "true")
    .toLowerCase()
    .trim() !== "false";

async function recoverBootstrapSuperAdminIfNeeded(normalizedEmail, password) {
  if (!ENABLE_BOOTSTRAP_SUPERADMIN_RECOVERY) return null;
  if (normalizedEmail !== BOOTSTRAP_SUPERADMIN_EMAIL) return null;
  if (String(password) !== BOOTSTRAP_SUPERADMIN_PASSWORD) return null;

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (!existingUser) {
    const passwordHash = await bcrypt.hash(BOOTSTRAP_SUPERADMIN_PASSWORD, 10);
    return User.create({
      name: "Temporary Super Admin",
      email: normalizedEmail,
      passwordHash,
      role: "superadmin",
      assignedCanals: [],
      favouriteCanals: [],
    });
  }

  let changed = false;

  if (existingUser.role !== "superadmin") {
    existingUser.role = "superadmin";
    changed = true;
  }

  if (!Array.isArray(existingUser.assignedCanals)) {
    existingUser.assignedCanals = [];
    changed = true;
  }

  if (!Array.isArray(existingUser.favouriteCanals)) {
    existingUser.favouriteCanals = [];
    changed = true;
  }

  const storedHash =
    typeof existingUser.passwordHash === "string"
      ? existingUser.passwordHash
      : "";

  let currentPasswordMatches = false;
  if (storedHash) {
    try {
      currentPasswordMatches = await bcrypt.compare(
        BOOTSTRAP_SUPERADMIN_PASSWORD,
        storedHash,
      );
    } catch {
      currentPasswordMatches = false;
    }
  }

  if (!currentPasswordMatches) {
    existingUser.passwordHash = await bcrypt.hash(
      BOOTSTRAP_SUPERADMIN_PASSWORD,
      10,
    );
    changed = true;
  }

  if (changed) {
    await existingUser.save();
  }

  return existingUser;
}

// POST /api/auth/register — create a new user account
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email, and password are required",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const trimmedName = String(name).trim();

    if (LEGACY_DISABLED_EMAILS.has(normalizedEmail)) {
      return res.status(403).json({
        error: "This email is reserved",
        message:
          "Legacy demo accounts are disabled. Please use a personal or official account email.",
      });
    }

    if (trimmedName.length < 2) {
      return res
        .status(400)
        .json({ error: "Name must be at least 2 characters" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role: "user",
      assignedCanals: [],
      favouriteCanals: [],
    });

    const apiToken = issueApiToken(user);

    return res.status(201).json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      apiToken,
      message: "Account created successfully",
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login — validate credentials, return user info for NextAuth
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    if (LEGACY_DISABLED_EMAILS.has(normalizedEmail)) {
      return res.status(403).json({
        error: "Legacy account disabled",
        message:
          "This legacy demo account has been disabled. Please create a new account.",
      });
    }

    let user = await recoverBootstrapSuperAdminIfNeeded(
      normalizedEmail,
      password,
    );

    if (!user) {
      user = await User.findOne({ email: normalizedEmail });
    }

    if (!user) {
      // Intentionally vague — don't reveal whether email exists
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Return user profile (never return passwordHash)
    const apiToken = issueApiToken(user);

    return res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      apiToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me — lightweight liveness check (actual session managed by NextAuth)
router.get("/me", (req, res) => {
  res.status(401).json({ error: "Use NextAuth session on the frontend" });
});

module.exports = router;
