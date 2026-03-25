const Canal = require("../models/Canal");
const dataBuffer = require("./dataBuffer");
const { calculateFlowRate } = require("./mannings");

const ALLOWED_STATUSES = new Set([
  "FLOWING",
  "STOPPED",
  "LOW_FLOW",
  "HIGH_FLOW",
  "BLOCKED",
  "ERROR",
]);

function toNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function toDate(value) {
  if (!value) return new Date();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function normalizeStatus(inputStatus, flowRate, canal) {
  if (inputStatus && ALLOWED_STATUSES.has(String(inputStatus))) {
    return String(inputStatus);
  }

  if (!Number.isFinite(flowRate) || flowRate <= 0) return "STOPPED";

  const low = Number.isFinite(canal?.lowerLimit) ? canal.lowerLimit : 2;
  const high = Number.isFinite(canal?.upperLimit) ? canal.upperLimit : 50;

  if (flowRate < low) return "LOW_FLOW";
  if (flowRate > high) return "HIGH_FLOW";
  return "FLOWING";
}

async function resolveCanal(canalId, deviceId) {
  if (!canalId || !deviceId) {
    return { ok: false, error: "Missing canalId or deviceId" };
  }

  const canal = await Canal.findOne({
    canalId: String(canalId).toLowerCase().trim(),
    isActive: true,
  });

  if (!canal) {
    return { ok: false, error: `Canal not found: ${canalId}` };
  }

  if (!canal.esp32DeviceId) {
    canal.esp32DeviceId = String(deviceId);
    await canal.save();
  } else if (canal.esp32DeviceId !== String(deviceId)) {
    return {
      ok: false,
      error: `Device mismatch for canal ${canal.canalId}. Expected ${canal.esp32DeviceId}, got ${deviceId}`,
    };
  }

  return { ok: true, canal };
}

async function processMqttReading(payload, source = "mqtt") {
  const canalId = payload?.canalId
    ? String(payload.canalId).toLowerCase().trim()
    : "";
  const deviceId = payload?.deviceId ? String(payload.deviceId).trim() : "";

  const found = await resolveCanal(canalId, deviceId);
  if (!found.ok) {
    return { accepted: false, reason: found.error };
  }

  const canal = found.canal;
  const sensorType = canal.sensorType || "radar";
  const mp = canal.manningsParams || {};

  const rawDistance = toNumber(payload.distance);
  const rawRadarStatus = toNumber(payload.radarStatus);

  const reading = {
    canalId,
    esp32DeviceId: deviceId,
    sensorType,
    timestamp: toDate(payload.timestamp),
    receivedAt: new Date(),
    waterLevel: toNumber(payload.waterLevel),
    temperature: toNumber(payload.temperature),
    pH: toNumber(payload.pH),
    turbidity: toNumber(payload.turbidity),
    batteryLevel: toNumber(payload.batteryLevel),
    signalStrength: toNumber(payload.signalStrength),
    rawDistance,
    rawRadarStatus,
    gpsCoordinates:
      payload?.gpsCoordinates &&
      Number.isFinite(toNumber(payload.gpsCoordinates.latitude)) &&
      Number.isFinite(toNumber(payload.gpsCoordinates.longitude))
        ? {
            latitude: Number(payload.gpsCoordinates.latitude),
            longitude: Number(payload.gpsCoordinates.longitude),
          }
        : undefined,
    errors: Array.isArray(payload.errors) ? payload.errors : undefined,
    metadata:
      payload?.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : {
            firmwareVersion: payload.fwVersion,
          },
  };

  const directDepthM = toNumber(payload.depth);
  const offsetFromCanal = toNumber(canal.depthOffset);
  const offsetFromManning = Number.isFinite(toNumber(mp.depthMax))
    ? toNumber(mp.depthMax) * 100
    : undefined;
  const sensorOffsetCm =
    Number.isFinite(offsetFromCanal) && offsetFromCanal > 0
      ? offsetFromCanal
      : offsetFromManning;

  const depthFromDistanceM =
    Number.isFinite(rawDistance) && Number.isFinite(sensorOffsetCm)
      ? Math.max(0, (sensorOffsetCm - rawDistance) / 100)
      : undefined;

  const inferredDepthM = Number.isFinite(directDepthM)
    ? directDepthM
    : depthFromDistanceM;

  if (Number.isFinite(inferredDepthM)) {
    reading.depth = +Number(inferredDepthM).toFixed(4);
    reading.height = reading.depth;
    if (!Number.isFinite(reading.waterLevel)) {
      reading.waterLevel = reading.depth;
    }
  }

  const canRunManning =
    Number.isFinite(reading.depth) &&
    typeof mp.shape === "string" &&
    Number.isFinite(toNumber(mp.n)) &&
    Number.isFinite(toNumber(mp.S));

  if (canRunManning) {
    const manning = calculateFlowRate(reading.depth, mp);
    reading.flowRate = manning.Q;
    reading.discharge = manning.Q;
    reading.speed = manning.V;
    reading.calculatedArea = manning.A;
    reading.calculatedHydraulicRadius = manning.R;
    reading.wettedPerimeter = manning.P;
    if (Number.isFinite(rawDistance)) {
      reading.sensorType = "ultrasonic";
    }
  }

  if (!Number.isFinite(reading.flowRate)) {
    reading.flowRate = toNumber(payload.flowRate) ?? 0;
  }
  if (!Number.isFinite(reading.discharge)) {
    reading.discharge = toNumber(payload.discharge) ?? reading.flowRate;
  }
  if (!Number.isFinite(reading.speed)) {
    reading.speed = toNumber(payload.speed) ?? 0;
  }

  reading.status = normalizeStatus(payload.status, reading.flowRate, canal);

  dataBuffer.push(canalId, reading);

  return {
    accepted: true,
    canalId,
    deviceId,
    status: reading.status,
    flowRate: reading.flowRate,
    speed: reading.speed,
    depth: reading.depth,
  };
}

async function processRegisterMessage(payload) {
  const canalId = payload?.canalId
    ? String(payload.canalId).toLowerCase().trim()
    : "";
  const deviceId = payload?.deviceId ? String(payload.deviceId).trim() : "";

  if (!canalId || !deviceId) {
    return { accepted: false, reason: "Missing canalId or deviceId" };
  }

  const canal = await Canal.findOne({ canalId, isActive: true });
  if (!canal) {
    return { accepted: false, reason: `Canal not found: ${canalId}` };
  }

  if (canal.esp32DeviceId && canal.esp32DeviceId !== deviceId) {
    return {
      accepted: false,
      reason: `Device mismatch for canal ${canalId}. Expected ${canal.esp32DeviceId}, got ${deviceId}`,
    };
  }

  if (canal.esp32DeviceId !== deviceId) {
    canal.esp32DeviceId = deviceId;
    await canal.save();
  }

  return { accepted: true, canalId, deviceId };
}

module.exports = {
  processMqttReading,
  processRegisterMessage,
};
