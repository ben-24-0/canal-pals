const express = require("express");
const { body, validationResult } = require("express-validator");
const Canal = require("../models/Canal");
const CanalReading = require("../models/CanalReading");

const router = express.Router();

// TEST: MongoDB connection and canal-data collection
router.get("/test-db", async (req, res) => {
  try {
    // Try to create a test document
    const testCanal = new Canal({
      canalId: "test-canal-id",
      name: "Test Canal",
      type: "irrigation",
      isActive: true,
    });
    await testCanal.save();

    // Try to read it back
    const found = await Canal.findOne({ canalId: "test-canal-id" });

    // Clean up
    await Canal.deleteOne({ canalId: "test-canal-id" });

    res.json({
      success: true,
      message: "MongoDB connection and write/read test successful!",
      found,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/canals - Get all canals
router.get("/", async (req, res) => {
  try {
    const { active, type, limit = 50, page = 1 } = req.query;

    let query = {};
    if (active !== undefined) {
      query.isActive = active === "true";
    }
    if (type) {
      query.type = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const canals = await Canal.find(query)
      .select("-__v")
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ name: 1 });

    const total = await Canal.countDocuments(query);

    res.json({
      canals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching canals:", error);
    res.status(500).json({
      error: "Failed to fetch canals",
      message: error.message,
    });
  }
});

// GET /api/canals/:canalId - Get specific canal
router.get("/:canalId", async (req, res) => {
  try {
    const { canalId } = req.params;

    const canal = await Canal.findOne({
      canalId: canalId.toLowerCase().trim(),
    }).select("-__v");

    if (!canal) {
      return res.status(404).json({
        error: "Canal not found",
        message: `Canal with ID '${canalId}' does not exist`,
      });
    }

    // Get latest reading for this canal
    const latestReading = await CanalReading.findOne({ canalId })
      .sort({ timestamp: -1 })
      .select("-__v");

    res.json({
      canal,
      latestReading,
      isOnline: latestReading ? latestReading.isRecentReading() : false,
    });
  } catch (error) {
    console.error("Error fetching canal:", error);
    res.status(500).json({
      error: "Failed to fetch canal",
      message: error.message,
    });
  }
});

// POST /api/canals - Create new canal
router.post(
  "/",
  [
    body("canalId")
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9-_]+$/)
      .withMessage(
        "Canal ID must be 3-50 characters, alphanumeric with hyphens/underscores only",
      ),

    body("name")
      .isString()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage("Name must be 3-100 characters"),

    body("type")
      .optional()
      .isIn(["irrigation", "drainage", "water-supply"])
      .withMessage("Type must be irrigation, drainage, or water-supply"),

    body("location.coordinates")
      .isArray({ min: 2, max: 2 })
      .withMessage("Coordinates must be an array of [longitude, latitude]"),

    body("location.coordinates.*")
      .isFloat()
      .withMessage("Coordinates must be numbers"),
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

      const {
        canalId,
        name,
        type,
        location,
        description,
        capacity,
        esp32DeviceId,
        sensorType,
        manningsParams,
        depthOffset,
        isActive,
      } = req.body;

      // Check if canal already exists
      const existingCanal = await Canal.findOne({
        canalId: canalId.toLowerCase().trim(),
      });

      if (existingCanal) {
        return res.status(409).json({
          error: "Canal already exists",
          message: `Canal with ID '${canalId}' already exists`,
        });
      }

      // Create new canal
      const canal = new Canal({
        canalId: canalId.toLowerCase().trim(),
        name: name.trim(),
        type: type || "irrigation",
        location,
        description,
        capacity,
        esp32DeviceId,
        sensorType: sensorType || "radar",
        manningsParams,
        depthOffset,
        isActive: isActive !== undefined ? isActive : true,
      });

      await canal.save();

      console.log(`✅ Created new canal: ${canalId}`);

      res.status(201).json({
        success: true,
        message: "Canal created successfully",
        canal,
      });
    } catch (error) {
      console.error("Error creating canal:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          error: "Duplicate canal",
          message: "A canal with this ID already exists",
        });
      }

      res.status(500).json({
        error: "Failed to create canal",
        message: error.message,
      });
    }
  },
);

// PUT /api/canals/:canalId - Update canal
router.put(
  "/:canalId",
  [
    body("name")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage("Name must be 3-100 characters"),

    body("type")
      .optional()
      .isIn(["irrigation", "drainage", "water-supply"])
      .withMessage("Type must be irrigation, drainage, or water-supply"),

    body("location.coordinates")
      .optional()
      .isArray({ min: 2, max: 2 })
      .withMessage("Coordinates must be an array of [longitude, latitude]"),

    body("isActive")
      .optional()
      .isBoolean()
      .withMessage("isActive must be a boolean"),

    body("sensorType")
      .optional()
      .isIn(["radar", "ultrasonic"])
      .withMessage("sensorType must be radar or ultrasonic"),

    body("depthOffset")
      .optional()
      .isFloat({ min: -10, max: 10 })
      .withMessage("depthOffset must be between -10 and 10"),

    body("upperLimit")
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage("upperLimit must be between 0 and 1000"),

    body("lowerLimit")
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage("lowerLimit must be between 0 and 1000"),

    body("manningsParams.shape")
      .optional()
      .isIn(["trapezoid", "rectangle", "circle"])
      .withMessage("shape must be trapezoid, rectangle, or circle"),

    body("manningsParams.b")
      .optional()
      .isFloat({ min: 0.1, max: 100 })
      .withMessage("b (bottom width) must be between 0.1 and 100"),

    body("manningsParams.z")
      .optional()
      .isFloat({ min: 0, max: 10 })
      .withMessage("z (side slope) must be between 0 and 10"),

    body("manningsParams.D")
      .optional()
      .isFloat({ min: 0.1, max: 50 })
      .withMessage("D (diameter) must be between 0.1 and 50"),

    body("manningsParams.S")
      .optional()
      .isFloat({ min: 0.00001, max: 0.1 })
      .withMessage("S (bed slope) must be between 0.00001 and 0.1"),

    body("manningsParams.n")
      .optional()
      .isFloat({ min: 0.01, max: 0.1 })
      .withMessage("n (Manning coefficient) must be between 0.01 and 0.1"),

    body("manningsParams.u")
      .optional()
      .isFloat({ min: 1, max: 1.5 })
      .withMessage("u (unit factor) must be 1 (SI) or 1.49 (US)"),

    body("manningsParams.depthMax")
      .optional()
      .isFloat({ min: 0.1, max: 50 })
      .withMessage("depthMax must be between 0.1 and 50"),
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

      const { canalId } = req.params;
      const updateData = req.body;

      const canal = await Canal.findOneAndUpdate(
        { canalId: canalId.toLowerCase().trim() },
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true },
      );

      if (!canal) {
        return res.status(404).json({
          error: "Canal not found",
          message: `Canal with ID '${canalId}' does not exist`,
        });
      }

      console.log(`📝 Updated canal: ${canalId}`);

      res.json({
        success: true,
        message: "Canal updated successfully",
        canal,
      });
    } catch (error) {
      console.error("Error updating canal:", error);
      res.status(500).json({
        error: "Failed to update canal",
        message: error.message,
      });
    }
  },
);

// DELETE /api/canals/:canalId - Delete canal (soft delete)
router.delete("/:canalId", async (req, res) => {
  try {
    const { canalId } = req.params;

    const canal = await Canal.findOneAndUpdate(
      { canalId: canalId.toLowerCase().trim() },
      { isActive: false, updatedAt: new Date() },
      { new: true },
    );

    if (!canal) {
      return res.status(404).json({
        error: "Canal not found",
        message: `Canal with ID '${canalId}' does not exist`,
      });
    }

    console.log(`🗑️ Deactivated canal: ${canalId}`);

    res.json({
      success: true,
      message: "Canal deactivated successfully",
      canal,
    });
  } catch (error) {
    console.error("Error deleting canal:", error);
    res.status(500).json({
      error: "Failed to delete canal",
      message: error.message,
    });
  }
});

// GET /api/canals/:canalId/readings - Get canal readings
router.get("/:canalId/readings", async (req, res) => {
  try {
    const { canalId } = req.params;
    const { limit = 50, page = 1, startDate, endDate, status } = req.query;

    // Build query
    let query = { canalId: canalId.toLowerCase().trim() };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const readings = await CanalReading.find(query)
      .select("-__v")
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await CanalReading.countDocuments(query);

    res.json({
      canalId,
      readings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching canal readings:", error);
    res.status(500).json({
      error: "Failed to fetch readings",
      message: error.message,
    });
  }
});

// GET /api/canals/nearby/:longitude/:latitude - Find nearby canals
router.get("/nearby/:longitude/:latitude", async (req, res) => {
  try {
    const { longitude, latitude } = req.params;
    const { maxDistance = 1000 } = req.query;

    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({
        error: "Invalid coordinates",
        message: "Longitude and latitude must be valid numbers",
      });
    }

    const canals = await Canal.findNearby(lng, lat, parseInt(maxDistance));

    res.json({
      location: [lng, lat],
      maxDistance: parseInt(maxDistance),
      canals,
    });
  } catch (error) {
    console.error("Error finding nearby canals:", error);
    res.status(500).json({
      error: "Failed to find nearby canals",
      message: error.message,
    });
  }
});

module.exports = router;
