const express = require("express");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");

const User = require("../models/User");
const Canal = require("../models/Canal");
const CanalGroup = require("../models/CanalGroup");
const DeviceRegistry = require("../models/DeviceRegistry");
const DeviceSettings = require("../models/DeviceSettings");
const {
  requireApiAuth,
  requireRoles,
} = require("../middleware/apiAuth");
const {
  normalizeCanalIds,
  getAccessibleCanalIdsForAdmin,
} = require("../lib/adminAccess");

const router = express.Router();

router.use(requireApiAuth, requireRoles("superadmin"));

function normalizeDeviceId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeObjectIds(values) {
  if (!Array.isArray(values)) return [];

  const out = [];
  const seen = new Set();
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (!mongoose.Types.ObjectId.isValid(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }

  return out;
}

function ensureValid(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;

  res.status(400).json({
    error: "Validation failed",
    details: errors.array(),
  });
  return res;
}

async function ensureCanalsExist(canalIds) {
  if (canalIds.length === 0) return { ok: true, missing: [] };

  const canals = await Canal.find({
    canalId: { $in: canalIds },
  })
    .select("canalId")
    .lean();

  const existing = new Set(canals.map((c) => c.canalId));
  const missing = canalIds.filter((canalId) => !existing.has(canalId));

  return {
    ok: missing.length === 0,
    missing,
  };
}

async function ensureAdminUsersExist(adminUserIds) {
  if (adminUserIds.length === 0) return { ok: true, missing: [] };

  const admins = await User.find({
    _id: { $in: adminUserIds },
    role: "admin",
  })
    .select("_id")
    .lean();

  const existing = new Set(admins.map((u) => u._id.toString()));
  const missing = adminUserIds.filter((id) => !existing.has(id));

  return {
    ok: missing.length === 0,
    missing,
  };
}

async function buildGroupHydration(groups) {
  const adminIds = [...new Set(groups.flatMap((g) => g.adminUserIds || []).map((id) => String(id)))];

  const adminUsers =
    adminIds.length > 0
      ? await User.find({ _id: { $in: adminIds } })
          .select("_id name email role")
          .lean()
      : [];

  const adminMap = new Map(
    adminUsers.map((u) => [u._id.toString(), {
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
    }]),
  );

  return groups.map((group) => ({
    id: group._id.toString(),
    name: group.name,
    description: group.description || "",
    canalIds: normalizeCanalIds(group.canalIds),
    adminUserIds: (group.adminUserIds || []).map((id) => String(id)),
    admins: (group.adminUserIds || [])
      .map((id) => adminMap.get(String(id)))
      .filter(Boolean),
    isActive: group.isActive !== false,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  }));
}

// GET /api/super-admin/summary
router.get("/summary", async (_req, res) => {
  try {
    const [users, admins, superadmins, canals, activeCanals, groups, devices] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ role: "superadmin" }),
        Canal.countDocuments({}),
        Canal.countDocuments({ isActive: true }),
        CanalGroup.countDocuments({ isActive: true }),
        DeviceRegistry.countDocuments({}),
      ]);

    return res.json({
      users,
      admins,
      superadmins,
      canals,
      activeCanals,
      canalGroups: groups,
      devices,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load summary",
      message: error.message,
    });
  }
});

// GET /api/super-admin/users
router.get("/users", async (req, res) => {
  try {
    const roleFilter = String(req.query.role || "").trim();
    const query = {};
    if (["user", "admin", "superadmin"].includes(roleFilter)) {
      query.role = roleFilter;
    }

    const users = await User.find(query)
      .select("_id name email role assignedCanals favouriteCanals createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();

    const adminUsers = users.filter((u) => u.role === "admin");
    const adminIds = adminUsers.map((u) => u._id.toString());

    const groups =
      adminIds.length > 0
        ? await CanalGroup.find({
            isActive: true,
            adminUserIds: { $in: adminIds },
          })
            .select("name canalIds adminUserIds")
            .lean()
        : [];

    const groupsByAdmin = new Map();
    for (const group of groups) {
      for (const adminId of group.adminUserIds || []) {
        const key = String(adminId);
        if (!groupsByAdmin.has(key)) groupsByAdmin.set(key, []);
        groupsByAdmin.get(key).push(group);
      }
    }

    const data = await Promise.all(
      users.map(async (user) => {
        const id = user._id.toString();
        const directAssignedCanals = normalizeCanalIds(user.assignedCanals);
        const belongingGroups = groupsByAdmin.get(id) || [];

        const groupedCanals = normalizeCanalIds(
          belongingGroups.flatMap((group) => group.canalIds || []),
        );

        const effectiveCanalIds =
          user.role === "admin"
            ? [...new Set([...directAssignedCanals, ...groupedCanals])]
            : [];

        return {
          id,
          name: user.name,
          email: user.email,
          role: user.role,
          favouriteCanals: normalizeCanalIds(user.favouriteCanals),
          directAssignedCanals,
          effectiveCanalIds,
          groupIds: belongingGroups.map((group) => group._id.toString()),
          groupNames: belongingGroups.map((group) => group.name),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      }),
    );

    return res.json({ users: data });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load users",
      message: error.message,
    });
  }
});

// PATCH /api/super-admin/users/:userId/role
router.patch(
  "/users/:userId/role",
  [body("role").isIn(["user", "admin", "superadmin"])],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const userId = String(req.params.userId || "").trim();
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          error: "Invalid userId",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const nextRole = req.body.role;
      const previousRole = user.role;

      if (previousRole === nextRole) {
        return res.json({
          success: true,
          message: `Role for ${user.email} is already ${nextRole}`,
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
          },
        });
      }

      if (previousRole === "superadmin" && nextRole !== "superadmin") {
        const superAdminCount = await User.countDocuments({
          role: "superadmin",
        });

        if (superAdminCount <= 1) {
          return res.status(400).json({
            error: "Cannot demote the last superadmin",
          });
        }
      }

      user.role = nextRole;

      if (nextRole !== "admin") {
        user.assignedCanals = [];
        await CanalGroup.updateMany(
          { adminUserIds: user._id },
          { $pull: { adminUserIds: user._id } },
        );
      }

      await user.save();

      return res.json({
        success: true,
        message: `Updated role for ${user.email} to ${nextRole}`,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to update user role",
        message: error.message,
      });
    }
  },
);

// DELETE /api/super-admin/users/:userId
router.delete("/users/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "Invalid userId",
      });
    }

    if (req.apiUser?.id === userId) {
      return res.status(400).json({
        error: "You cannot delete your own active session account",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "superadmin") {
      const superAdminCount = await User.countDocuments({
        role: "superadmin",
      });

      if (superAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot delete the last superadmin",
        });
      }
    }

    await CanalGroup.updateMany(
      { adminUserIds: user._id },
      { $pull: { adminUserIds: user._id } },
    );

    await User.deleteOne({ _id: user._id });

    return res.json({
      success: true,
      deletedUserId: userId,
      deletedEmail: user.email,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to delete user",
      message: error.message,
    });
  }
});

async function loadAdminUser(userId, res) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return null;
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  if (user.role !== "admin") {
    res.status(400).json({
      error: "Target user is not an admin",
      message: "Only admin users can have canal assignments",
    });
    return null;
  }

  return user;
}

// POST /api/super-admin/users/:userId/canals (add assignments)
router.post(
  "/users/:userId/canals",
  [body("canalIds").isArray({ min: 1 })],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const user = await loadAdminUser(String(req.params.userId || "").trim(), res);
      if (!user) return;

      const canalIds = normalizeCanalIds(req.body.canalIds);
      if (canalIds.length === 0) {
        return res.status(400).json({ error: "No valid canal IDs supplied" });
      }

      const canalsCheck = await ensureCanalsExist(canalIds);
      if (!canalsCheck.ok) {
        return res.status(400).json({
          error: "Some canal IDs do not exist",
          missing: canalsCheck.missing,
        });
      }

      const next = new Set(normalizeCanalIds(user.assignedCanals));
      for (const canalId of canalIds) next.add(canalId);
      user.assignedCanals = [...next];

      await user.save();

      const effectiveCanalIds = await getAccessibleCanalIdsForAdmin(user._id);

      return res.json({
        success: true,
        assignedCanals: normalizeCanalIds(user.assignedCanals),
        effectiveCanalIds,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to assign canals",
        message: error.message,
      });
    }
  },
);

// DELETE /api/super-admin/users/:userId/canals (remove assignments)
router.delete(
  "/users/:userId/canals",
  [body("canalIds").isArray({ min: 1 })],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const user = await loadAdminUser(String(req.params.userId || "").trim(), res);
      if (!user) return;

      const removeIds = new Set(normalizeCanalIds(req.body.canalIds));
      const nextAssigned = normalizeCanalIds(user.assignedCanals).filter(
        (canalId) => !removeIds.has(canalId),
      );
      user.assignedCanals = nextAssigned;

      await user.save();

      const effectiveCanalIds = await getAccessibleCanalIdsForAdmin(user._id);

      return res.json({
        success: true,
        assignedCanals: normalizeCanalIds(user.assignedCanals),
        effectiveCanalIds,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to remove canal assignments",
        message: error.message,
      });
    }
  },
);

// PUT /api/super-admin/users/:userId/canals (replace direct assignments)
router.put(
  "/users/:userId/canals",
  [body("canalIds").optional().isArray()],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const user = await loadAdminUser(String(req.params.userId || "").trim(), res);
      if (!user) return;

      const canalIds = normalizeCanalIds(req.body.canalIds || []);
      if (canalIds.length > 0) {
        const canalsCheck = await ensureCanalsExist(canalIds);
        if (!canalsCheck.ok) {
          return res.status(400).json({
            error: "Some canal IDs do not exist",
            missing: canalsCheck.missing,
          });
        }
      }

      user.assignedCanals = canalIds;
      await user.save();

      const effectiveCanalIds = await getAccessibleCanalIdsForAdmin(user._id);

      return res.json({
        success: true,
        assignedCanals: normalizeCanalIds(user.assignedCanals),
        effectiveCanalIds,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to replace canal assignments",
        message: error.message,
      });
    }
  },
);

// GET /api/super-admin/groups
router.get("/groups", async (_req, res) => {
  try {
    const groups = await CanalGroup.find({}).sort({ name: 1 }).lean();
    return res.json({ groups: await buildGroupHydration(groups) });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load canal groups",
      message: error.message,
    });
  }
});

// POST /api/super-admin/groups
router.post(
  "/groups",
  [body("name").isString().trim().isLength({ min: 2, max: 120 })],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const name = String(req.body.name).trim();
      const description = String(req.body.description || "").trim();
      const canalIds = normalizeCanalIds(req.body.canalIds || []);
      const adminUserIds = normalizeObjectIds(req.body.adminUserIds || []);

      const canalsCheck = await ensureCanalsExist(canalIds);
      if (!canalsCheck.ok) {
        return res.status(400).json({
          error: "Some canal IDs do not exist",
          missing: canalsCheck.missing,
        });
      }

      const adminsCheck = await ensureAdminUsersExist(adminUserIds);
      if (!adminsCheck.ok) {
        return res.status(400).json({
          error: "Some admin users are invalid",
          missingAdminUserIds: adminsCheck.missing,
        });
      }

      const group = await CanalGroup.create({
        name,
        description,
        canalIds,
        adminUserIds,
        isActive: req.body.isActive !== false,
      });

      const hydrated = await buildGroupHydration([group.toObject()]);

      return res.status(201).json({
        success: true,
        group: hydrated[0],
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          error: "Group name already exists",
        });
      }

      return res.status(500).json({
        error: "Failed to create canal group",
        message: error.message,
      });
    }
  },
);

// PATCH /api/super-admin/groups/:groupId
router.patch(
  "/groups/:groupId",
  [
    body("name").optional().isString().trim().isLength({ min: 2, max: 120 }),
    body("description").optional().isString(),
    body("canalIds").optional().isArray(),
    body("adminUserIds").optional().isArray(),
    body("isActive").optional().isBoolean(),
  ],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const groupId = String(req.params.groupId || "").trim();
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({ error: "Invalid groupId" });
      }

      const group = await CanalGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      if (req.body.name !== undefined) {
        group.name = String(req.body.name).trim();
      }
      if (req.body.description !== undefined) {
        group.description = String(req.body.description || "").trim();
      }
      if (req.body.isActive !== undefined) {
        group.isActive = Boolean(req.body.isActive);
      }

      if (req.body.canalIds !== undefined) {
        const canalIds = normalizeCanalIds(req.body.canalIds);
        const canalsCheck = await ensureCanalsExist(canalIds);
        if (!canalsCheck.ok) {
          return res.status(400).json({
            error: "Some canal IDs do not exist",
            missing: canalsCheck.missing,
          });
        }
        group.canalIds = canalIds;
      }

      if (req.body.adminUserIds !== undefined) {
        const adminUserIds = normalizeObjectIds(req.body.adminUserIds);
        const adminsCheck = await ensureAdminUsersExist(adminUserIds);
        if (!adminsCheck.ok) {
          return res.status(400).json({
            error: "Some admin users are invalid",
            missingAdminUserIds: adminsCheck.missing,
          });
        }
        group.adminUserIds = adminUserIds;
      }

      await group.save();

      const hydrated = await buildGroupHydration([group.toObject()]);
      return res.json({ success: true, group: hydrated[0] });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({
          error: "Group name already exists",
        });
      }

      return res.status(500).json({
        error: "Failed to update canal group",
        message: error.message,
      });
    }
  },
);

// DELETE /api/super-admin/groups/:groupId
router.delete("/groups/:groupId", async (req, res) => {
  try {
    const groupId = String(req.params.groupId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ error: "Invalid groupId" });
    }

    const deleted = await CanalGroup.findByIdAndDelete(groupId);
    if (!deleted) {
      return res.status(404).json({ error: "Group not found" });
    }

    return res.json({ success: true, deletedGroupId: groupId });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to delete canal group",
      message: error.message,
    });
  }
});

// GET /api/super-admin/devices
router.get("/devices", async (_req, res) => {
  try {
    const devices = await DeviceRegistry.find({})
      .sort({ deviceId: 1 })
      .lean();

    return res.json({ devices });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load devices",
      message: error.message,
    });
  }
});

// POST /api/super-admin/devices
router.post(
  "/devices",
  [body("deviceId").isString().trim().isLength({ min: 3, max: 120 })],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const deviceId = normalizeDeviceId(req.body.deviceId);
      const canalId = req.body.canalId
        ? String(req.body.canalId).toLowerCase().trim()
        : null;

      if (!deviceId) {
        return res.status(400).json({ error: "Invalid deviceId" });
      }

      if (canalId) {
        const canal = await Canal.findOne({ canalId });
        if (!canal) {
          return res.status(404).json({ error: "Canal not found" });
        }

        if (canal.esp32DeviceId && canal.esp32DeviceId !== deviceId) {
          return res.status(409).json({
            error: "Canal already bound to a different device",
            expectedDeviceId: canal.esp32DeviceId,
          });
        }

        await Canal.updateMany(
          { esp32DeviceId: deviceId, canalId: { $ne: canalId } },
          { $unset: { esp32DeviceId: 1 }, $set: { updatedAt: new Date() } },
        );

        canal.esp32DeviceId = deviceId;
        await canal.save();
      }

      const device = await DeviceRegistry.findOneAndUpdate(
        { deviceId },
        {
          $set: {
            deviceId,
            status: "active",
            canalId,
            decommissionReason: "",
            decommissionedAt: null,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      return res.status(201).json({ success: true, device });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to register device",
        message: error.message,
      });
    }
  },
);

// PATCH /api/super-admin/devices/:deviceId/assign
router.patch(
  "/devices/:deviceId/assign",
  [body("canalId").optional({ nullable: true }).isString().trim()],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const canalIdRaw = req.body.canalId;
      const canalId =
        canalIdRaw === null || canalIdRaw === ""
          ? null
          : String(canalIdRaw).toLowerCase().trim();

      if (!deviceId) {
        return res.status(400).json({ error: "Invalid deviceId" });
      }

      if (!canalId) {
        await Canal.updateMany(
          { esp32DeviceId: deviceId },
          { $unset: { esp32DeviceId: 1 }, $set: { updatedAt: new Date() } },
        );

        const device = await DeviceRegistry.findOneAndUpdate(
          { deviceId },
          {
            $set: {
              status: "active",
              canalId: null,
              decommissionReason: "",
              decommissionedAt: null,
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        );

        return res.json({ success: true, device });
      }

      const canal = await Canal.findOne({ canalId });
      if (!canal) {
        return res.status(404).json({ error: "Canal not found" });
      }

      if (canal.esp32DeviceId && canal.esp32DeviceId !== deviceId) {
        return res.status(409).json({
          error: "Canal already bound to a different device",
          expectedDeviceId: canal.esp32DeviceId,
        });
      }

      await Canal.updateMany(
        { esp32DeviceId: deviceId, canalId: { $ne: canalId } },
        { $unset: { esp32DeviceId: 1 }, $set: { updatedAt: new Date() } },
      );

      canal.esp32DeviceId = deviceId;
      await canal.save();

      const device = await DeviceRegistry.findOneAndUpdate(
        { deviceId },
        {
          $set: {
            status: "active",
            canalId,
            decommissionReason: "",
            decommissionedAt: null,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );

      return res.json({ success: true, device });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to update device assignment",
        message: error.message,
      });
    }
  },
);

// POST /api/super-admin/devices/:deviceId/decommission
router.post(
  "/devices/:deviceId/decommission",
  [body("reason").optional().isString().trim().isLength({ max: 300 })],
  async (req, res) => {
    if (ensureValid(req, res)) return;

    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const reason = String(req.body.reason || "").trim();

      if (!deviceId) {
        return res.status(400).json({ error: "Invalid deviceId" });
      }

      await Canal.updateMany(
        { esp32DeviceId: deviceId },
        { $unset: { esp32DeviceId: 1 }, $set: { updatedAt: new Date() } },
      );

      await DeviceSettings.deleteOne({ deviceId });

      const device = await DeviceRegistry.findOneAndUpdate(
        { deviceId },
        {
          $set: {
            status: "decommissioned",
            canalId: null,
            decommissionReason: reason,
            decommissionedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );

      return res.json({ success: true, device });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to decommission device",
        message: error.message,
      });
    }
  },
);

// POST /api/super-admin/devices/:deviceId/recommission
router.post("/devices/:deviceId/recommission", async (req, res) => {
  try {
    const deviceId = normalizeDeviceId(req.params.deviceId);
    if (!deviceId) {
      return res.status(400).json({ error: "Invalid deviceId" });
    }

    const device = await DeviceRegistry.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          status: "active",
          decommissionReason: "",
          decommissionedAt: null,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json({ success: true, device });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to recommission device",
      message: error.message,
    });
  }
});

// DELETE /api/super-admin/devices/:deviceId
router.delete("/devices/:deviceId", async (req, res) => {
  try {
    const deviceId = normalizeDeviceId(req.params.deviceId);
    if (!deviceId) {
      return res.status(400).json({ error: "Invalid deviceId" });
    }

    await Canal.updateMany(
      { esp32DeviceId: deviceId },
      { $unset: { esp32DeviceId: 1 }, $set: { updatedAt: new Date() } },
    );

    await DeviceSettings.deleteOne({ deviceId });

    const deleted = await DeviceRegistry.findOneAndDelete({ deviceId });
    if (!deleted) {
      return res.status(404).json({ error: "Device not found" });
    }

    return res.json({ success: true, deletedDeviceId: deviceId });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to delete device",
      message: error.message,
    });
  }
});

module.exports = router;
