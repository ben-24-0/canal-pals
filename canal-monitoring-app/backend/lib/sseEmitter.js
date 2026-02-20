/**
 * sseEmitter — singleton EventEmitter for broadcasting real-time readings.
 *
 * Usage:
 *   const sseEmitter = require("./sseEmitter");
 *   sseEmitter.emit("reading", { canalId, reading });  // broadcast
 *   sseEmitter.on("reading", handler);                 // listen
 */

const { EventEmitter } = require("events");

const sseEmitter = new EventEmitter();

// Increase max listeners to avoid Node.js warnings when many SSE clients connect
sseEmitter.setMaxListeners(500);

module.exports = sseEmitter;
