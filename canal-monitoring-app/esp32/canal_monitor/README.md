# ESP32 — Canal Monitoring Module

This folder contains the Arduino firmware for the ESP32 microcontroller that reads canal sensors and sends data to the Canal Monitoring backend.

---

## How It Works

```
ESP32 (this code)
  │
  ├─ Reads sensors (ultrasonic depth, temperature, pH, turbidity)
  │
  ├─ Connects to Wi-Fi
  │
  ├─ Registers itself with the backend   POST /api/esp32/register
  │
  └─ Sends readings every N seconds      POST /api/esp32/data
        │
        └─► Backend processes data, calculates flow via Manning's equation,
            and pushes updates to the frontend dashboard in real-time (SSE)
```

---

## Prerequisites

| Item | Notes |
|------|-------|
| **ESP32 Dev Board** | Any ESP32 variant (DevKit v1, NodeMCU-32S, etc.) |
| **Arduino IDE 2.x** | Or PlatformIO — either works |
| **ESP32 Board Package** | Install via Boards Manager → search "esp32" by Espressif |
| **ArduinoJson library** | Install via Library Manager → search "ArduinoJson" (v7+) |
| **Sensors** | Ultrasonic (HC-SR04 / JSN-SR04T), plus optional temperature, pH, turbidity probes |
| **Wi-Fi network** | The ESP32 and backend server must be on the same network (or the backend must be publicly reachable) |

---

## Hardware Wiring

Default pin assignments (change in the sketch if needed):

| Sensor | ESP32 Pin | Notes |
|--------|-----------|-------|
| Ultrasonic TRIG | GPIO 5 | HC-SR04 or JSN-SR04T trigger |
| Ultrasonic ECHO | GPIO 18 | Echo pin |
| Temperature | GPIO 34 (ADC) | Analog thermistor / LM35 |
| pH Probe | GPIO 35 (ADC) | Analog pH module output |
| Turbidity | GPIO 32 (ADC) | Analog turbidity sensor |

> **Tip:** If you only have the ultrasonic sensor, that's fine — the backend will compute flow rate, speed, and discharge from the depth reading using Manning's equation (if `manningsParams` are configured on the canal).

---

## Setup Instructions

### 1. Make sure a canal exists in the database

Before the ESP32 can register, the canal must already be created in the system (either through the admin UI or directly in MongoDB). The canal document needs:

- A `canalId` (e.g. `"peechi-canal"`)
- `isActive: true`
- Optionally, `manningsParams` configured for automatic flow calculation from depth

### 2. Configure the sketch

Open `canal_monitor.ino` and edit the **USER CONFIG** section at the top:

```cpp
// Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend server URL (no trailing slash)
const char* SERVER_URL = "http://192.168.1.100:3001";

// Canal this device is assigned to
const char* CANAL_ID = "your-canal-id";

// Unique device identifier
const char* DEVICE_ID = "ESP32_DEVICE_001";

// Send interval in seconds
const int SEND_INTERVAL = 5;
```

| Setting | Description |
|---------|-------------|
| `WIFI_SSID` | Your Wi-Fi network name |
| `WIFI_PASSWORD` | Your Wi-Fi password |
| `SERVER_URL` | Full URL of the backend. For local dev, use your PC's LAN IP (run `ipconfig` on Windows or `ifconfig` on Mac/Linux). For production, use your deployed URL (e.g. `https://your-api.onrender.com`) |
| `CANAL_ID` | Must match a `canalId` that exists in the database |
| `DEVICE_ID` | A unique string identifying this particular ESP32 board |
| `SEND_INTERVAL` | How often (in seconds) to send a reading. 3–10 is typical |

### 3. Set sensor height

If using an ultrasonic sensor mounted above the canal:

```cpp
// Distance from sensor to canal bottom (cm)
const float SENSOR_HEIGHT_CM = 200.0;
```

The firmware calculates: **depth = SENSOR_HEIGHT − measured distance to water surface**.

### 4. Upload

1. Open `canal_monitor.ino` in Arduino IDE
2. Select your board: **Tools → Board → ESP32 Dev Module**
3. Select the correct **COM port**
4. Click **Upload**
5. Open **Serial Monitor** (115200 baud) to see output

---

## What Happens at Runtime

1. **Wi-Fi** — The ESP32 connects to the configured network
2. **Registration** — It sends `POST /api/esp32/register` with the `canalId` and `X-ESP32-ID` header. The backend links this device to that canal
3. **Data loop** — Every `SEND_INTERVAL` seconds it reads the sensors and sends `POST /api/esp32/data`:

```json
{
  "canalId": "peechi-canal",
  "depth": 1.45,
  "waterLevel": 1.45,
  "temperature": 26.3,
  "pH": 7.12,
  "turbidity": 5.4,
  "batteryLevel": 100,
  "signalStrength": -62
}
```

The backend will:
- Validate the data
- If the canal uses an **ultrasonic** sensor with Manning's params configured, it calculates `flowRate`, `speed`, and `discharge` from the depth automatically
- If the canal uses a **radar** sensor, you should send `flowRate`, `speed`, and `discharge` directly in the payload
- Buffer the reading and flush to MongoDB periodically
- Push the latest data to all connected frontends via SSE (Server-Sent Events)

---

## API Reference (for the ESP32)

### Register Device

```
POST /api/esp32/register
Headers:
  Content-Type: application/json
  X-ESP32-ID: ESP32_DEVICE_001

Body:
{
  "canalId": "your-canal-id"
}

Response (200):
{
  "success": true,
  "message": "Device registered successfully",
  "canalId": "your-canal-id",
  "deviceId": "ESP32_DEVICE_001",
  "canal": {
    "name": "Peechi Canal",
    "type": "irrigation",
    "location": [76.280493, 10.535959]
  }
}
```

### Send Reading

```
POST /api/esp32/data
Headers:
  Content-Type: application/json
  X-ESP32-ID: ESP32_DEVICE_001

Body:
{
  "canalId": "your-canal-id",
  "depth": 1.45,              // meters (required for ultrasonic)
  "waterLevel": 1.45,         // meters
  "flowRate": 14.2,           // m³/s (required for radar, auto-calculated for ultrasonic)
  "speed": 1.8,               // m/s  (required for radar, auto-calculated for ultrasonic)
  "discharge": 520.0,         // m³/s (required for radar, auto-calculated for ultrasonic)
  "status": "FLOWING",        // optional: FLOWING | STOPPED | LOW_FLOW | HIGH_FLOW | BLOCKED | ERROR
  "temperature": 26.3,        // °C (optional)
  "pH": 7.12,                 // 0-14 (optional)
  "turbidity": 5.4,           // NTU (optional)
  "batteryLevel": 95,         // 0-100% (optional)
  "signalStrength": -62       // dBm (optional)
}

Response (200):
{
  "success": true,
  "message": "Data buffered (3 readings queued, next flush to DB in ≤30s)",
  "canalId": "your-canal-id",
  "deviceId": "ESP32_DEVICE_001",
  "timestamp": "2026-02-21T10:30:00.000Z"
}
```

### Check Server Status

```
GET /api/esp32/status

Response:
{
  "status": "active",
  "timestamp": "2026-02-21T10:30:00.000Z",
  "server": "canal-monitoring-api",
  "version": "1.0.0"
}
```

### Get Device Config

```
GET /api/esp32/config/ESP32_DEVICE_001

Response:
{
  "deviceId": "ESP32_DEVICE_001",
  "canalId": "your-canal-id",
  "canalName": "Your Canal",
  "location": [76.280493, 10.535959],
  "updateInterval": 300
}
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `[WiFi] Connection FAILED` | Check SSID/password. Make sure 2.4 GHz is available (ESP32 doesn't support 5 GHz) |
| `[REG] Failed (HTTP 404)` | The `canalId` doesn't exist in the database. Create it first via the admin panel or MongoDB |
| `[DATA] Error (HTTP 403)` | Another ESP32 is already registered to this canal. Clear the `esp32DeviceId` field on the canal document, or use the same `DEVICE_ID` |
| `[DATA] Error (HTTP 400)` | Validation failed — check the Serial Monitor for the full error response. Ensure values are within valid ranges |
| `[WARN] Ultrasonic timeout` | Check wiring on TRIG/ECHO pins. Make sure the sensor has 5 V power (some ultrasonic sensors don't work on 3.3 V) |
| No data on dashboard | Ensure the backend is running, the canal is active, and the frontend is connected to SSE |

---

## Testing Without Hardware

You can test the full pipeline without an ESP32 by using the simulator script included in the backend:

```bash
cd backend
node scripts/simulate-esp32.js your-canal-id 3
```

This sends fake but realistic data every 3 seconds, mimicking what the real ESP32 firmware does.

---

## Customizing Sensors

The `readTemperature()`, `readPH()`, and `readTurbidity()` functions contain **placeholder** conversion formulas. Replace them with the correct formulas or libraries for your specific sensors:

- **DS18B20** temperature: Use the `OneWire` + `DallasTemperature` libraries
- **SEN0161** pH sensor: Calibrate with pH 4.0 and pH 7.0 buffer solutions
- **SEN0189** turbidity: Calibrate against known NTU standards

The depth reading via ultrasonic is the most critical measurement — the backend uses it with Manning's equation to compute flow rate, speed, and cross-sectional area.

---

## File Structure

```
esp32/
└── canal_monitor/
    ├── canal_monitor.ino    ← Main Arduino sketch
    └── README.md            ← This file
```
