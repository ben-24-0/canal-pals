const express = require("express");
const { body, validationResult } = require("express-validator");
const Canal = require("../models/Canal");
const dataBuffer = require("../lib/dataBuffer");
const { calculateFlowRate } = require("../lib/mannings");

const router = express.Router();

// Middleware to validate ESP32 device ID
const validateDeviceId = (req, res, next) => {
  const deviceId = req.headers["x-esp32-id"] || req.body.deviceId;

  if (!deviceId) {
    return res.status(400).json({
      error: "Missing device ID",
      message:
        "ESP32 device ID is required in X-ESP32-ID header or deviceId field",
    });
  }

  req.deviceId = deviceId;
  next();
};

// Validation rules for canal data
const canalDataValidation = [
  body("canalId")
    .isString()
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage(
      "Canal ID must be 3-50 characters, alphanumeric with hyphens/underscores only",
    ),

  body("status")
    .optional()
    .isIn(["FLOWING", "STOPPED", "LOW_FLOW", "HIGH_FLOW", "BLOCKED", "ERROR"])
    .withMessage(
      "Status must be one of: FLOWING, STOPPED, LOW_FLOW, HIGH_FLOW, BLOCKED, ERROR",
    ),

  body("flowRate")
    .optional()
    .isFloat({ min: 0, max: 1000 })
    .withMessage("Flow rate must be a number between 0 and 1000"),

  body("speed")
    .optional()
    .isFloat({ min: 0, max: 50 })
    .withMessage("Speed must be a number between 0 and 50"),

  body("discharge")
    .optional()
    .isFloat({ min: 0, max: 10000 })
    .withMessage("Discharge must be a number between 0 and 10000"),

  body("depth")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Depth must be a positive number"),

  body("waterLevel")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Water level must be a positive number"),

  body("temperature")
    .optional()
    .isFloat({ min: -50, max: 100 })
    .withMessage("Temperature must be between -50 and 100 degrees Celsius"),

  body("pH")
    .optional()
    .isFloat({ min: 0, max: 14 })
    .withMessage("pH must be between 0 and 14"),

  body("batteryLevel")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Battery level must be between 0 and 100"),

  body("signalStrength")
    .optional()
    .isFloat({ min: -120, max: 0 })
    .withMessage("Signal strength must be between -120 and 0"),

  body("gpsCoordinates")
    .optional()
    .isObject()
    .withMessage("GPS coordinates must be an object"),

  body("gpsCoordinates.latitude")
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be between -90 and 90"),

  body("gpsCoordinates.longitude")
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be between -180 and 180"),
];

// POST /api/esp32/data - Main endpoint for ESP32 to send canal data
router.post(
  "/data",
  validateDeviceId,
  canalDataValidation,
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: "Validation failed",
          details: errors.array(),
          timestamp: new Date().toISOString(),
        });
      }

      const {
        canalId,
        status,
        flowRate,
        speed,
        discharge,
        waterLevel,
        temperature,
        pH,
        turbidity,
        batteryLevel,
        signalStrength,
        gpsCoordinates,
        errors: deviceErrors,
        metadata,
      } = req.body;

      const deviceId = req.deviceId;

      // Verify that the canal exists and is associated with this device
      const canal = await Canal.findOne({
        canalId: canalId.toLowerCase().trim(),
        isActive: true,
      });

      if (!canal) {
        // Log this for security monitoring
        console.warn(
          `Unknown canal ID attempted: ${canalId} from device ${deviceId}`,
        );
        return res.status(404).json({
          error: "Canal not found",
          message: "Canal ID not recognized or inactive",
          timestamp: new Date().toISOString(),
        });
      }

      // Update the canal's ESP32 device association if needed
      if (!canal.esp32DeviceId) {
        canal.esp32DeviceId = deviceId;
        await canal.save();
        console.log(`Associated device ${deviceId} with canal ${canalId}`);
      } else if (canal.esp32DeviceId !== deviceId) {
        console.warn(
          `Device ID mismatch for canal ${canalId}. Expected: ${canal.esp32DeviceId}, Got: ${deviceId}`,
        );
        return res.status(403).json({
          error: "Device not authorized",
          message: "This device is not authorized for this canal",
          timestamp: new Date().toISOString(),
        });
      }

      // Build reading object (plain object, not a Mongoose doc)
      const sensorType = canal.sensorType || "radar";
      const depth = req.body.depth;

      const readingObj = {
        canalId: canalId.toLowerCase().trim(),
        esp32DeviceId: deviceId,
        sensorType,
        waterLevel,
        temperature,
        pH,
        turbidity,
        batteryLevel,
        signalStrength,
        gpsCoordinates,
        errors: deviceErrors,
        metadata,
        timestamp: req.body.timestamp
          ? new Date(req.body.timestamp)
          : new Date(),
        receivedAt: new Date(),
      };

      // ── Ultrasonic sensor → Manning's equation ──
      if (
        sensorType === "ultrasonic" &&
        depth != null &&
        canal.manningsParams
      ) {
        const mp = canal.manningsParams;
        const finalDepth = Math.max(0, depth - (canal.depthOffset || 0));
        const result = calculateFlowRate(finalDepth, mp);
        readingObj.depth = finalDepth;
        readingObj.flowRate = result.Q;
        readingObj.speed = result.V;
        readingObj.calculatedArea = result.A;
        readingObj.calculatedHydraulicRadius = result.R;
        readingObj.wettedPerimeter = result.P;
        readingObj.discharge = result.Q; // Q ≡ discharge for ultrasonic
      } else {
        // ── Radar sensor → values sent directly from ESP32 ──
        readingObj.flowRate = flowRate ?? 0;
        readingObj.speed = speed ?? 0;
        readingObj.discharge = discharge ?? 0;
        if (depth != null) readingObj.depth = depth;
      }

      // Auto-determine status from flow rate if not explicitly provided
      if (!status) {
        if (readingObj.flowRate === 0) readingObj.status = "STOPPED";
        else if (readingObj.flowRate < 2) readingObj.status = "LOW_FLOW";
        else if (readingObj.flowRate > 50) readingObj.status = "HIGH_FLOW";
        else readingObj.status = "FLOWING";
      } else {
        readingObj.status = status;
      }

      // ── Push to in-memory buffer (NO DB write here) ──
      dataBuffer.push(readingObj.canalId, readingObj);

      const bufferStats = dataBuffer.getBufferStats();
      const buffered = bufferStats[readingObj.canalId]?.buffered || 1;
      console.log(
        `📦 [BUFFERED] Data from ${deviceId} for canal ${canalId}: ${status}, Flow: ${flowRate}  (${buffered} in buffer)`,
      );

      // Check for alerts
      const alerts = [];
      if (
        status === "HIGH_FLOW" ||
        status === "BLOCKED" ||
        status === "ERROR"
      ) {
        alerts.push({
          type: "status",
          message: `Canal ${canalId} status: ${status}`,
          severity: status === "ERROR" ? "critical" : "warning",
        });
      }

      if (batteryLevel && batteryLevel < 20) {
        alerts.push({
          type: "battery",
          message: `Low battery: ${batteryLevel}%`,
          severity: batteryLevel < 10 ? "critical" : "warning",
        });
      }

      // Return success
      res.status(200).json({
        success: true,
        message: `Data buffered (${buffered} readings queued, next flush to DB in ≤${dataBuffer.FLUSH_INTERVAL_MS / 1000}s)`,
        canalId,
        deviceId,
        timestamp: readingObj.timestamp,
        alerts: alerts.length > 0 ? alerts : undefined,
      });
    } catch (error) {
      console.error("Error processing ESP32 data:", error);

      // Return appropriate error response
      if (error.name === "ValidationError") {
        return res.status(400).json({
          error: "Data validation failed",
          details: Object.values(error.errors).map((err) => err.message),
          timestamp: new Date().toISOString(),
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          error: "Duplicate data",
          message: "This reading may have already been processed",
          timestamp: new Date().toISOString(),
        });
      }

      res.status(500).json({
        error: "Internal server error",
        message:
          process.env.NODE_ENV === "production"
            ? "Unable to process data at this time"
            : error.message,
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// GET /api/esp32/latest/:canalId - Real-time reading from memory
router.get("/latest/:canalId", (req, res) => {
  const { canalId } = req.params;
  const latest = dataBuffer.getLatest(canalId.toLowerCase().trim());

  if (!latest) {
    return res.status(404).json({
      error: "No recent reading",
      message: `No data received yet for canal ${canalId}`,
    });
  }

  res.json({ success: true, canalId, reading: latest });
});

// GET /api/esp32/latest - Real-time readings for ALL canals
router.get("/latest", (req, res) => {
  res.json({ success: true, canals: dataBuffer.getAll() });
});

// GET /api/esp32/buffer-stats - Monitor buffer sizes
router.get("/buffer-stats", (req, res) => {
  res.json({
    success: true,
    flushIntervalSeconds: dataBuffer.FLUSH_INTERVAL_MS / 1000,
    canals: dataBuffer.getBufferStats(),
  });
});

// POST /api/esp32/flush - Manually trigger a flush to MongoDB
router.post("/flush", async (req, res) => {
  try {
    const result = await dataBuffer.flush();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: "Flush failed", message: error.message });
  }
});

// GET /api/esp32/status - Health check for ESP32 devices
router.get("/status", (req, res) => {
  res.json({
    status: "active",
    timestamp: new Date().toISOString(),
    server: "canal-monitoring-api",
    version: "1.0.0",
    endpoints: {
      data: "POST /api/esp32/data",
      register: "POST /api/esp32/register",
    },
  });
});

// POST /api/esp32/register - Register a new ESP32 device
router.post(
  "/register",
  validateDeviceId,
  [
    body("canalId")
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("Canal ID is required"),
    body("location")
      .optional()
      .isObject()
      .withMessage("Location must be an object with latitude and longitude"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: "Validation failed",
          details: errors.array(),
        });
      }

      const { canalId } = req.body;
      const deviceId = req.deviceId;

      // Check if canal exists
      const canal = await Canal.findOne({
        canalId: canalId.toLowerCase().trim(),
      });

      if (!canal) {
        return res.status(404).json({
          error: "Canal not found",
          message: "Please ensure the canal is registered in the system first",
        });
      }

      // Associate device with canal
      canal.esp32DeviceId = deviceId;
      await canal.save();

      console.log(
        `📱 Registered ESP32 device ${deviceId} for canal ${canalId}`,
      );

      res.status(200).json({
        success: true,
        message: "Device registered successfully",
        canalId,
        deviceId,
        canal: {
          name: canal.name,
          type: canal.type,
          location: canal.location.coordinates,
        },
      });
    } catch (error) {
      console.error("Error registering ESP32 device:", error);
      res.status(500).json({
        error: "Registration failed",
        message: error.message,
      });
    }
  },
);

// GET /api/esp32/config/:deviceId - Get configuration for specific ESP32
router.get("/config/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;

    const canal = await Canal.findOne({ esp32DeviceId: deviceId });

    if (!canal) {
      return res.status(404).json({
        error: "Device not found",
        message: "This device is not registered",
      });
    }

    // Return device configuration
    res.json({
      deviceId,
      canalId: canal.canalId,
      canalName: canal.name,
      location: canal.location.coordinates,
      updateInterval: 300, // 5 minutes in seconds
      batteryThreshold: 20,
      signalThreshold: -100,
      endpoints: {
        data: "/api/esp32/data",
        status: "/api/esp32/status",
      },
    });
  } catch (error) {
    console.error("Error getting ESP32 config:", error);
    res.status(500).json({
      error: "Configuration retrieval failed",
      message: error.message,
    });
  }
});

module.exports = router;
