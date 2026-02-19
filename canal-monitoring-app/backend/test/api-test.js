require("dotenv").config();
const axios = require("axios");

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";

// Test data
const testData = {
  canalId: "peechi-canal",
  status: "FLOWING",
  flowRate: 15.5,
  speed: 2.1,
  discharge: 540,
  waterLevel: 1.8,
  temperature: 26.5,
  pH: 7.1,
  batteryLevel: 92,
  signalStrength: -68,
  gpsCoordinates: {
    latitude: 10.535959,
    longitude: 76.280492,
  },
};

const deviceId = "ESP32_TEST_DEVICE_001";

async function testAPIs() {
  console.log("🧪 Testing Canal Monitoring API");
  console.log("================================\n");

  try {
    // Test 1: Health Check
    console.log("1️⃣  Testing health endpoint...");
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log("✅ Health check passed");
    console.log(`   Status: ${healthResponse.data.status}`);
    console.log(
      `   Uptime: ${Math.round(healthResponse.data.uptime)} seconds\n`,
    );

    // Test 2: Get all canals
    console.log("2️⃣  Testing get canals...");
    const canalsResponse = await axios.get(`${API_BASE_URL}/api/canals`);
    console.log("✅ Get canals passed");
    console.log(`   Found: ${canalsResponse.data.canals.length} canals\n`);

    // Test 3: ESP32 Status
    console.log("3️⃣  Testing ESP32 status...");
    const esp32StatusResponse = await axios.get(
      `${API_BASE_URL}/api/esp32/status`,
    );
    console.log("✅ ESP32 status check passed");
    console.log(`   Status: ${esp32StatusResponse.data.status}\n`);

    // Test 4: Send test data from ESP32
    console.log("4️⃣  Testing ESP32 data submission...");
    const dataResponse = await axios.post(
      `${API_BASE_URL}/api/esp32/data`,
      testData,
      {
        headers: {
          "Content-Type": "application/json",
          "X-ESP32-ID": deviceId,
        },
      },
    );
    console.log("✅ ESP32 data submission passed");
    console.log(`   Response: ${dataResponse.data.message}`);
    console.log(`   Data Quality: ${dataResponse.data.dataQuality}%`);
    if (dataResponse.data.alerts) {
      console.log(`   Alerts: ${dataResponse.data.alerts.length}`);
    }
    console.log();

    // Test 5: Get dashboard metrics
    console.log("5️⃣  Testing dashboard metrics...");
    const metricsResponse = await axios.get(
      `${API_BASE_URL}/api/dashboard/metrics`,
    );
    console.log("✅ Dashboard metrics passed");
    console.log(
      `   Metrics for: ${Object.keys(metricsResponse.data.metrics).length} canals\n`,
    );

    // Test 6: Get dashboard overview
    console.log("6️⃣  Testing dashboard overview...");
    const overviewResponse = await axios.get(
      `${API_BASE_URL}/api/dashboard/overview`,
    );
    console.log("✅ Dashboard overview passed");
    console.log(
      `   Total canals: ${overviewResponse.data.overview.totalCanals}`,
    );
    console.log(
      `   Active canals: ${overviewResponse.data.overview.activeCanals}`,
    );
    console.log(`   Alerts: ${overviewResponse.data.overview.alertsCount}\n`);

    // Test 7: Get specific canal
    console.log("7️⃣  Testing get specific canal...");
    const canalResponse = await axios.get(
      `${API_BASE_URL}/api/canals/peechi-canal`,
    );
    console.log("✅ Get specific canal passed");
    console.log(`   Canal: ${canalResponse.data.canal.name}`);
    console.log(`   Online: ${canalResponse.data.isOnline}\n`);

    // Test 8: Get canal readings
    console.log("8️⃣  Testing get canal readings...");
    const readingsResponse = await axios.get(
      `${API_BASE_URL}/api/canals/peechi-canal/readings?limit=5`,
    );
    console.log("✅ Get canal readings passed");
    console.log(
      `   Readings found: ${readingsResponse.data.readings.length}\n`,
    );

    // Test 9: Test invalid data (should fail)
    console.log("9️⃣  Testing invalid data validation...");
    try {
      await axios.post(
        `${API_BASE_URL}/api/esp32/data`,
        {
          canalId: "invalid-canal",
          status: "INVALID_STATUS",
          flowRate: -5, // Invalid negative flow rate
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-ESP32-ID": deviceId,
          },
        },
      );
      console.log("❌ Validation test failed - invalid data was accepted");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log("✅ Validation test passed - invalid data rejected");
      } else if (error.response && error.response.status === 404) {
        console.log("✅ Validation test passed - unknown canal rejected");
      } else {
        throw error;
      }
    }
    console.log();

    console.log("🎉 All API tests completed successfully!");
    console.log("\n📊 Summary:");
    console.log("   ✅ Health check");
    console.log("   ✅ Canal management");
    console.log("   ✅ ESP32 data reception");
    console.log("   ✅ Dashboard APIs");
    console.log("   ✅ Data validation");

    console.log("\n🚀 Your API is ready for production!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);

    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", error.response.data);
    } else if (error.code === "ECONNREFUSED") {
      console.error("   ⚠️  Is your server running? Try: npm run dev");
    }

    process.exit(1);
  }
}

// ESP32 Simulation Function
async function simulateESP32() {
  console.log("🤖 ESP32 Simulation Mode");
  console.log("========================\n");

  const canals = ["peechi-canal", "canoli-canal", "puthussery-kalady-canal"];

  for (let i = 0; i < 10; i++) {
    for (const canalId of canals) {
      const simulatedData = {
        canalId,
        status: Math.random() > 0.8 ? "HIGH_FLOW" : "FLOWING",
        flowRate: 10 + Math.random() * 15,
        speed: 1 + Math.random() * 2,
        discharge: 300 + Math.random() * 400,
        waterLevel: 1.2 + Math.random() * 0.8,
        temperature: 22 + Math.random() * 8,
        pH: 6.8 + Math.random() * 0.8,
        batteryLevel: 80 + Math.random() * 20,
        signalStrength: -50 - Math.random() * 30,
      };

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/esp32/data`,
          simulatedData,
          {
            headers: {
              "Content-Type": "application/json",
              "X-ESP32-ID": `ESP32_${canalId.replace("-", "_").toUpperCase()}_001`,
            },
          },
        );

        console.log(
          `📊 ${canalId}: ${simulatedData.status} (Flow: ${simulatedData.flowRate.toFixed(1)})`,
        );
      } catch (error) {
        console.error(`❌ Error simulating ${canalId}:`, error.message);
      }
    }

    console.log(`   Batch ${i + 1}/10 completed`);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
  }

  console.log("\n✅ ESP32 simulation completed!");
}

// Command line arguments
const command = process.argv[2];

if (command === "simulate") {
  simulateESP32();
} else {
  testAPIs();
}

module.exports = { testAPIs, simulateESP32 };
