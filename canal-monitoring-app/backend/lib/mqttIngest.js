const mqtt = require("mqtt");
const {
  processMqttReading,
  processRegisterMessage,
} = require("./readingProcessor");

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

let client = null;
let mqttConnected = false;
const stats = {
  startedAt: null,
  received: 0,
  accepted: 0,
  rejected: 0,
  lastMessageAt: null,
  lastError: null,
};

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
      const result = await processMqttReading(parsed, "mqtt");
      if (result.accepted) {
        stats.accepted += 1;
        console.log(
          `[MQTT] Reading accepted canal=${result.canalId} device=${result.deviceId} depth=${result.depth ?? "n/a"}m velocity=${result.speed?.toFixed?.(3) ?? result.speed}m/s`,
        );
      } else {
        stats.rejected += 1;
        console.warn(`[MQTT] Reading rejected: ${result.reason}`);
      }
      return;
    }

    if (/^canal\/[^/]+\/status$/.test(topic)) {
      stats.accepted += 1;
      return;
    }

    if (/^canal\/[^/]+\/settings$/.test(topic)) {
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
  if (client) return;

  stats.startedAt = new Date().toISOString();

  client = mqtt.connect(defaults.brokerUrl, {
    clientId: defaults.clientId,
    username: defaults.username || undefined,
    password: defaults.password || undefined,
    reconnectPeriod: 5000,
    keepalive: 60,
    clean: true,
  });

  client.on("connect", () => {
    mqttConnected = true;
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
    console.log("[MQTT] Reconnecting...");
  });

  client.on("offline", () => {
    mqttConnected = false;
    console.warn("[MQTT] Offline");
  });

  client.on("error", (error) => {
    stats.lastError = error.message;
    console.error("[MQTT] Error:", error.message);
  });
}

async function stop() {
  if (!client) return;

  await new Promise((resolve) => {
    client.end(false, {}, () => resolve());
  });

  client = null;
  mqttConnected = false;
}

async function publishDeviceSettings(deviceId, payload) {
  if (!deviceId) {
    return { ok: false, message: "Missing deviceId" };
  }

  if (!client || !mqttConnected) {
    return { ok: false, message: "MQTT client is not connected" };
  }

  const topic = `canal/${deviceId}/settings`;
  const message = JSON.stringify(payload || {});

  return new Promise((resolve) => {
    client.publish(topic, message, { qos: 1 }, (error) => {
      if (error) {
        stats.lastError = error.message;
        return resolve({ ok: false, message: error.message, topic });
      }

      return resolve({ ok: true, topic, payload });
    });
  });
}

function getStatus() {
  return {
    connected: mqttConnected,
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
  getStatus,
};
