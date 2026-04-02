const bcrypt = require("bcryptjs");

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

function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function isLegacyDisabledEmail(email) {
  return LEGACY_DISABLED_EMAILS.has(normalizeEmail(email));
}

async function recoverBootstrapSuperAdminIfNeeded(User, normalizedEmail, password) {
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
    typeof existingUser.passwordHash === "string" ? existingUser.passwordHash : "";

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
    existingUser.passwordHash = await bcrypt.hash(BOOTSTRAP_SUPERADMIN_PASSWORD, 10);
    changed = true;
  }

  if (changed) {
    await existingUser.save();
  }

  return existingUser;
}

async function authenticateUserCredentials(User, email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return { ok: false, status: 400, error: "Email and password are required" };
  }

  if (isLegacyDisabledEmail(normalizedEmail)) {
    return {
      ok: false,
      status: 403,
      error: "Legacy account disabled",
      message:
        "This legacy demo account has been disabled. Please create a new account.",
    };
  }

  let user = await recoverBootstrapSuperAdminIfNeeded(User, normalizedEmail, password);
  if (!user) {
    user = await User.findOne({ email: normalizedEmail });
  }

  if (!user) {
    return { ok: false, status: 401, error: "Invalid credentials" };
  }

  const isValid = await bcrypt.compare(password, user.passwordHash || "");
  if (!isValid) {
    return { ok: false, status: 401, error: "Invalid credentials" };
  }

  if (user.role !== "superadmin" && !user.isApproved) {
    return {
      ok: false,
      status: 403,
      error: "Account pending approval",
      message:
        "Your account is pending activation. Please contact your administrator.",
    };
  }

  return { ok: true, user, normalizedEmail };
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

async function writeLoginAudit(AuthLog, user, req) {
  if (!AuthLog) return;
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

module.exports = {
  LEGACY_DISABLED_EMAILS,
  normalizeEmail,
  isLegacyDisabledEmail,
  authenticateUserCredentials,
  writeLoginAudit,
};
