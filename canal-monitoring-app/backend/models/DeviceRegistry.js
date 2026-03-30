const mongoose = require("mongoose");

const deviceRegistrySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "decommissioned"],
      default: "active",
      index: true,
    },
    canalId: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    decommissionReason: {
      type: String,
      trim: true,
      default: "",
    },
    decommissionedAt: {
      type: Date,
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "device_registry",
    timestamps: true,
  },
);

deviceRegistrySchema.index({ canalId: 1 });

deviceRegistrySchema.pre("save", function (next) {
  this.deviceId = String(this.deviceId || "")
    .trim()
    .toUpperCase();

  if (this.canalId) {
    this.canalId = String(this.canalId).toLowerCase().trim();
  }

  next();
});

module.exports = mongoose.model("DeviceRegistry", deviceRegistrySchema);
