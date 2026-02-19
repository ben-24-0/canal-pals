require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-ESP32-ID"],
  }),
);

// Rate limiting for ESP32 endpoints
const esp32RateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each ESP32 to 100 requests per minute
  message: {
    error: "Too many requests from this device, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limiting
const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
});

// Apply rate limiting
app.use("/api/esp32", esp32RateLimit);
app.use("/api", generalRateLimit);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Import routes
const esp32Routes = require("./routes/esp32");
const canalRoutes = require("./routes/canals");
const dashboardRoutes = require("./routes/dashboard");
const dataBuffer = require("./lib/dataBuffer");

// Routes
app.use("/api/esp32", esp32Routes);
app.use("/api/canals", canalRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: require("./package.json").version,
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Canal Monitoring API",
    version: "1.0.0",
    endpoints: [
      "/health",
      "/api/esp32/data",
      "/api/canals",
      "/api/dashboard/metrics",
    ],
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error occurred:", error);

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      error: "Invalid JSON format",
      message: "Please check your request body format",
    });
  }

  res.status(error.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : error.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown — flush buffer before closing
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Flushing buffer & shutting down…`);
  await dataBuffer.stopAndFlush();
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed");
    process.exit(0);
  });
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start server
const startServer = async () => {
  await connectDB();
  dataBuffer.startFlushTimer(); // start the auto-flush to MongoDB
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(
      `📦 Buffer flush every ${dataBuffer.FLUSH_INTERVAL_MS / 1000}s`,
    );
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

module.exports = app;
