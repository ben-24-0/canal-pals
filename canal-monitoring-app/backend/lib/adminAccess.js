const mongoose = require("mongoose");
const User = require("../models/User");
const CanalGroup = require("../models/CanalGroup");
const Canal = require("../models/Canal");
const DeviceRegistry = require("../models/DeviceRegistry");

function normalizeCanalIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((v) => String(v || "").toLowerCase().trim())
        .filter(Boolean),
    ),
  ];
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

function normalizeDeviceIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((v) => String(v || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

async function getCanalIdsForGroupIds(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) return [];

  const groups = await CanalGroup.find({
    _id: { $in: groupIds },
    isActive: true,
  })
    .select("canalIds")
    .lean();

  return normalizeCanalIds(groups.flatMap((group) => group.canalIds || []));
}

async function getCanalIdsFromDeviceIds(deviceIds) {
  const normalizedDeviceIds = normalizeDeviceIds(deviceIds);
  if (normalizedDeviceIds.length === 0) return [];

  const [canals, registry] = await Promise.all([
    Canal.find({ esp32DeviceId: { $in: normalizedDeviceIds } })
      .select("canalId")
      .lean(),
    DeviceRegistry.find({ deviceId: { $in: normalizedDeviceIds } })
      .select("canalId")
      .lean(),
  ]);

  const fromCanals = canals.map((item) => item.canalId);
  const fromRegistry = registry.map((item) => item.canalId);
  return normalizeCanalIds([...fromCanals, ...fromRegistry]);
}

async function getAdminGroupSnapshot(adminUserId) {
  if (!mongoose.Types.ObjectId.isValid(String(adminUserId || ""))) {
    return { groupIds: [], canalIds: [] };
  }

  const groups = await CanalGroup.find({
    isActive: true,
    adminUserIds: adminUserId,
  })
    .select("_id canalIds")
    .lean();

  return {
    groupIds: groups.map((group) => String(group._id)),
    canalIds: normalizeCanalIds(groups.flatMap((group) => group.canalIds || [])),
  };
}

async function getAccessibleCanalIdsForAdmin(userId, userDoc = null) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
    return [];
  }

  let user = userDoc;
  if (!user) {
    user = await User.findById(userId)
      .select("_id role assignedCanals")
      .lean();
  }

  if (!user || user.role !== "admin") {
    return [];
  }

  const directCanals = normalizeCanalIds(user.assignedCanals);
  const grouped = await getAdminGroupSnapshot(user._id);
  const groupedCanals = grouped.canalIds;

  return [...new Set([...directCanals, ...groupedCanals])];
}

async function getUserAccessProfile(userId, userDoc = null) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
    return {
      user: null,
      inheritedGroupIds: [],
      extraGroupIds: [],
      effectiveGroupIds: [],
      allowedDeviceIds: [],
      hiddenDeviceIds: [],
      effectiveCanalIds: [],
    };
  }

  let user = userDoc;
  if (!user) {
    user = await User.findById(userId)
      .select(
        "_id role isApproved managedByAdminId extraGroupIds allowedDeviceIds hiddenDeviceIds",
      )
      .lean();
  }

  if (!user || user.role !== "user" || !user.isApproved) {
    return {
      user,
      inheritedGroupIds: [],
      extraGroupIds: [],
      effectiveGroupIds: [],
      allowedDeviceIds: normalizeDeviceIds(user?.allowedDeviceIds),
      hiddenDeviceIds: normalizeDeviceIds(user?.hiddenDeviceIds),
      effectiveCanalIds: [],
    };
  }

  const inherited = await getAdminGroupSnapshot(user.managedByAdminId);
  const extraGroupIds = normalizeObjectIds(user.extraGroupIds);
  const extraGroupCanals = await getCanalIdsForGroupIds(extraGroupIds);
  const allowedDeviceIds = normalizeDeviceIds(user.allowedDeviceIds);
  const hiddenDeviceIds = normalizeDeviceIds(user.hiddenDeviceIds);

  const [canalsFromAllowedDevices, canalsFromHiddenDevices] =
    await Promise.all([
      getCanalIdsFromDeviceIds(allowedDeviceIds),
      getCanalIdsFromDeviceIds(hiddenDeviceIds),
    ]);

  const effectiveCanalIds = normalizeCanalIds([
    ...inherited.canalIds,
    ...extraGroupCanals,
    ...canalsFromAllowedDevices,
  ]).filter((canalId) => !canalsFromHiddenDevices.includes(canalId));

  return {
    user,
    inheritedGroupIds: inherited.groupIds,
    extraGroupIds,
    effectiveGroupIds: [...new Set([...inherited.groupIds, ...extraGroupIds])],
    allowedDeviceIds,
    hiddenDeviceIds,
    effectiveCanalIds,
  };
}

async function getAccessibleCanalIdsForUser(userId, userDoc = null) {
  const profile = await getUserAccessProfile(userId, userDoc);
  return profile.effectiveCanalIds;
}

async function getViewerContext(viewerUserId) {
  if (!viewerUserId || !mongoose.Types.ObjectId.isValid(String(viewerUserId))) {
    return { user: null, role: null, accessibleCanalIds: null };
  }

  const user = await User.findById(viewerUserId)
    .select(
      "_id role isApproved assignedCanals managedByAdminId extraGroupIds allowedDeviceIds hiddenDeviceIds",
    )
    .lean();

  if (!user) {
    return { user: null, role: null, accessibleCanalIds: [] };
  }

  if (user.role === "superadmin") {
    return { user, role: user.role, accessibleCanalIds: null };
  }

  if (user.role === "admin") {
    const accessibleCanalIds = await getAccessibleCanalIdsForAdmin(
      viewerUserId,
      user,
    );
    return { user, role: user.role, accessibleCanalIds };
  }

  if (user.role === "user") {
    const accessibleCanalIds = await getAccessibleCanalIdsForUser(
      viewerUserId,
      user,
    );
    return { user, role: user.role, accessibleCanalIds };
  }

  return { user, role: user.role, accessibleCanalIds: [] };
}

module.exports = {
  normalizeCanalIds,
  normalizeObjectIds,
  normalizeDeviceIds,
  getCanalIdsForGroupIds,
  getCanalIdsFromDeviceIds,
  getAdminGroupSnapshot,
  getUserAccessProfile,
  getAccessibleCanalIdsForAdmin,
  getAccessibleCanalIdsForUser,
  getViewerContext,
};
