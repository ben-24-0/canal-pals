const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AuthLog = require("../models/AuthLog");
const { issueApiToken } = require("../middleware/apiAuth");
const { requireApiAuth } = require("../middleware/apiAuth");

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
      isApproved: true,
      approvedAt: new Date(),
      assignedCanals: [],
      favouriteCanals: [],
    });
  }

  let changed = false;

  if (existingUser.role !== "superadmin") {
    existingUser.role = "superadmin";
    changed = true;
  }

  if (!existingUser.isApproved) {
    existingUser.isApproved = true;
    existingUser.approvedAt = new Date();
    changed = true;
  }

  if (existingUser.managedByAdminId) {
    existingUser.managedByAdminId = null;
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

function readRequestIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").trim();
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return (
    String(req.ip || "").trim() ||
    String(req.socket?.remoteAddress || "").trim() ||
    ""
  );
}

async function writeLoginAudit(user, req) {
  if (!user || !["user", "admin"].includes(String(user.role || ""))) {
    return;
  }

  await AuthLog.create({
    userId: user._id,
    managedByAdminId: user.managedByAdminId || null,
    email: user.email,
    role: user.role,
    loginAt: new Date(),
    ipAddress: readRequestIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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
      isApproved: false,
      approvedAt: null,
      approvedBy: null,
      managedByAdminId: null,
      extraGroupIds: [],
      allowedDeviceIds: [],
      hiddenDeviceIds: [],
      assignedCanals: [],
      favouriteCanals: [],
    });

    return res.status(201).json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isApproved: user.isApproved,
      message:
        "Account created. Your account will be activated by a super admin.",
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

    if (user.role !== "superadmin" && !user.isApproved) {
      return res.status(403).json({
        error: "Account pending approval",
        message:
          "Your account is pending activation. Please contact your administrator.",
      });
    }

    // Return user profile (never return passwordHash)
    const apiToken = issueApiToken(user);

    await writeLoginAudit(user, req);

    return res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isApproved: Boolean(user.isApproved),
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

// GET /api/auth/account — return current authenticated user profile
router.get("/account", requireApiAuth, async (req, res) => {
  try {
    const userId = String(req.apiUser?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(userId)
      .select("_id name email role")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load account",
      message: error.message,
    });
  }
});

// PATCH /api/auth/account — update current authenticated user profile
router.patch("/account", requireApiAuth, async (req, res) => {
  try {
    const userId = String(req.apiUser?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, "name");
    const hasEmail = Object.prototype.hasOwnProperty.call(req.body || {}, "email");

    if (!hasName && !hasEmail) {
      return res.status(400).json({
        error: "Nothing to update",
        message: "Provide name and/or email",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (hasName) {
      const trimmedName = String(req.body.name || "").trim();
      if (trimmedName.length < 2 || trimmedName.length > 100) {
        return res.status(400).json({
          error: "Invalid name",
          message: "Name must be 2-100 characters",
        });
      }
      user.name = trimmedName;
    }

    if (hasEmail) {
      const normalizedEmail = String(req.body.email || "")
        .trim()
        .toLowerCase();

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          error: "Invalid email",
          message: "Please provide a valid email address",
        });
      }

      if (LEGACY_DISABLED_EMAILS.has(normalizedEmail)) {
        return res.status(403).json({
          error: "This email is reserved",
          message: "Please use a personal or official account email",
        });
      }

      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      })
        .select("_id")
        .lean();

      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      user.email = normalizedEmail;
    }

    await user.save();

    return res.json({
      success: true,
      message: "Account profile updated",
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to update account",
      message: error.message,
    });
  }
});

// POST /api/auth/account/change-password — update current user password
router.post("/account/change-password", requireApiAuth, async (req, res) => {
  try {
    const userId = String(req.apiUser?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: "Validation failed",
        message: "Current, new, and confirm password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "Validation failed",
        message: "New password must be at least 6 characters",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "Validation failed",
        message: "New password and confirm password must match",
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        error: "Validation failed",
        message: "New password must be different from current password",
      });
    }

    const user = await User.findById(userId).select("_id passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        error: "Invalid credentials",
        message: "Current password is incorrect",
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to update password",
      message: error.message,
    });
  }
});

module.exports = router;
