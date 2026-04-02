const User = require("../models/User");
const { readBearerToken } = require("./apiAuth");
const { verifyMobileAccessToken } = require("../lib/mobileJwt");

async function requireMobileJwtAuth(req, res, next) {
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
      decoded = verifyMobileAccessToken(token);
    } catch {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token",
      });
    }

    const userId = String(decoded?.sub || "").trim();
    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Token payload is invalid",
      });
    }

    const user = await User.findById(userId)
      .select("_id name email role isApproved")
      .lean();

    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User not found",
      });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // Keep compatibility with existing handlers expecting req.apiUser.
    req.apiUser = req.user;

    return next();
  } catch (error) {
    return res.status(500).json({
      error: "Auth middleware failed",
      message: error.message,
    });
  }
}

module.exports = {
  requireMobileJwtAuth,
};
