# Canal Monitoring Backend (MQTT-First)

This backend now uses HiveMQ MQTT as the primary ingestion path for ESP32 data.
HTTP data ingestion has been retired.

## Overview

The backend is built around this flow:

1. ESP32 publishes telemetry to HiveMQ topics.
2. Backend subscribes to MQTT topics and parses JSON payloads.
3. Readings are normalized and linked to a registered canal/device.
4. For ultrasonic canals, depth/height and Manning velocity/discharge are calculated.
5. Latest readings are pushed to in-memory live store and SSE streams.
6. Buffered readings are periodically aggregated and flushed to MongoDB.

## MQTT Topics

Broker:

```text
broker.hivemq.com:1883
```

Subscribed topics:

```text
canal/+/data
canal/+/settings
canal/iims/poseidon/register
canal/+/status
```

Device publish conventions:

- Data: canal/<device-id>/data
- Settings: canal/<device-id>/settings
- Register: canal/iims/poseidon/register

## Core Logic

### 1) Device and Canal Association

- Incoming payload must contain canalId and deviceId.
- Canal must exist and be active.
- If canal has no esp32DeviceId yet, backend binds first seen device.
- If canal is already bound to another device, reading is rejected.

### 2) Ultrasonic Height and Manning Velocity

For sensorType: ultrasonic:

- If payload provides depth, it is used directly (meters).
- Otherwise depth is derived from distance and depthOffset:

```text
depth_m = max(0, (depthOffset_cm - distance_cm) / 100)
height_m = depth_m
```

- Manning parameters are read from canal.manningsParams.
- Backend computes:
  - speed (V)
  - flowRate/discharge (Q)
  - area (A)
  - hydraulic radius (R)
  - wetted perimeter (P)

For non-ultrasonic sensors, flowRate/speed/discharge values from payload are used.

### 3) Status Normalization

- If payload status is valid, backend uses it.
- Otherwise backend derives status from flowRate and canal thresholds:
  - below lowerLimit -> LOW_FLOW
  - above upperLimit -> HIGH_FLOW
  - zero/non-positive -> STOPPED
  - otherwise -> FLOWING

### 4) Live and Historical Data

- Live path:
  - reading is pushed to in-memory store
  - reading is broadcast to SSE subscribers immediately
- Historical path:
  - buffered readings are minute-aggregated
  - aggregated records are inserted into MongoDB on flush interval

## Environment Variables

Use .env.example as baseline.

Required:

```env
MONGODB_URI=mongodb://localhost:27017/canal-monitoring
PORT=3001
FRONTEND_URL=http://localhost:3000
```

MQTT:

```env
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
MQTT_CLIENT_ID=canal-backend-dev
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_DATA_TOPIC=canal/+/data
MQTT_SETTINGS_TOPIC=canal/+/settings
MQTT_REGISTER_TOPIC=canal/iims/poseidon/register
MQTT_STATUS_TOPIC=canal/+/status
```

Buffer flush:

```env
ESP32_BUFFER_FLUSH_INTERVAL=600
```

This value is in seconds.

## API Endpoints (Current)

ESP32 and ingest health:

```http
GET  /api/esp32/status
GET  /api/esp32/latest
GET  /api/esp32/latest/:canalId
GET  /api/esp32/buffer-stats
POST /api/esp32/register
POST /api/esp32/flush
POST /api/esp32/data   # Deprecated, returns 410
```

SSE streaming:

```http
GET /api/stream/canals
GET /api/stream/canal/:canalId
```

Dashboard and analytics:

```http
GET /api/dashboard/overview
GET /api/dashboard/metrics
GET /api/dashboard/timeseries/:canalId
GET /api/dashboard/alerts
GET /api/dashboard/stats
```

System:

```http
GET /health
GET /
```

## Sample MQTT Payloads

Register payload (to canal/iims/poseidon/register):

```json
{
  "canalId": "peechi-canal",
  "deviceId": "fku",
  "fwVersion": "1.0.0"
}
```

Data payload (to canal/fku/data):

```json
{
  "canalId": "peechi-canal",
  "deviceId": "fku",
  "distance": 74,
  "batteryLevel": 92,
  "radarStatus": 1,
  "temperature": 30.2,
  "timestamp": "2026-03-24T10:30:00Z"
}
```

Alternative data payload for radar-like direct flow values:

```json
{
  "canalId": "peechi-canal",
  "deviceId": "fku",
  "flowRate": 14.2,
  "speed": 1.8,
  "discharge": 14.2,
  "status": "FLOWING"
}
```

## Local Run

1. Install dependencies:

```bash
cd backend
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Start MongoDB and initialize canals if needed:

```bash
node scripts/init-database.js
```

4. Run backend:

```bash
npm run dev
```

5. Confirm MQTT status:

```bash
curl http://localhost:3001/api/esp32/status
```

## Frontend Behavior Notes

The frontend now receives and highlights:

- Water height (height/depth/waterLevel)
- Manning velocity (speed)

Flow and discharge remain available as secondary metrics.

## Troubleshooting

1. No live readings in UI:

- Check /api/esp32/status for MQTT connection and subscription stats.
- Verify ESP32 topic is canal/<device-id>/data.
- Verify payload includes canalId and deviceId.

2. Readings rejected:

- Confirm canal exists and is active.
- Confirm canal esp32DeviceId matches sender deviceId.

3. Height is missing for ultrasonic canal:

- Ensure sensorType is ultrasonic on canal config.
- Provide either depth in payload, or distance with depthOffset configured.

4. Velocity is zero for ultrasonic canal:

- Check canal.manningsParams shape, n, and S values.

## Notes

- Old HTTP ingestion at /api/esp32/data is intentionally disabled.
- This backend is designed for MQTT-first ESP32 telemetry.
