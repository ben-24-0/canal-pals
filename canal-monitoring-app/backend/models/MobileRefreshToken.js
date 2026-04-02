const mongoose = require("mongoose");

const mobileRefreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    replacedByTokenHash: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "mobile_refresh_tokens",
    timestamps: true,
  },
);

mobileRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
mobileRefreshTokenSchema.index({ userId: 1, revokedAt: 1 });

module.exports = mongoose.model("MobileRefreshToken", mobileRefreshTokenSchema);
