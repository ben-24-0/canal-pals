const mongoose = require("mongoose");

const authLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    managedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      required: true,
      index: true,
    },
    loginAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: "",
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  {
    collection: "auth_logs",
    timestamps: true,
  },
);

authLogSchema.index({ loginAt: -1, role: 1 });
authLogSchema.index({ managedByAdminId: 1, loginAt: -1 });

module.exports = mongoose.model("AuthLog", authLogSchema);
