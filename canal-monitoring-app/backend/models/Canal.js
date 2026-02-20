const mongoose = require("mongoose");

const canalSchema = new mongoose.Schema(
  {
    canalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["irrigation", "drainage", "water-supply"],
      default: "irrigation",
    },
    location: {
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: function (coords) {
            return (
              coords.length === 2 &&
              coords[0] >= -180 &&
              coords[0] <= 180 && // longitude
              coords[1] >= -90 &&
              coords[1] <= 90
            ); // latitude
          },
          message: "Invalid coordinates format",
        },
      },
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
    },
    esp32DeviceId: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // allows null values in unique field
    },
    sensorType: {
      type: String,
      enum: ["radar", "ultrasonic"],
      default: "radar",
    },
    manningsParams: {
      shape: { type: String, enum: ["trapezoid", "rectangle", "circle"] },
      b: Number,
      z: Number,
      D: Number,
      S: Number,
      n: Number,
      u: { type: Number, default: 1 },
      depthMax: Number,
    },
    depthOffset: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number, // in cubic meters/second
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "canals",
  },
);

// Create geospatial index for location queries
canalSchema.index({ location: "2dsphere" });

// Pre-save middleware to update the updatedAt field
canalSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Instance methods
canalSchema.methods.updateLocation = function (longitude, latitude) {
  this.location.coordinates = [longitude, latitude];
  return this.save();
};

// Static methods
canalSchema.statics.findByDeviceId = function (deviceId) {
  return this.findOne({ esp32DeviceId: deviceId, isActive: true });
};

canalSchema.statics.findNearby = function (
  longitude,
  latitude,
  maxDistance = 1000,
) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance,
      },
    },
    isActive: true,
  });
};

module.exports = mongoose.model("Canal", canalSchema);
