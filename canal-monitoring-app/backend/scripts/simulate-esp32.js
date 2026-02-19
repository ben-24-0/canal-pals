/**
 * ESP32 Simulator — sends realistic, continuously-changing canal data
 * to the backend every few seconds so the frontend updates in real time.
 *
 * Usage:
 *   node scripts/simulate-esp32.js                  # default: peechi-canal, every 3s
 *   node scripts/simulate-esp32.js canoli-canal 5    # custom canal, every 5s
 */

require("dotenv").config();
const axios = require("axios");

// ── Config ──────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL || "http://localhost:3001";
const CANAL_ID = process.argv[2] || "peechi-canal";
const INTERVAL_SEC = parseInt(process.argv[3], 10) || 3;
const DEVICE_ID = `ESP32_SIM_${CANAL_ID.replace(/-/g, "_").toUpperCase()}`;

// ── Realistic value generators ──────────────────────────────────────
let tick = 0;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function generateReading() {
  tick++;

  // Sine-wave base with noise so the dashboard graph moves naturally
  const timeFactor = (tick * INTERVAL_SEC) / 60; // minutes elapsed
  const sineWave = Math.sin(timeFactor * 0.2) * 0.15; // ±15% slow oscillation
  const noise = (Math.random() - 0.5) * 0.1; // ±5% random noise

  const baseFlow = 14.0;
  const flowRate = +(baseFlow * (1 + sineWave + noise)).toFixed(2);
  const speed = +(1.8 * (1 + sineWave + noise * 0.5)).toFixed(2);
  const discharge = +(520 * (1 + sineWave + noise * 0.8)).toFixed(1);

  // Decide status based on flow
  let status = "FLOWING";
  if (flowRate < 2) status = "LOW_FLOW";
  if (flowRate > 20) status = "HIGH_FLOW";
  if (flowRate === 0) status = "STOPPED";

  return {
    canalId: CANAL_ID,
    status,
    flowRate: Math.max(0, flowRate),
    speed: Math.max(0, speed),
    discharge: Math.max(0, discharge),
    waterLevel: +randomBetween(1.2, 2.0).toFixed(2),
    temperature: +randomBetween(23, 29).toFixed(1),
    pH: +randomBetween(6.8, 7.6).toFixed(2),
    turbidity: +randomBetween(0, 15).toFixed(1),
    batteryLevel: +randomBetween(75, 100).toFixed(0),
    signalStrength: +randomBetween(-80, -50).toFixed(0),
    gpsCoordinates: {
      latitude: 10.535959 + (Math.random() - 0.5) * 0.0001,
      longitude: 76.280493 + (Math.random() - 0.5) * 0.0001,
    },
    timestamp: new Date().toISOString(),
  };
}

// ── Main loop ───────────────────────────────────────────────────────
async function sendReading() {
  const data = generateReading();

  try {
    const res = await axios.post(`${API_BASE}/api/esp32/data`, data, {
      headers: {
        "Content-Type": "application/json",
        "X-ESP32-ID": DEVICE_ID,
      },
      timeout: 5000,
    });

    const d = data;
    console.log(
      `[${new Date().toLocaleTimeString()}] ✅ #${tick}  Flow: ${d.flowRate} m³/s  Speed: ${d.speed}  Discharge: ${d.discharge}  Status: ${d.status}  → ${res.data.message}`,
    );
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`[${new Date().toLocaleTimeString()}] ❌ #${tick}  ${msg}`);
  }
}

console.log("═══════════════════════════════════════════════════════");
console.log(`  🛰️  ESP32 Simulator`);
console.log(`  Canal:    ${CANAL_ID}`);
console.log(`  Device:   ${DEVICE_ID}`);
console.log(`  Interval: every ${INTERVAL_SEC}s`);
console.log(`  Target:   ${API_BASE}/api/esp32/data`);
console.log("═══════════════════════════════════════════════════════");
console.log("  Press Ctrl+C to stop.\n");

// Register device with backend (associates device with canal) before sending data
async function registerDevice() {
  try {
    const res = await axios.post(
      `${API_BASE}/api/esp32/register`,
      { canalId: CANAL_ID },
      {
        headers: {
          "Content-Type": "application/json",
          "X-ESP32-ID": DEVICE_ID,
        },
        timeout: 5000,
      },
    );

    if (res.status === 200) {
      console.log(`📱 Registered device ${DEVICE_ID} for canal ${CANAL_ID}`);
      return true;
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.warn(`⚠️  Registration failed: ${msg}`);
    // If registration fails due to device already associated with another canal,
    // we still proceed to send data — backend may reject with 403 per policy.
  }
  return false;
}

// Start: register then send readings
(async () => {
  await registerDevice();
  // Send first reading immediately, then repeat
  sendReading();
  setInterval(sendReading, INTERVAL_SEC * 1000);
})();
