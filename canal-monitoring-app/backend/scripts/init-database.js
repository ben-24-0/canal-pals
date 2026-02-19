require("dotenv").config();
const mongoose = require("mongoose");
const Canal = require("../models/Canal");
const CanalReading = require("../models/CanalReading");

// Import existing canal data from frontend
const canalsData = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "peechi-canal",
        name: "Peechi Irrigation Canal",
        type: "irrigation",
      },
      geometry: {
        type: "Point",
        coordinates: [76.2804929523611, 10.535959263174494],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "canoli-canal",
        name: "Canoli Irrigation Canal",
        type: "irrigation",
      },
      geometry: {
        type: "Point",
        coordinates: [76.17311547756718, 10.294434573688081],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "puthussery-kalady-canal",
        name: "Puthussery–Kalady Irrigation Canal",
        type: "irrigation",
      },
      geometry: {
        type: "Point",
        coordinates: [76.41240507215694, 10.161828056705708],
      },
    },
  ],
};

const initialMetrics = {
  "peechi-canal": {
    status: "FLOWING",
    flowRate: 14.2,
    speed: 1.8,
    discharge: 520,
  },
  "canoli-canal": {
    status: "STOPPED",
    flowRate: 0,
    speed: 0,
    discharge: 0,
  },
  "puthussery-kalady-canal": {
    status: "FLOWING",
    flowRate: 9.6,
    speed: 1.2,
    discharge: 340,
  },
};

async function initializeDatabase() {
  try {
    console.log("🔄 Connecting to MongoDB...");

    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/canal-monitoring";
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to MongoDB");

    // Clear existing data (optional)
    console.log("🧹 Clearing existing data...");
    await Canal.deleteMany({});
    await CanalReading.deleteMany({});

    console.log("📊 Initializing canal data...");

    // Create canals
    const canals = [];
    for (const feature of canalsData.features) {
      const canalData = {
        canalId: feature.properties.id,
        name: feature.properties.name,
        type: feature.properties.type,
        location: {
          type: "Point",
          coordinates: feature.geometry.coordinates,
        },
        isActive: true,
        description: `${feature.properties.name} - Monitoring station for irrigation canal system`,
      };

      canals.push(canalData);
    }

    const createdCanals = await Canal.insertMany(canals);
    console.log(`✅ Created ${createdCanals.length} canals`);

    // Create initial readings with some sample historical data
    console.log("📈 Creating sample readings...");

    const readings = [];
    const now = new Date();

    for (const [canalId, metrics] of Object.entries(initialMetrics)) {
      // Create readings for the last 24 hours
      for (let i = 0; i < 24; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Each hour

        // Add some random variation to the data
        const variation = 0.8 + Math.random() * 0.4; // 80% - 120% variation

        const reading = {
          canalId,
          esp32DeviceId: `ESP32_${canalId.replace("-", "_").toUpperCase()}_001`,
          status:
            metrics.status === "STOPPED"
              ? Math.random() > 0.7
                ? "STOPPED"
                : "LOW_FLOW"
              : Math.random() > 0.9
                ? "HIGH_FLOW"
                : "FLOWING",
          flowRate: Math.max(0, metrics.flowRate * variation),
          speed: Math.max(0, metrics.speed * variation),
          discharge: Math.max(0, metrics.discharge * variation),
          waterLevel: 1.2 + Math.random() * 0.8, // 1.2 - 2.0 meters
          temperature: 22 + Math.random() * 8, // 22-30°C
          pH: 6.8 + Math.random() * 0.8, // 6.8-7.6 pH
          turbidity: Math.random() * 20, // 0-20 NTU
          batteryLevel: 85 + Math.random() * 15, // 85-100%
          signalStrength: -50 - Math.random() * 30, // -50 to -80 dBm
          timestamp,
          receivedAt: timestamp,
        };

        readings.push(reading);
      }
    }

    const createdReadings = await CanalReading.insertMany(readings);
    console.log(`✅ Created ${createdReadings.length} sample readings`);

    // Create some recent readings (last 30 minutes)
    console.log("⏰ Creating recent readings...");

    const recentReadings = [];
    for (const [canalId, metrics] of Object.entries(initialMetrics)) {
      for (let i = 0; i < 6; i++) {
        // Every 5 minutes for last 30 minutes
        const timestamp = new Date(now.getTime() - i * 5 * 60 * 1000);
        const variation = 0.95 + Math.random() * 0.1; // Smaller variation for recent data

        const reading = {
          canalId,
          esp32DeviceId: `ESP32_${canalId.replace("-", "_").toUpperCase()}_001`,
          status: metrics.status,
          flowRate: Math.max(0, metrics.flowRate * variation),
          speed: Math.max(0, metrics.speed * variation),
          discharge: Math.max(0, metrics.discharge * variation),
          waterLevel: 1.5 + Math.random() * 0.3,
          temperature: 24 + Math.random() * 4,
          pH: 7.0 + Math.random() * 0.4,
          turbidity: Math.random() * 10,
          batteryLevel: 90 + Math.random() * 10,
          signalStrength: -60 - Math.random() * 20,
          timestamp,
          receivedAt: timestamp,
        };

        recentReadings.push(reading);
      }
    }

    await CanalReading.insertMany(recentReadings);
    console.log(`✅ Created ${recentReadings.length} recent readings`);

    // Display summary
    console.log("\n📊 Database initialization complete!");
    console.log("================================================");
    console.log(`Canals created: ${createdCanals.length}`);
    console.log(
      `Total readings created: ${createdReadings.length + recentReadings.length}`,
    );

    console.log("\n🏷️  Canal IDs created:");
    createdCanals.forEach((canal) => {
      console.log(`  - ${canal.canalId}: ${canal.name}`);
    });

    console.log("\n🔧 ESP32 Device IDs assigned:");
    const uniqueDevices = [...new Set(readings.map((r) => r.esp32DeviceId))];
    uniqueDevices.forEach((deviceId) => {
      console.log(`  - ${deviceId}`);
    });

    console.log("\n🚀 Your API is ready! You can now:");
    console.log("  1. Start your backend server: npm run dev");
    console.log("  2. Test the endpoints:");
    console.log("     - GET  http://localhost:3001/health");
    console.log("     - GET  http://localhost:3001/api/canals");
    console.log("     - GET  http://localhost:3001/api/dashboard/metrics");
    console.log("     - POST http://localhost:3001/api/esp32/data");

    console.log("\n📱 ESP32 Configuration:");
    console.log("  Endpoint: POST http://your-api-url/api/esp32/data");
    console.log('  Headers:  X-ESP32-ID: "your-device-id"');
    console.log("  Content-Type: application/json");
  } catch (error) {
    console.error("❌ Error initializing database:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
    process.exit(0);
  }
}

// Run the initialization
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;
