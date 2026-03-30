const mongoose = require("mongoose");

const deviceSettingsSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    canalId: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    sendIntervalMs: {
      type: Number,
      min: 1,
    },
    forceReadNow: {
      type: Boolean,
    },
    topic: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ["api", "mqtt", "restore"],
      default: "api",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "device_settings",
  },
);

deviceSettingsSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("DeviceSettings", deviceSettingsSchema);