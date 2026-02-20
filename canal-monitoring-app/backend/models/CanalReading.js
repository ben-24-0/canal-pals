const mongoose = require("mongoose");

const canalReadingSchema = new mongoose.Schema(
  {
    canalId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    esp32DeviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["FLOWING", "STOPPED", "LOW_FLOW", "HIGH_FLOW", "BLOCKED", "ERROR"],
      required: true,
      default: "STOPPED",
    },
    flowRate: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (value) {
          return value >= 0 && value <= 1000; // Maximum reasonable flow rate
        },
        message: "Flow rate must be between 0 and 1000",
      },
    },
    speed: {
      type: Number,
      min: 0,
      validate: {
        validator: function (value) {
          return value == null || (value >= 0 && value <= 50);
        },
        message: "Speed must be between 0 and 50",
      },
    },
    discharge: {
      type: Number,
      min: 0,
      validate: {
        validator: function (value) {
          return value == null || (value >= 0 && value <= 10000);
        },
        message: "Discharge must be between 0 and 10000",
      },
    },
    waterLevel: {
      type: Number,
      min: 0,
      default: 0,
    },
    depth: {
      type: Number,
      min: 0,
    },
    calculatedArea: {
      type: Number,
      min: 0,
    },
    calculatedHydraulicRadius: {
      type: Number,
      min: 0,
    },
    wettedPerimeter: {
      type: Number,
      min: 0,
    },
    sensorType: {
      type: String,
      enum: ["radar", "ultrasonic"],
    },
    temperature: {
      type: Number,
      min: -50,
      max: 100, // in Celsius
      validate: {
        validator: function (value) {
          return value >= -50 && value <= 100;
        },
        message: "Temperature must be between -50 and 100 degrees Celsius",
      },
    },
    pH: {
      type: Number,
      min: 0,
      max: 14,
      validate: {
        validator: function (value) {
          return value >= 0 && value <= 14;
        },
        message: "pH must be between 0 and 14",
      },
    },
    turbidity: {
      type: Number,
      min: 0,
      default: 0, // NTU units
    },
    batteryLevel: {
      type: Number,
      min: 0,
      max: 100,
      validate: {
        validator: function (value) {
          return value >= 0 && value <= 100;
        },
        message: "Battery level must be between 0 and 100",
      },
    },
    signalStrength: {
      type: Number,
      min: -120,
      max: 0, // RSSI in dBm
    },
    gpsCoordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
    errors: [
      {
        errorCode: String,
        errorMessage: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    metadata: {
      firmwareVersion: String,
      deviceUptime: Number, // in seconds
      freeMemory: Number, // in bytes
      resetReason: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "canal_readings",
  },
);

// Compound indexes for efficient queries
canalReadingSchema.index({ canalId: 1, timestamp: -1 });
canalReadingSchema.index({ esp32DeviceId: 1, timestamp: -1 });
canalReadingSchema.index({ status: 1, timestamp: -1 });
canalReadingSchema.index({ timestamp: -1 }); // For time-based queries

// TTL index to automatically delete old readings (optional - keeps 30 days)
canalReadingSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);

// Virtual for calculating data quality score
canalReadingSchema.virtual("dataQuality").get(function () {
  let score = 100;

  // Reduce score for missing optional data
  if (!this.temperature) score -= 10;
  if (!this.pH) score -= 10;
  if (!this.batteryLevel) score -= 5;
  if (!this.signalStrength) score -= 5;

  // Reduce score for error conditions
  if (this.errors && this.errors.length > 0) score -= 20;
  if (this.status === "ERROR") score -= 30;

  return Math.max(score, 0);
});

// Instance methods
canalReadingSchema.methods.isRecentReading = function () {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return this.timestamp >= fiveMinutesAgo;
};

canalReadingSchema.methods.hasAlert = function () {
  return (
    this.status === "HIGH_FLOW" ||
    this.status === "BLOCKED" ||
    this.status === "ERROR" ||
    (this.batteryLevel && this.batteryLevel < 20)
  );
};

// Static methods
canalReadingSchema.statics.getLatestReading = function (canalId) {
  return this.findOne({ canalId }).sort({ timestamp: -1 }).exec();
};

canalReadingSchema.statics.getReadingsInTimeRange = function (
  canalId,
  startDate,
  endDate,
) {
  return this.find({
    canalId,
    timestamp: {
      $gte: startDate,
      $lte: endDate,
    },
  }).sort({ timestamp: -1 });
};

canalReadingSchema.statics.getAverageMetrics = function (canalId, hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        canalId,
        timestamp: { $gte: startTime },
      },
    },
    {
      $group: {
        _id: null,
        avgFlowRate: { $avg: "$flowRate" },
        avgSpeed: { $avg: "$speed" },
        avgDischarge: { $avg: "$discharge" },
        avgTemperature: { $avg: "$temperature" },
        count: { $sum: 1 },
      },
    },
  ]);
};

// Pre-save validation
canalReadingSchema.pre("save", function (next) {
  // Auto-determine status based on flow rate if not explicitly set
  if (!this.isModified("status") || this.status === "STOPPED") {
    if (this.flowRate > 0) {
      if (this.flowRate < 5) {
        this.status = "LOW_FLOW";
      } else if (this.flowRate > 50) {
        this.status = "HIGH_FLOW";
      } else {
        this.status = "FLOWING";
      }
    }
  }

  next();
});

module.exports = mongoose.model("CanalReading", canalReadingSchema);
