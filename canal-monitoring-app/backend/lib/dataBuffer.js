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

// ── Configuration ───────────────────────────────────────────────────
const FLUSH_INTERVAL_MS =
  (parseInt(process.env.ESP32_BUFFER_FLUSH_INTERVAL, 10) || 600) * 1000; // default 600s = 10 min

// ── State ───────────────────────────────────────────────────────────
// canalId → { latest: <reading obj>, buffer: [<reading obj>, ...] }
const store = new Map();

let flushTimer = null;

// ── Public API ──────────────────────────────────────────────────────

/** Push a new reading into the buffer and update "latest". */
function push(canalId, readingObj) {
  if (!store.has(canalId)) {
    store.set(canalId, { latest: null, buffer: [] });
  }
  const entry = store.get(canalId);
  entry.latest = readingObj;
  entry.buffer.push(readingObj);
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
    // insertMany is much more efficient than individual saves
    const result = await CanalReading.insertMany(allReadings, {
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
