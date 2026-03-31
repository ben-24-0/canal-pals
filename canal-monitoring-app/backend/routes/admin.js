const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");

const User = require("../models/User");
const CanalGroup = require("../models/CanalGroup");
const AuthLog = require("../models/AuthLog");
const {
  requireApiAuth,
  requireRoles,
} = require("../middleware/apiAuth");
const {
  normalizeObjectIds,
  getUserAccessProfile,
} = require("../lib/adminAccess");

const router = express.Router();

router.use(requireApiAuth, requireRoles("admin", "superadmin"));

function ensureValid(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;

  res.status(400).json({
    error: "Validation failed",
    details: errors.array(),
  });
  return res;
}

async function resolveManagerAdminId(req, requestedAdminId = null) {
  const actorRole = req.apiUser?.role;
  const actorId = String(req.apiUser?.id || "").trim();

  if (actorRole === "admin") {
    return actorId;
  }

  const candidate = String(requestedAdminId || "").trim();
  if (!candidate) return null;
  if (!mongoose.Types.ObjectId.isValid(candidate)) return null;

  const admin = await User.findOne({ _id: candidate, role: "admin" })
    .select("_id")
    .lean();

  return admin ? String(admin._id) : null;
}

async function buildManagedUserView(user) {
  const profile = await getUserAccessProfile(user._id, user);

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isApproved: Boolean(user.isApproved),
    managedByAdminId: user.managedByAdminId
      ? String(user.managedByAdminId)
      : null,
    inheritedGroupIds: profile.inheritedGroupIds,
    extraGroupIds: profile.extraGroupIds,
    effectiveGroupIds: profile.effectiveGroupIds,
    allowedDeviceIds: profile.allowedDeviceIds,
    hiddenDeviceIds: profile.hiddenDeviceIds,
    effectiveCanalIds: profile.effectiveCanalIds,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// GET /api/admin/users
router.get("/users", async (req, res) => {
  try {
    const actorRole = req.apiUser?.role;
    const actorId = String(req.apiUser?.id || "").trim();

    const query = {
      role: "user",
    };

    if (actorRole === "admin") {
      query.managedByAdminId = actorId;
    } else if (req.query.adminUserId) {
      const manager = await resolveManagerAdminId(req, req.query.adminUserId);
      if (!manager) {
        return res.status(400).json({
          error: "Invalid adminUserId",
        });
      }
      query.managedByAdminId = manager;
    }

    const users = await User.find(query)
      .select(
        "_id name email role isApproved managedByAdminId extraGroupIds allowedDeviceIds hiddenDeviceIds createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    const data = await Promise.all(users.map((user) => buildManagedUserView(user)));

    return res.json({ users: data });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load managed users",
      message: error.message,
    });
  }
});

// POST /api/admin/users
router.post(
  "/users",
  [
    body("name").isString().trim().isLength({ min: 2, max: 100 }),
    body("email").isEmail(),
    body("password").isString().isLength({ min: 6, max: 120 }),
    body("managedByAdminId").optional({ nullable: true }).isString(),
    body("extraGroupIds").optional().isArray(),
    body("allowedDeviceIds").optional().isArray(),
    body("hiddenDeviceIds").optional().isArray(),
  ],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const managerAdminId = await resolveManagerAdminId(
        req,
        req.body.managedByAdminId,
      );

      if (!managerAdminId) {
        return res.status(400).json({
          error: "A valid managing admin is required",
        });
      }

      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "").toLowerCase().trim();
      const password = String(req.body.password || "");

      const existing = await User.findOne({ email }).select("_id").lean();
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const extraGroupIds = normalizeObjectIds(req.body.extraGroupIds || []);
      if (extraGroupIds.length > 0) {
        const groups = await CanalGroup.find({ _id: { $in: extraGroupIds } })
          .select("_id")
          .lean();
        const found = new Set(groups.map((group) => String(group._id)));
        const missing = extraGroupIds.filter((id) => !found.has(id));
        if (missing.length > 0) {
          return res.status(400).json({
            error: "Some group IDs are invalid",
            missingGroupIds: missing,
          });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await User.create({
        name,
        email,
        passwordHash,
        role: "user",
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: req.apiUser?.id || null,
        managedByAdminId: managerAdminId,
        extraGroupIds,
        allowedDeviceIds: req.body.allowedDeviceIds || [],
        hiddenDeviceIds: req.body.hiddenDeviceIds || [],
        assignedCanals: [],
        favouriteCanals: [],
      });

      const view = await buildManagedUserView(user.toObject());

      return res.status(201).json({
        success: true,
        message: "User created successfully",
        user: view,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to create user",
        message: error.message,
      });
    }
  },
);

// GET /api/admin/login-logs
router.get("/login-logs", async (req, res) => {
  try {
    const actorRole = req.apiUser?.role;
    const actorId = String(req.apiUser?.id || "").trim();

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50),
    );
    const skip = (page - 1) * limit;

    const query = {};
    if (actorRole === "admin") {
      query.role = "user";
      query.managedByAdminId = actorId;
    } else {
      const roleFilter = String(req.query.role || "").trim();
      if (["admin", "user"].includes(roleFilter)) {
        query.role = roleFilter;
      }

      if (req.query.managedByAdminId) {
        const manager = await resolveManagerAdminId(req, req.query.managedByAdminId);
        if (!manager) {
          return res.status(400).json({ error: "Invalid managedByAdminId" });
        }
        query.managedByAdminId = manager;
      }
    }

    const [logs, total] = await Promise.all([
      AuthLog.find(query)
        .sort({ loginAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuthLog.countDocuments(query),
    ]);

    const userIds = [...new Set(logs.map((log) => String(log.userId || "")))].filter(
      Boolean,
    );

    const users =
      userIds.length > 0
        ? await User.find({ _id: { $in: userIds } })
            .select("_id name email managedByAdminId")
            .lean()
        : [];

    const userMap = new Map(users.map((user) => [String(user._id), user]));

    return res.json({
      logs: logs.map((log) => {
        const user = userMap.get(String(log.userId));
        return {
          id: String(log._id),
          userId: String(log.userId),
          role: log.role,
          email: log.email,
          loginAt: log.loginAt,
          ipAddress: log.ipAddress || "",
          userAgent: log.userAgent || "",
          managedByAdminId: log.managedByAdminId
            ? String(log.managedByAdminId)
            : null,
          userName: user?.name || "Unknown",
        };
      }),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load login logs",
      message: error.message,
    });
  }
});

module.exports = router;
