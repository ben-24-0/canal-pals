/**
 * SSE Stream Routes
 *
 * GET /api/stream/canals          — stream updates for ALL canals
 * GET /api/stream/canal/:canalId  — stream updates for one canal only
 *
 * Protocol:
 *   Each event:  "data: <JSON>\n\n"
 *   Heartbeat:   ": ping\n\n"   (every 25 s to keep the connection alive through proxies)
 *   First event: current snapshot from dataBuffer (immediate, no need to wait for next push)
 */

const express = require("express");
const sseEmitter = require("../lib/sseEmitter");
const dataBuffer = require("../lib/dataBuffer");

const router = express.Router();
const HEARTBEAT_MS = 25_000;

/**
 * Upgrade a response object to an SSE stream.
 * Returns a cleanup function that removes the listener and clears the heartbeat.
 */
function initSSE(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Keep-alive heartbeat
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  // Clean up when client disconnects
  req.on("close", () => clearInterval(heartbeat));
  req.on("error", () => clearInterval(heartbeat));

  return heartbeat;
}

/**
 * Helper — write one SSE data event.
 */
function send(res, eventName, payload) {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// ────────────────────────────────────────────────────────────────────
// GET /api/stream/canal/:canalId
// Subscribe to real-time updates for a single canal.
// ────────────────────────────────────────────────────────────────────
router.get("/canal/:canalId", (req, res) => {
  const canalId = req.params.canalId.toLowerCase().trim();
  const heartbeat = initSSE(req, res);

  // Send the current snapshot immediately so the UI shows data right away
  const snapshot = dataBuffer.getLatest(canalId);
  if (snapshot) {
    send(res, "reading", { canalId, reading: snapshot });
  }

  // Subscribe to future pushes
  const handler = ({ canalId: id, reading }) => {
    if (id === canalId) {
      send(res, "reading", { canalId: id, reading });
    }
  };

  sseEmitter.on("reading", handler);

  req.on("close", () => {
    sseEmitter.off("reading", handler);
    clearInterval(heartbeat);
  });
});

// ────────────────────────────────────────────────────────────────────
// GET /api/stream/canals
// Subscribe to real-time updates for ALL canals.
// ────────────────────────────────────────────────────────────────────
router.get("/canals", (req, res) => {
  const heartbeat = initSSE(req, res);

  // Send full current snapshot for every canal immediately
  const all = dataBuffer.getAll();
  for (const [canalId, reading] of Object.entries(all)) {
    if (reading) send(res, "reading", { canalId, reading });
  }

  // Subscribe to all future pushes
  const handler = ({ canalId, reading }) => {
    send(res, "reading", { canalId, reading });
  };

  sseEmitter.on("reading", handler);

  req.on("close", () => {
    sseEmitter.off("reading", handler);
    clearInterval(heartbeat);
  });
});

module.exports = router;
