const express = require("express");
const Canal = require("../models/Canal");
const CanalReading = require("../models/CanalReading");
const dataBuffer = require("../lib/dataBuffer");

const router = express.Router();

// GET /api/dashboard/overview - Get dashboard overview
router.get("/overview", async (req, res) => {
  try {
    // Get total canals
    const totalCanals = await Canal.countDocuments({ isActive: true });

    // Get active canals (has recent readings)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeCanals = await CanalReading.distinct("canalId", {
      timestamp: { $gte: fiveMinutesAgo },
    });

    // Get canal status breakdown
    const statusBreakdown = await CanalReading.aggregate([
      {
        $match: {
          timestamp: { $gte: fiveMinutesAgo },
        },
      },
      {
        $sort: { timestamp: -1 },
      },
      {
        $group: {
          _id: "$canalId",
          latestStatus: { $first: "$status" },
          latestReading: { $first: "$$ROOT" },
        },
      },
      {
        $group: {
          _id: "$latestStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get alerts count
    const alertsCount = await CanalReading.countDocuments({
      timestamp: { $gte: fiveMinutesAgo },
      $or: [
        { status: { $in: ["HIGH_FLOW", "BLOCKED", "ERROR"] } },
        { batteryLevel: { $lt: 20 } },
      ],
    });

    // Get average metrics for the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const avgMetrics = await CanalReading.aggregate([
      {
        $match: {
          timestamp: { $gte: twentyFourHoursAgo },
        },
      },
      {
        $group: {
          _id: null,
          avgFlowRate: { $avg: "$flowRate" },
          avgSpeed: { $avg: "$speed" },
          avgDischarge: { $avg: "$discharge" },
          totalReadings: { $sum: 1 },
        },
      },
    ]);

    res.json({
      overview: {
        totalCanals,
        activeCanals: activeCanals.length,
        offlineCanals: totalCanals - activeCanals.length,
        alertsCount,
      },
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      averageMetrics: avgMetrics[0] || {
        avgFlowRate: 0,
        avgSpeed: 0,
        avgDischarge: 0,
        totalReadings: 0,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching dashboard overview:", error);
    res.status(500).json({
      error: "Failed to fetch overview",
      message: error.message,
    });
  }
});

// GET /api/dashboard/metrics - Real-time metrics from in-memory buffer
router.get("/metrics", async (req, res) => {
  try {
    // Read latest readings straight from memory (not MongoDB)
    const liveReadings = dataBuffer.getAll();

    // Enrich with canal info from DB (lightweight — only canal docs)
    const canals = await Canal.find({ isActive: true }).lean();
    const canalMap = {};
    canals.forEach((c) => {
      canalMap[c.canalId] = c;
    });

    const metrics = {};
    for (const [canalId, reading] of Object.entries(liveReadings)) {
      const info = canalMap[canalId];
      metrics[canalId] = {
        status: reading.status,
        flowRate: reading.flowRate,
        speed: reading.speed,
        discharge: reading.discharge,
        waterLevel: reading.waterLevel,
        temperature: reading.temperature,
        batteryLevel: reading.batteryLevel,
        signalStrength: reading.signalStrength,
        timestamp: reading.timestamp,
        canalInfo: info
          ? { name: info.name, type: info.type, location: info.location }
          : null,
      };
    }

    res.json({
      metrics,
      source: "live-buffer",
      lastUpdated: new Date().toISOString(),
      totalCanals: Object.keys(metrics).length,
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({
      error: "Failed to fetch metrics",
      message: error.message,
    });
  }
});

// GET /api/dashboard/timeseries/:canalId - Get time series data for specific canal
router.get("/timeseries/:canalId", async (req, res) => {
  try {
    const { canalId } = req.params;
    const { hours = 24, interval = "hour", metric = "flowRate" } = req.query;

    const hoursNum = parseInt(hours);
    const startTime = new Date(Date.now() - hoursNum * 60 * 60 * 1000);

    let groupId;
    switch (interval) {
      case "minute":
        groupId = {
          year: { $year: "$timestamp" },
          month: { $month: "$timestamp" },
          day: { $dayOfMonth: "$timestamp" },
          hour: { $hour: "$timestamp" },
          minute: { $minute: "$timestamp" },
        };
        break;
      case "hour":
        groupId = {
          year: { $year: "$timestamp" },
          month: { $month: "$timestamp" },
          day: { $dayOfMonth: "$timestamp" },
          hour: { $hour: "$timestamp" },
        };
        break;
      case "day":
        groupId = {
          year: { $year: "$timestamp" },
          month: { $month: "$timestamp" },
          day: { $dayOfMonth: "$timestamp" },
        };
        break;
      default:
        groupId = {
          year: { $year: "$timestamp" },
          month: { $month: "$timestamp" },
          day: { $dayOfMonth: "$timestamp" },
          hour: { $hour: "$timestamp" },
        };
    }

    const timeSeries = await CanalReading.aggregate([
      {
        $match: {
          canalId: canalId.toLowerCase().trim(),
          timestamp: { $gte: startTime },
        },
      },
      {
        $group: {
          _id: groupId,
          avgFlowRate: { $avg: "$flowRate" },
          avgSpeed: { $avg: "$speed" },
          avgDischarge: { $avg: "$discharge" },
          avgTemperature: { $avg: "$temperature" },
          minFlowRate: { $min: "$flowRate" },
          maxFlowRate: { $max: "$flowRate" },
          count: { $sum: 1 },
          timestamp: { $first: "$timestamp" },
        },
      },
      {
        $sort: { timestamp: 1 },
      },
      {
        $project: {
          time: "$timestamp",
          flowRate: "$avgFlowRate",
          speed: "$avgSpeed",
          discharge: "$avgDischarge",
          temperature: "$avgTemperature",
          minFlowRate: "$minFlowRate",
          maxFlowRate: "$maxFlowRate",
          readings: "$count",
        },
      },
    ]);

    res.json({
      canalId,
      interval,
      hours: hoursNum,
      data: timeSeries,
      totalPoints: timeSeries.length,
    });
  } catch (error) {
    console.error("Error fetching time series:", error);
    res.status(500).json({
      error: "Failed to fetch time series",
      message: error.message,
    });
  }
});

// GET /api/dashboard/alerts - Get active alerts
router.get("/alerts", async (req, res) => {
  try {
    const { limit = 50, severity } = req.query;

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    let matchQuery = {
      timestamp: { $gte: thirtyMinutesAgo },
      $or: [
        { status: { $in: ["HIGH_FLOW", "BLOCKED", "ERROR"] } },
        { batteryLevel: { $lt: 20 } },
        { signalStrength: { $lt: -100 } },
      ],
    };

    const alerts = await CanalReading.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "canals",
          localField: "canalId",
          foreignField: "canalId",
          as: "canalInfo",
        },
      },
      { $unwind: "$canalInfo" },
      {
        $project: {
          canalId: 1,
          canalName: "$canalInfo.name",
          location: "$canalInfo.location",
          status: 1,
          flowRate: 1,
          batteryLevel: 1,
          signalStrength: 1,
          timestamp: 1,
          alerts: {
            $concatArrays: [
              {
                $cond: [
                  { $in: ["$status", ["HIGH_FLOW", "BLOCKED", "ERROR"]] },
                  [
                    {
                      type: "status",
                      severity: {
                        $cond: [
                          { $eq: ["$status", "ERROR"] },
                          "critical",
                          "warning",
                        ],
                      },
                      message: { $concat: ["Canal status: ", "$status"] },
                    },
                  ],
                  [],
                ],
              },
              {
                $cond: [
                  { $lt: ["$batteryLevel", 20] },
                  [
                    {
                      type: "battery",
                      severity: {
                        $cond: [
                          { $lt: ["$batteryLevel", 10] },
                          "critical",
                          "warning",
                        ],
                      },
                      message: {
                        $concat: [
                          "Low battery: ",
                          { $toString: "$batteryLevel" },
                          "%",
                        ],
                      },
                    },
                  ],
                  [],
                ],
              },
              {
                $cond: [
                  { $lt: ["$signalStrength", -100] },
                  [
                    {
                      type: "signal",
                      severity: "warning",
                      message: "Weak signal strength",
                    },
                  ],
                  [],
                ],
              },
            ],
          },
        },
      },
      {
        $match: {
          "alerts.0": { $exists: true }, // Only include documents with alerts
        },
      },
      { $sort: { timestamp: -1 } },
      { $limit: parseInt(limit) },
    ]);

    // Flatten alerts
    const flattenedAlerts = [];
    alerts.forEach((item) => {
      item.alerts.forEach((alert) => {
        if (!severity || alert.severity === severity) {
          flattenedAlerts.push({
            ...alert,
            canalId: item.canalId,
            canalName: item.canalName,
            location: item.location,
            timestamp: item.timestamp,
          });
        }
      });
    });

    res.json({
      alerts: flattenedAlerts,
      total: flattenedAlerts.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
});

// GET /api/dashboard/stats - Get system statistics
router.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const lastHour = new Date(now - 60 * 60 * 1000);
    const lastDay = new Date(now - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const stats = await Promise.all([
      // Total readings in last hour
      CanalReading.countDocuments({ timestamp: { $gte: lastHour } }),

      // Total readings in last day
      CanalReading.countDocuments({ timestamp: { $gte: lastDay } }),

      // Total readings in last week
      CanalReading.countDocuments({ timestamp: { $gte: lastWeek } }),

      // Average reading frequency per canal
      CanalReading.aggregate([
        {
          $match: { timestamp: { $gte: lastDay } },
        },
        {
          $group: {
            _id: "$canalId",
            readingCount: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            avgReadingsPerCanal: { $avg: "$readingCount" },
          },
        },
      ]),
    ]);

    res.json({
      readingsLastHour: stats[0],
      readingsLastDay: stats[1],
      readingsLastWeek: stats[2],
      avgReadingsPerCanal: stats[3][0]?.avgReadingsPerCanal || 0,
      systemUptime: process.uptime(),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      error: "Failed to fetch statistics",
      message: error.message,
    });
  }
});

module.exports = router;
