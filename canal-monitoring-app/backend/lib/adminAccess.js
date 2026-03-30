const mongoose = require("mongoose");
const User = require("../models/User");
const CanalGroup = require("../models/CanalGroup");

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

  const groups = await CanalGroup.find({
    isActive: true,
    adminUserIds: user._id,
  })
    .select("canalIds")
    .lean();

  const groupedCanals = groups.flatMap((group) => normalizeCanalIds(group.canalIds));

  return [...new Set([...directCanals, ...groupedCanals])];
}

async function getViewerContext(viewerUserId) {
  if (!viewerUserId || !mongoose.Types.ObjectId.isValid(String(viewerUserId))) {
    return { user: null, role: null, accessibleCanalIds: null };
  }

  const user = await User.findById(viewerUserId)
    .select("_id role assignedCanals")
    .lean();

  if (!user) {
    return { user: null, role: null, accessibleCanalIds: [] };
  }

  if (user.role !== "admin") {
    return { user, role: user.role, accessibleCanalIds: null };
  }

  const accessibleCanalIds = await getAccessibleCanalIdsForAdmin(viewerUserId, user);
  return { user, role: user.role, accessibleCanalIds };
}

module.exports = {
  normalizeCanalIds,
  getAccessibleCanalIdsForAdmin,
  getViewerContext,
};
