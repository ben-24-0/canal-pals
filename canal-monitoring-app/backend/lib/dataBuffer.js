/**
 * In-memory data buffer for ESP32 readings.
 *
 * - Every incoming reading is pushed to a per-canal buffer array
 *   AND stored as the "latest" reading for that canal.
 * - A setInterval flushes all buffered readings to MongoDB every
 *   FLUSH_INTERVAL_MS (default 10 min, configurable via .env).
 * - The frontend reads from `getLatest()` / `getAll()` for real-time
 *   data — no MongoDB round-trip needed.
 */

const CanalReading = require("../models/CanalReading");
const sseEmitter = require("./sseEmitter");

// ── Configuration ───────────────────────────────────────────────────
const FLUSH_INTERVAL_MS =
  (parseInt(process.env.ESP32_BUFFER_FLUSH_INTERVAL, 10) || 600) * 1000; // default 600s = 10 min

// ── State ───────────────────────────────────────────────────────────
// canalId → { latest: <reading obj>, buffer: [<reading obj>, ...] }
const store = new Map();

let flushTimer = null;

const AGGREGATION_WINDOW_SECONDS = 60;

function minuteBucketStart(dateLike) {
  const date = new Date(dateLike || Date.now());
  date.setSeconds(0, 0);
  return date;
}

function averageDefined(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return undefined;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function aggregateReadingsByMinute(readings) {
  const grouped = new Map();

  for (const reading of readings) {
    const bucketTime = minuteBucketStart(
      reading.timestamp || reading.receivedAt,
    );
    const key = `${reading.canalId}|${bucketTime.toISOString()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        canalId: reading.canalId,
        bucketTime,
        samples: [],
      });
    }

    grouped.get(key).samples.push(reading);
  }

  const averaged = [];

  for (const [, group] of grouped) {
    const samples = group.samples;
    const latest = samples.reduce((acc, s) => {
      const sTime = new Date(
        s.timestamp || s.receivedAt || Date.now(),
      ).getTime();
      const accTime = new Date(
        acc.timestamp || acc.receivedAt || Date.now(),
      ).getTime();
      return sTime >= accTime ? s : acc;
    }, samples[0]);

    const avgFlowRate = averageDefined(samples.map((s) => s.flowRate));
    const avgSpeed = averageDefined(samples.map((s) => s.speed));
    const avgDischarge = averageDefined(samples.map((s) => s.discharge));
    const avgWaterLevel = averageDefined(samples.map((s) => s.waterLevel));
    const avgDepth = averageDefined(samples.map((s) => s.depth));
    const avgHeight = averageDefined(samples.map((s) => s.height));
    const avgTemperature = averageDefined(samples.map((s) => s.temperature));
    const avgPH = averageDefined(samples.map((s) => s.pH));
    const avgTurbidity = averageDefined(samples.map((s) => s.turbidity));
    const avgBattery = averageDefined(samples.map((s) => s.batteryLevel));
    const avgSignal = averageDefined(samples.map((s) => s.signalStrength));
    const avgArea = averageDefined(samples.map((s) => s.calculatedArea));
    const avgHydraulicRadius = averageDefined(
      samples.map((s) => s.calculatedHydraulicRadius),
    );
    const avgPerimeter = averageDefined(samples.map((s) => s.wettedPerimeter));
    const avgRawDistance = averageDefined(samples.map((s) => s.rawDistance));

    const latitude = averageDefined(
      samples.map((s) => s.gpsCoordinates?.latitude),
    );
    const longitude = averageDefined(
      samples.map((s) => s.gpsCoordinates?.longitude),
    );

    averaged.push({
      canalId: group.canalId,
      esp32DeviceId: latest.esp32DeviceId,
      status: latest.status || "STOPPED",
      flowRate: +(avgFlowRate ?? 0).toFixed(6),
      speed: avgSpeed != null ? +avgSpeed.toFixed(6) : undefined,
      discharge: avgDischarge != null ? +avgDischarge.toFixed(6) : undefined,
      waterLevel: avgWaterLevel != null ? +avgWaterLevel.toFixed(6) : undefined,
      depth: avgDepth != null ? +avgDepth.toFixed(6) : undefined,
      height: avgHeight != null ? +avgHeight.toFixed(6) : undefined,
      temperature:
        avgTemperature != null ? +avgTemperature.toFixed(3) : undefined,
      pH: avgPH != null ? +avgPH.toFixed(3) : undefined,
      turbidity: avgTurbidity != null ? +avgTurbidity.toFixed(3) : undefined,
      batteryLevel: avgBattery != null ? +avgBattery.toFixed(3) : undefined,
      signalStrength: avgSignal != null ? +avgSignal.toFixed(3) : undefined,
      calculatedArea: avgArea != null ? +avgArea.toFixed(6) : undefined,
      calculatedHydraulicRadius:
        avgHydraulicRadius != null ? +avgHydraulicRadius.toFixed(6) : undefined,
      wettedPerimeter:
        avgPerimeter != null ? +avgPerimeter.toFixed(6) : undefined,
      rawDistance:
        avgRawDistance != null ? +avgRawDistance.toFixed(6) : undefined,
      rawRadarStatus: latest.rawRadarStatus,
      sensorType: latest.sensorType,
      gpsCoordinates:
        latitude != null && longitude != null
          ? { latitude, longitude }
          : latest.gpsCoordinates,
      errors: latest.errors,
      metadata: latest.metadata,
      sampleCount: samples.length,
      aggregationWindowSeconds: AGGREGATION_WINDOW_SECONDS,
      timestamp: group.bucketTime,
      receivedAt: new Date(),
    });
  }

  return averaged;
}

// ── Public API ──────────────────────────────────────────────────────

/** Push a new reading into the buffer and update "latest". */
function push(canalId, readingObj) {
  if (!store.has(canalId)) {
    store.set(canalId, { latest: null, buffer: [] });
  }
  const entry = store.get(canalId);
  entry.latest = readingObj;
  entry.buffer.push(readingObj);

  console.log(`[DATABUFFER] Pushing reading for ${canalId}:`, {
    depth: readingObj.depth,
    speed: readingObj.speed,
    status: readingObj.status,
    timestamp: readingObj.timestamp,
  });

  // Broadcast to all connected SSE clients immediately
  sseEmitter.emit("reading", { canalId, reading: readingObj });
}

/** Get the most recent reading for one canal (from memory). */
function getLatest(canalId) {
  const entry = store.get(canalId);
  return entry ? entry.latest : null;
}

/** Get the most recent reading for ALL canals (from memory). */
function getAll() {
  const result = {};
  for (const [canalId, entry] of store) {
    result[canalId] = entry.latest;
  }
  return result;
}

/** Get the full buffer for one canal (readings not yet flushed). */
function getBuffer(canalId) {
  const entry = store.get(canalId);
  return entry ? [...entry.buffer] : [];
}

/** Get buffer sizes for monitoring. */
function getBufferStats() {
  const stats = {};
  for (const [canalId, entry] of store) {
    stats[canalId] = {
      buffered: entry.buffer.length,
      latestTimestamp: entry.latest?.timestamp || entry.latest?.receivedAt,
    };
  }
  return stats;
}

// ── Flush logic ─────────────────────────────────────────────────────

/** Bulk-insert all buffered readings to MongoDB, then clear buffers. */
async function flush() {
  // Collect all readings from every canal buffer
  const allReadings = [];
  for (const [, entry] of store) {
    allReadings.push(...entry.buffer);
  }

  if (allReadings.length === 0) {
    console.log("⏩ [FLUSH] Nothing to flush — buffers empty.");
    return { inserted: 0 };
  }

  try {
    const minuteAverages = aggregateReadingsByMinute(allReadings);

    // insertMany is much more efficient than individual saves
    const result = await CanalReading.insertMany(minuteAverages, {
      ordered: false, // continue on duplicate-key errors
    });

    const insertedCount = result.length;

    // Clear all buffers (keep latest intact)
    for (const [, entry] of store) {
      entry.buffer = [];
    }

    console.log(
      `✅ [FLUSH] Bulk-inserted ${insertedCount} readings to MongoDB.`,
    );
    return { inserted: insertedCount };
  } catch (error) {
    // With ordered:false, some may still have been inserted
    const insertedCount = error.insertedDocs?.length || 0;

    // Clear buffers even on partial success to avoid re-inserting
    for (const [, entry] of store) {
      entry.buffer = [];
    }

    console.error(
      `⚠️  [FLUSH] Partial flush: ${insertedCount} inserted, errors:`,
      error.message,
    );
    return { inserted: insertedCount, error: error.message };
  }
}

/** Start the automatic flush timer. Call once at server startup. */
function startFlushTimer() {
  if (flushTimer) return; // already running

  flushTimer = setInterval(async () => {
    console.log("🔄 [FLUSH] Auto-flush triggered…");
    await flush();
  }, FLUSH_INTERVAL_MS);

  // Don't let the timer keep the process alive on shutdown
  flushTimer.unref();

  console.log(
    `📦 [BUFFER] Flush timer started — every ${FLUSH_INTERVAL_MS / 1000}s`,
  );
}

/** Stop the timer and do a final flush (call on graceful shutdown). */
async function stopAndFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  console.log("🛑 [BUFFER] Final flush before shutdown…");
  return flush();
}

// ── Export ───────────────────────────────────────────────────────────
module.exports = {
  push,
  getLatest,
  getAll,
  getBuffer,
  getBufferStats,
  flush,
  startFlushTimer,
  stopAndFlush,
  FLUSH_INTERVAL_MS,
};
