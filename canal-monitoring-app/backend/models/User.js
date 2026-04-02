const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    managedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    extraGroupIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CanalGroup",
      },
    ],
    allowedDeviceIds: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],
    hiddenDeviceIds: [
      {
        type: String,
        trim: true,
        uppercase: true,
      },
    ],
    assignedCanals: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    favouriteCanals: [
      {
        type: String,
        trim: true,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "users",
    timestamps: true,
  },
);

function dedupeNormalized(values, normalize) {
  if (!Array.isArray(values)) return [];

  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const value = normalize(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

userSchema.pre("save", function (next) {
  this.assignedCanals = dedupeNormalized(this.assignedCanals, (v) =>
    String(v || "")
      .trim()
      .toLowerCase(),
  );

  this.favouriteCanals = dedupeNormalized(this.favouriteCanals, (v) =>
    String(v || "").trim(),
  );

  this.allowedDeviceIds = dedupeNormalized(this.allowedDeviceIds, (v) =>
    String(v || "")
      .trim()
      .toUpperCase(),
  );

  this.hiddenDeviceIds = dedupeNormalized(this.hiddenDeviceIds, (v) =>
    String(v || "")
      .trim()
      .toUpperCase(),
  );

  this.extraGroupIds = dedupeNormalized(this.extraGroupIds, (v) =>
    String(v || "").trim(),
  );

  next();
});

module.exports = mongoose.model("User", userSchema);
