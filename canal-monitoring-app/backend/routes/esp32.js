const express = require("express");
const { body, validationResult } = require("express-validator");
const Canal = require("../models/Canal");
const dataBuffer = require("../lib/dataBuffer");
const { processRegisterMessage } = require("../lib/readingProcessor");
const mqttIngest = require("../lib/mqttIngest");

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

// POST /api/esp32/data - deprecated (ingestion moved to MQTT)
router.post("/data", (_req, res) => {
  res.status(410).json({
    error: "HTTP ingest disabled",
    message:
      "ESP32 ingestion now uses MQTT. Publish JSON payloads to canal/<device-id>/data on HiveMQ.",
    mqtt: mqttIngest.getStatus(),
    timestamp: new Date().toISOString(),
  });
});

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
    ingressMode: "mqtt",
    mqtt: mqttIngest.getStatus(),
    endpoints: {
      register: "POST /api/esp32/register",
      latestOne: "GET /api/esp32/latest/:canalId",
      latestAll: "GET /api/esp32/latest",
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

      const result = await processRegisterMessage({ canalId, deviceId });
      if (!result.accepted) {
        return res.status(400).json({
          error: "Registration failed",
          message: result.reason,
        });
      }

      const canal = await Canal.findOne({
        canalId: canalId.toLowerCase().trim(),
      }).lean();

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

// POST /api/esp32/settings/:canalId - publish runtime settings to ESP via MQTT
router.post("/settings/:canalId", async (req, res) => {
  try {
    const canalId = String(req.params.canalId || "").toLowerCase().trim();
    const canal = await Canal.findOne({ canalId, isActive: true }).lean();

    if (!canal) {
      return res.status(404).json({
        error: "Canal not found",
        message: `Canal ${canalId} is not available`,
      });
    }

    if (!canal.esp32DeviceId) {
      return res.status(400).json({
        error: "No device bound",
        message: "This canal does not have an associated ESP32 deviceId",
      });
    }

    const allowed = [
      "canalId",
      "deviceId",
      "apn",
      "gprsUser",
      "gprsPass",
      "sendIntervalMs",
      "maxMqttFailures",
      "otaCheckIntervalMs",
      "otaToken",
      "forceReadNow",
      "registerNow",
      "reboot",
    ];

    const payload = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        payload[key] = req.body[key];
      }
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        error: "Empty settings payload",
        message: "Provide at least one valid settings field",
      });
    }

    if (!payload.canalId) payload.canalId = canal.canalId;
    if (!payload.deviceId) payload.deviceId = canal.esp32DeviceId;

    const published = await mqttIngest.publishDeviceSettings(
      canal.esp32DeviceId,
      payload,
    );

    if (!published.ok) {
      return res.status(503).json({
        error: "Failed to publish settings",
        message: published.message,
        mqtt: mqttIngest.getStatus(),
      });
    }

    return res.json({
      success: true,
      canalId,
      deviceId: canal.esp32DeviceId,
      topic: published.topic,
      payload,
    });
  } catch (error) {
    console.error("Error publishing device settings:", error);
    return res.status(500).json({
      error: "Settings publish failed",
      message: error.message,
    });
  }
});

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
