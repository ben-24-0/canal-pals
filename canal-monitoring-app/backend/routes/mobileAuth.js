const express = require("express");
const rateLimit = require("express-rate-limit");

const User = require("../models/User");
const AuthLog = require("../models/AuthLog");
const MobileRefreshToken = require("../models/MobileRefreshToken");
const { requireMobileJwtAuth } = require("../middleware/mobileJwtAuth");
const { authenticateUserCredentials, writeLoginAudit } = require("../lib/authService");
const {
  ACCESS_EXPIRES_SECONDS,
  ALLOWED_MOBILE_ROLES,
  hashToken,
  issueMobileAccessToken,
  issueMobileRefreshToken,
  verifyMobileRefreshToken,
  getExpDateFromPayload,
  buildMobileUserPayload,
} = require("../lib/mobileJwt");

function createMobileAuthRouter(deps = {}) {
  const router = express.Router();
  const rateLimitFn = deps.rateLimit || rateLimit;

  const UserModel = deps.User || User;
  const AuthLogModel = deps.AuthLog || AuthLog;
  const RefreshTokenModel = deps.MobileRefreshToken || MobileRefreshToken;
  const requireAuth = deps.requireMobileJwtAuth || requireMobileJwtAuth;
  const authHelpers = deps.authHelpers || {
    authenticateUserCredentials,
    writeLoginAudit,
  };
  const tokenHelpers = deps.tokenHelpers || {
    ACCESS_EXPIRES_SECONDS,
    ALLOWED_MOBILE_ROLES,
    hashToken,
    issueMobileAccessToken,
    issueMobileRefreshToken,
    verifyMobileRefreshToken,
    getExpDateFromPayload,
    buildMobileUserPayload,
  };

  const loginLimiter = rateLimitFn({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many login attempts",
      message: "Please try again later.",
    },
  });

  const refreshLimiter = rateLimitFn({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many refresh attempts",
      message: "Please try again later.",
    },
  });

  async function issueSessionTokens(user) {
    const accessToken = tokenHelpers.issueMobileAccessToken(user);
    const refreshToken = tokenHelpers.issueMobileRefreshToken(user);
    const refreshPayload = tokenHelpers.verifyMobileRefreshToken(refreshToken);

    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: tokenHelpers.hashToken(refreshToken),
      expiresAt: tokenHelpers.getExpDateFromPayload(refreshPayload),
      revokedAt: null,
      lastUsedAt: null,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: tokenHelpers.ACCESS_EXPIRES_SECONDS,
      user: tokenHelpers.buildMobileUserPayload(user),
    };
  }

  function validateAllowedRole(user) {
    if (!tokenHelpers.ALLOWED_MOBILE_ROLES.has(String(user.role || ""))) {
      return {
        ok: false,
        status: 403,
        error: "Role not supported",
        message: "Mobile authentication currently supports admin and user roles only.",
      };
    }

    return { ok: true };
  }

  router.post("/login", loginLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || "");
      const password = String(req.body?.password || "");

      const authResult = await authHelpers.authenticateUserCredentials(
        UserModel,
        email,
        password,
      );

      if (!authResult.ok) {
        return res.status(authResult.status).json({
          error: authResult.error,
          ...(authResult.message ? { message: authResult.message } : {}),
        });
      }

      const roleCheck = validateAllowedRole(authResult.user);
      if (!roleCheck.ok) {
        return res.status(roleCheck.status).json({
          error: roleCheck.error,
          message: roleCheck.message,
        });
      }

      const payload = await issueSessionTokens(authResult.user);
      await authHelpers.writeLoginAudit(AuthLogModel, authResult.user, req);

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  });

  router.post("/refresh", refreshLimiter, async (req, res) => {
    try {
      const refreshToken = String(req.body?.refreshToken || "").trim();
      if (!refreshToken) {
        return res.status(400).json({ error: "refreshToken is required" });
      }

      let decoded;
      try {
        decoded = tokenHelpers.verifyMobileRefreshToken(refreshToken);
      } catch {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const tokenHash = tokenHelpers.hashToken(refreshToken);
      const storedToken = await RefreshTokenModel.findOne({ tokenHash });
      if (!storedToken) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      if (storedToken.revokedAt || storedToken.expiresAt <= new Date()) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const user = await UserModel.findById(decoded.sub)
        .select("_id name email role isApproved")
        .lean();
      if (!user) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      if (user.role !== "superadmin" && !user.isApproved) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const roleCheck = validateAllowedRole(user);
      if (!roleCheck.ok) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const nextRefreshToken = tokenHelpers.issueMobileRefreshToken(user);
      const nextRefreshPayload = tokenHelpers.verifyMobileRefreshToken(nextRefreshToken);
      const nextRefreshTokenHash = tokenHelpers.hashToken(nextRefreshToken);

      storedToken.revokedAt = new Date();
      storedToken.replacedByTokenHash = nextRefreshTokenHash;
      storedToken.lastUsedAt = new Date();
      await storedToken.save();

      await RefreshTokenModel.create({
        userId: user._id,
        tokenHash: nextRefreshTokenHash,
        expiresAt: tokenHelpers.getExpDateFromPayload(nextRefreshPayload),
        revokedAt: null,
      });

      const accessToken = tokenHelpers.issueMobileAccessToken(user);
      return res.json({
        accessToken,
        refreshToken: nextRefreshToken,
        expiresIn: tokenHelpers.ACCESS_EXPIRES_SECONDS,
      });
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }
  });

  router.post("/logout", async (req, res) => {
    try {
      const refreshToken = String(req.body?.refreshToken || "").trim();
      if (!refreshToken) {
        return res.status(400).json({ error: "refreshToken is required" });
      }

      try {
        tokenHelpers.verifyMobileRefreshToken(refreshToken);
      } catch {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const tokenHash = tokenHelpers.hashToken(refreshToken);
      const storedToken = await RefreshTokenModel.findOne({ tokenHash });
      if (!storedToken || storedToken.revokedAt || storedToken.expiresAt <= new Date()) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      storedToken.revokedAt = new Date();
      storedToken.lastUsedAt = new Date();
      await storedToken.save();

      return res.json({ success: true });
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }
  });

  router.get("/me", requireAuth, async (req, res) => {
    const userId = String(req.user?.id || req.apiUser?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized", message: "Missing user context" });
    }

    const user = await UserModel.findById(userId)
      .select("_id email name role")
      .lean();

    if (!user) {
      return res.status(401).json({ error: "Unauthorized", message: "User not found" });
    }

    if (!tokenHelpers.ALLOWED_MOBILE_ROLES.has(String(user.role || ""))) {
      return res.status(401).json({ error: "Unauthorized", message: "Role not supported" });
    }

    return res.json({ user: tokenHelpers.buildMobileUserPayload(user) });
  });

  return router;
}

module.exports = createMobileAuthRouter();
module.exports.createMobileAuthRouter = createMobileAuthRouter;
