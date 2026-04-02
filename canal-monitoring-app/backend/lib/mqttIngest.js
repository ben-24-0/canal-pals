const mqtt = require("mqtt");
const {
  processMqttReading,
  processRegisterMessage,
} = require("./readingProcessor");
const DeviceSettings = require("../models/DeviceSettings");

const defaults = {
  brokerUrl: process.env.MQTT_BROKER_URL || "mqtt://broker.hivemq.com:1883",
  clientId:
    process.env.MQTT_CLIENT_ID ||
    `canal-backend-${Math.random().toString(16).slice(2, 10)}`,
  username: process.env.MQTT_USERNAME || "",
  password: process.env.MQTT_PASSWORD || "",
  dataTopic: process.env.MQTT_DATA_TOPIC || "canal/+/data",
  settingsTopic: process.env.MQTT_SETTINGS_TOPIC || "canal/+/settings",
  registerTopic:
    process.env.MQTT_REGISTER_TOPIC || "canal/iims/poseidon/register",
  statusTopic: process.env.MQTT_STATUS_TOPIC || "canal/+/status",
};

const UNKNOWN_CANAL_WARN_INTERVAL_MS =
  parseInt(process.env.MQTT_UNKNOWN_CANAL_WARN_INTERVAL_MS, 10) || 60 * 1000;
const LOG_ALL_READINGS =
  String(
    process.env.MQTT_LOG_ALL_READINGS || process.env.NODE_ENV !== "production",
  )
    .toLowerCase()
    .trim() === "true";

let client = null;
let publisherClient = null;
let mqttConnected = false;
let publisherConnected = false;
let connectionState = "idle";
const latestSettingsByDevice = new Map();
const unknownCanalWarningCache = new Map();
const stats = {
  startedAt: null,
  received: 0,
  accepted: 0,
  rejected: 0,
  lastMessageAt: null,
  lastError: null,
};

const DEFAULT_SEND_INTERVAL_MS = 30 * 60 * 1000;

function topicDeviceId(topic) {
  const parts = String(topic || "").split("/");
  return parts[1] || "unknown";
}

function logIncomingReading(topic, parsed) {
  if (!LOG_ALL_READINGS) return;

  const canalId = parsed?.canalId ? String(parsed.canalId).trim() : "unknown";
  const deviceId = parsed?.deviceId
    ? String(parsed.deviceId).trim()
    : topicDeviceId(topic);
  const flowRate = Number(parsed?.flowRate);
  const depth = Number(parsed?.depth);
  const waterLevel = Number(parsed?.waterLevel);

  console.log(
    `[MQTT] RX canal=${canalId} device=${deviceId} flowRate=${Number.isFinite(flowRate) ? flowRate : "n/a"} depth=${Number.isFinite(depth) ? depth : "n/a"} waterLevel=${Number.isFinite(waterLevel) ? waterLevel : "n/a"}`,
  );
}

function logRejectedReading(reason) {
  const canalNotFoundPrefix = "Canal not found: ";
  const text = String(reason || "Unknown reason");

  if (!text.startsWith(canalNotFoundPrefix)) {
    console.warn(`[MQTT] Reading rejected: ${text}`);
    return;
  }

  const canalId = text.slice(canalNotFoundPrefix.length).trim() || "unknown";
  const now = Date.now();
  const cached = unknownCanalWarningCache.get(canalId) || {
    count: 0,
    lastWarnAt: 0,
  };

  cached.count += 1;

  if (now - cached.lastWarnAt >= UNKNOWN_CANAL_WARN_INTERVAL_MS) {
    const count = cached.count;
    const windowSeconds = Math.round(UNKNOWN_CANAL_WARN_INTERVAL_MS / 1000);
    const suffix = count > 1 ? ` (x${count} in last ${windowSeconds}s)` : "";
    console.warn(
      `[MQTT] Reading rejected: Canal not found: ${canalId}${suffix}`,
    );
    cached.count = 0;
    cached.lastWarnAt = now;
  }

  unknownCanalWarningCache.set(canalId, cached);
}

function sanitizeSettingsPayload(payload) {
  if (!payload || typeof payload !== "object") return {};

  const out = {};

  if (payload.sendIntervalMs !== undefined) {
    const interval = Number(payload.sendIntervalMs);
    if (Number.isFinite(interval) && interval > 0) {
      out.sendIntervalMs = Math.round(interval);
    }
  }

  if (payload.forceReadNow !== undefined) {
    out.forceReadNow = Boolean(payload.forceReadNow);
  }

  return out;
}

function rememberDeviceSettings(deviceId, payload, topic = null) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) return null;

  const sanitized = sanitizeSettingsPayload(payload);
  if (Object.keys(sanitized).length === 0) return null;

  const existing = latestSettingsByDevice.get(normalizedDeviceId) || {};
  const record = {
    ...existing,
    ...sanitized,
    deviceId: normalizedDeviceId,
    topic: topic || existing.topic || `canal/${normalizedDeviceId}/settings`,
    updatedAt: new Date().toISOString(),
  };

  latestSettingsByDevice.set(normalizedDeviceId, record);
  return record;
}

async function persistDeviceSettings(record, source = "api") {
  if (!record?.deviceId) return;

  const update = {
    deviceId: record.deviceId,
    topic: record.topic || undefined,
    source,
    updatedAt: new Date(),
  };

  const interval = Number(record.sendIntervalMs);
  if (Number.isFinite(interval) && interval > 0) {
    update.sendIntervalMs = Math.round(interval);
  }

  if (record.forceReadNow !== undefined) {
    update.forceReadNow = Boolean(record.forceReadNow);
  }

  const canalId = String(record.canalId || "").trim().toLowerCase();
  if (canalId) {
    update.canalId = canalId;
  }

  await DeviceSettings.findOneAndUpdate(
    { deviceId: record.deviceId },
    { $set: update, $setOnInsert: { deviceId: record.deviceId } },
    { upsert: true, new: true },
  );
}

async function restoreDeviceSettingsFromDb() {
  const docs = await DeviceSettings.find({}).lean();

  for (const doc of docs) {
    const record = rememberDeviceSettings(doc.deviceId, doc, doc.topic || null);
    if (!record) continue;

    record.updatedAt = doc.updatedAt
      ? new Date(doc.updatedAt).toISOString()
      : record.updatedAt;
    if (doc.canalId) {
      record.canalId = doc.canalId;
    }

    latestSettingsByDevice.set(record.deviceId, record);
  }

  return docs.length;
}

function parsePayload(buffer) {
  const raw = String(buffer || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function handleTopicMessage(topic, payload) {
  stats.received += 1;
  stats.lastMessageAt = new Date().toISOString();

  const parsed = parsePayload(payload);
  if (!parsed) {
    stats.rejected += 1;
    console.warn(`[MQTT] Ignored non-JSON payload on ${topic}`);
    return;
  }

  try {
    if (topic === defaults.registerTopic) {
      const result = await processRegisterMessage(parsed);
      if (result.accepted) {
        stats.accepted += 1;
        console.log(
          `[MQTT] Registered device ${result.deviceId} for canal ${result.canalId}`,
        );
      } else {
        stats.rejected += 1;
        console.warn(`[MQTT] Register rejected: ${result.reason}`);
      }
      return;
    }

    if (/^canal\/[^/]+\/data$/.test(topic)) {
      logIncomingReading(topic, parsed);
      const result = await processMqttReading(parsed, "mqtt");
      if (result.accepted) {
        stats.accepted += 1;
        console.log(
          `[MQTT] Reading accepted canal=${result.canalId} device=${result.deviceId} depth=${result.depth ?? "n/a"}m velocity=${result.speed?.toFixed?.(3) ?? result.speed}m/s`,
        );
      } else {
        stats.rejected += 1;
        logRejectedReading(result.reason);
      }
      return;
    }

    if (/^canal\/[^/]+\/status$/.test(topic)) {
      stats.accepted += 1;
      return;
    }

    if (/^canal\/[^/]+\/settings$/.test(topic)) {
      const topicParts = String(topic).split("/");
      const deviceId = topicParts[1];
      const record = rememberDeviceSettings(deviceId, parsed, topic);
      if (record) {
        persistDeviceSettings(record, "mqtt").catch((error) => {
          stats.lastError = error.message;
          console.error(
            "[MQTT] Failed to persist inbound device settings:",
            error.message,
          );
        });
      }
      stats.accepted += 1;
      return;
    }

    stats.rejected += 1;
  } catch (error) {
    stats.rejected += 1;
    stats.lastError = error.message;
    console.error("[MQTT] Failed to process message:", error.message);
  }
}

async function start() {
  if (client && publisherClient) return;

  stats.startedAt = new Date().toISOString();

  try {
    const restoredCount = await restoreDeviceSettingsFromDb();
    if (restoredCount > 0) {
      console.log(
        `[MQTT] Restored ${restoredCount} device setting records from DB`,
      );
    }
  } catch (error) {
    stats.lastError = error.message;
    console.error(
      "[MQTT] Failed to restore persisted device settings:",
      error.message,
    );
  }

  client = mqtt.connect(defaults.brokerUrl, {
    clientId: defaults.clientId,
    username: defaults.username || undefined,
    password: defaults.password || undefined,
    reconnectPeriod: 5000,
    keepalive: 60,
    clean: true,
  });

  publisherClient = mqtt.connect(defaults.brokerUrl, {
    clientId: `${defaults.clientId}-pub`,
    username: defaults.username || undefined,
    password: defaults.password || undefined,
    reconnectPeriod: 5000,
    keepalive: 60,
    clean: true,
  });

  client.on("connect", () => {
    mqttConnected = true;
    connectionState = "connected";
    stats.lastError = null;

    const topics = [
      defaults.dataTopic,
      defaults.settingsTopic,
      defaults.registerTopic,
      defaults.statusTopic,
    ];

    client.subscribe(topics, { qos: 1 }, (error) => {
      if (error) {
        stats.lastError = error.message;
        console.error("[MQTT] Subscribe failed:", error.message);
        return;
      }
      console.log(`[MQTT] Subscribed to ${topics.join(", ")}`);
    });

    console.log(`[MQTT] Connected to ${defaults.brokerUrl}`);
  });

  client.on("message", (topic, payload) => {
    handleTopicMessage(topic, payload);
  });

  client.on("reconnect", () => {
    mqttConnected = false;
    if (connectionState !== "reconnecting") {
      connectionState = "reconnecting";
      console.log("[MQTT] Reconnecting...");
    }
  });

  client.on("offline", () => {
    mqttConnected = false;
    if (connectionState !== "offline") {
      connectionState = "offline";
      console.warn("[MQTT] Offline");
    }
  });

  client.on("error", (error) => {
    stats.lastError = error.message;
    console.error("[MQTT] Error:", error.message);
  });

  publisherClient.on("connect", () => {
    publisherConnected = true;
    console.log("[MQTT-PUB] Connected");
  });

  publisherClient.on("reconnect", () => {
    publisherConnected = false;
  });

  publisherClient.on("offline", () => {
    publisherConnected = false;
    console.warn("[MQTT-PUB] Offline");
  });

  publisherClient.on("error", (error) => {
    publisherConnected = false;
    stats.lastError = error.message;
    console.error("[MQTT-PUB] Error:", error.message);
  });
}

async function stop() {
  if (!client && !publisherClient) return;

  if (client) {
    await new Promise((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }

  if (publisherClient) {
    await new Promise((resolve) => {
      publisherClient.end(false, {}, () => resolve());
    });
  }

  client = null;
  publisherClient = null;
  mqttConnected = false;
  publisherConnected = false;
}

async function publishDeviceSettings(deviceId, payload) {
  if (!deviceId) {
    return { ok: false, message: "Missing deviceId" };
  }

  if (!publisherClient || !publisherConnected) {
    return { ok: false, message: "MQTT publisher client is not connected" };
  }

  const topic = `canal/${deviceId}/settings`;
  const message = JSON.stringify(payload || {});

  return new Promise((resolve) => {
    publisherClient.publish(
      topic,
      message,
      { qos: 1, retain: false },
      (error) => {
        if (error) {
          stats.lastError = error.message;
          return resolve({ ok: false, message: error.message, topic });
        }

        const record = rememberDeviceSettings(deviceId, payload, topic);
        if (record) {
          persistDeviceSettings(record, "api").catch((persistError) => {
            stats.lastError = persistError.message;
            console.error(
              "[MQTT] Failed to persist published device settings:",
              persistError.message,
            );
          });
        }

        return resolve({ ok: true, topic, payload });
      },
    );
  });
}

function getDeviceSettings(deviceId) {
  const normalized = String(deviceId || "").trim();
  if (!normalized) return null;
  return latestSettingsByDevice.get(normalized) || null;
}

function getEffectiveSendIntervalMs(
  deviceId,
  fallbackMs = DEFAULT_SEND_INTERVAL_MS,
) {
  const settings = getDeviceSettings(deviceId);
  const configured = Number(settings?.sendIntervalMs);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.round(configured);
  }

  const fallback = Number(fallbackMs);
  return Number.isFinite(fallback) && fallback > 0
    ? Math.round(fallback)
    : DEFAULT_SEND_INTERVAL_MS;
}

function getStatus() {
  return {
    connected: mqttConnected,
    publisherConnected,
    brokerUrl: defaults.brokerUrl,
    subscriptions: [
      defaults.dataTopic,
      defaults.settingsTopic,
      defaults.registerTopic,
      defaults.statusTopic,
    ],
    stats,
  };
}

module.exports = {
  start,
  stop,
  publishDeviceSettings,
  getDeviceSettings,
  getEffectiveSendIntervalMs,
  getStatus,
};
