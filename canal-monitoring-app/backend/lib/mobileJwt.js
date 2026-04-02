const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ACCESS_SECRET =
  process.env.MOBILE_JWT_ACCESS_SECRET ||
  process.env.AUTH_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "local-dev-mobile-access-secret-change-me";
const REFRESH_SECRET =
  process.env.MOBILE_JWT_REFRESH_SECRET ||
  process.env.AUTH_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "local-dev-mobile-refresh-secret-change-me";

const ACCESS_EXPIRES_IN = process.env.MOBILE_JWT_ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES_IN = process.env.MOBILE_JWT_REFRESH_EXPIRES || "30d";
const ALLOWED_MOBILE_ROLES = new Set(["admin", "user"]);

function parseExpiryToSeconds(value, fallbackSeconds) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const source = String(value || "").trim();
  if (!source) return fallbackSeconds;

  const asNumber = Number(source);
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
    return Math.max(1, Math.floor(asNumber));
  }

  const match = source.match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackSeconds;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * multipliers[unit];
}

const ACCESS_EXPIRES_SECONDS = parseExpiryToSeconds(ACCESS_EXPIRES_IN, 15 * 60);

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function issueMobileAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id || user.id),
      email: user.email,
      role: user.role,
      type: "access",
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN },
  );
}

function issueMobileRefreshToken(user) {
  return jwt.sign(
    {
      sub: String(user._id || user.id),
      email: user.email,
      role: user.role,
      type: "refresh",
      jti: crypto.randomUUID(),
    },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN },
  );
}

function verifyMobileAccessToken(token) {
  const decoded = jwt.verify(token, ACCESS_SECRET);
  if (decoded?.type !== "access") {
    throw new Error("Invalid access token type");
  }
  return decoded;
}

function verifyMobileRefreshToken(token) {
  const decoded = jwt.verify(token, REFRESH_SECRET);
  if (decoded?.type !== "refresh") {
    throw new Error("Invalid refresh token type");
  }
  return decoded;
}

function getExpDateFromPayload(payload) {
  const exp = Number(payload?.exp || 0);
  if (!exp) {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  return new Date(exp * 1000);
}

function buildMobileUserPayload(user) {
  return {
    id: String(user._id || user.id),
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

module.exports = {
  ACCESS_EXPIRES_SECONDS,
  ALLOWED_MOBILE_ROLES,
  hashToken,
  issueMobileAccessToken,
  issueMobileRefreshToken,
  verifyMobileAccessToken,
  verifyMobileRefreshToken,
  getExpDateFromPayload,
  buildMobileUserPayload,
};
