const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET =
  process.env.AUTH_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "local-dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.AUTH_JWT_EXPIRES_IN || "12h";

function issueApiToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token.trim();
}

async function requireApiAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing Bearer token",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token",
      });
    }

    const userId = decoded?.sub || decoded?.id;
    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token payload is invalid",
      });
    }

    const user = await User.findById(userId)
      .select("_id name email role")
      .lean();

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User not found",
      });
    }

    req.apiUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    return res.status(500).json({
      error: "Auth middleware failed",
      message: error.message,
    });
  }
}

function requireRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    if (!req.apiUser) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    if (!allowed.has(req.apiUser.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }

    return next();
  };
}

module.exports = {
  issueApiToken,
  readBearerToken,
  requireApiAuth,
  requireRoles,
};
