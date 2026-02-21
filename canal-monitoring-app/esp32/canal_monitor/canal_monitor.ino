/*
 * ============================================================
 *  Canal Monitoring System — ESP32 Firmware
 * ============================================================
 *
 *  This sketch reads sensor data and sends it to the
 *  Canal Monitoring backend over Wi-Fi.
 *
 *  Workflow:
 *    1. Connect to Wi-Fi
 *    2. Register this device with the backend
 *    3. Every SEND_INTERVAL seconds, read sensors and POST data
 *
 *  Required libraries (install via Arduino Library Manager):
 *    - ArduinoJson  (v7+)
 *    - HTTPClient   (built-in with ESP32 board package)
 *    - WiFi         (built-in with ESP32 board package)
 *
 *  Board: ESP32 Dev Module (or your specific board)
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// =====================  USER CONFIG  =========================
// Wi-Fi credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend server URL  (no trailing slash)
// For local development use your PC's local IP, e.g. "http://192.168.1.50:3001"
// For production use your deployed backend URL
const char* SERVER_URL = "http://192.168.1.100:3001";

// Canal this device is assigned to (must already exist in the database)
const char* CANAL_ID = "your-canal-id";

// Unique device identifier for this ESP32
// Tip: use something descriptive, e.g. "ESP32_PEECHI_001"
const char* DEVICE_ID = "ESP32_DEVICE_001";

// How often to send data (in seconds)
const int SEND_INTERVAL = 5;

// =====================  SENSOR PINS  =========================
// Adjust these to match your wiring

// Ultrasonic sensor (HC-SR04 or JSN-SR04T)
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

// (Optional) Analog sensors
const int TEMP_SENSOR_PIN = 34;   // e.g. DS18B20 or thermistor
const int PH_SENSOR_PIN   = 35;   // pH probe analog output
const int TURB_SENSOR_PIN = 32;   // Turbidity sensor analog

// Max distance the ultrasonic sensor is mounted above the canal bottom (cm)
// Used to convert "distance to water surface" → "water depth"
const float SENSOR_HEIGHT_CM = 200.0;

// =====================  GLOBALS  =============================
unsigned long lastSendTime = 0;
bool deviceRegistered = false;
int  readingCount = 0;

// =============================================================
//                      SENSOR HELPERS
// =============================================================

/**
 * Read water depth using an ultrasonic sensor.
 * Returns depth in meters.
 * Depth = SENSOR_HEIGHT - measured distance to water surface.
 */
float readUltrasonicDepth() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // timeout 30 ms
  if (duration == 0) {
    Serial.println("[WARN] Ultrasonic timeout — no echo received");
    return -1.0; // error
  }

  float distanceCm = (duration * 0.0343) / 2.0;
  float depthCm    = SENSOR_HEIGHT_CM - distanceCm;

  if (depthCm < 0) depthCm = 0;

  return depthCm / 100.0; // convert to meters
}

/**
 * Read temperature from an analog sensor.
 * Replace this with your actual sensor library (e.g. OneWire + DallasTemperature).
 * Returns degrees Celsius.
 */
float readTemperature() {
  int raw = analogRead(TEMP_SENSOR_PIN);
  // Placeholder conversion — replace with your sensor's formula
  float voltage = raw * (3.3 / 4095.0);
  float tempC = voltage * 100.0; // e.g. LM35: 10 mV/°C
  return tempC;
}

/**
 * Read pH from an analog sensor.
 * Returns pH value (0-14).
 */
float readPH() {
  int raw = analogRead(PH_SENSOR_PIN);
  // Placeholder — calibrate for your pH probe
  float voltage = raw * (3.3 / 4095.0);
  float pH = 3.5 * voltage;  // replace with calibrated formula
  return constrain(pH, 0.0, 14.0);
}

/**
 * Read turbidity from an analog sensor.
 * Returns NTU (Nephelometric Turbidity Units).
 */
float readTurbidity() {
  int raw = analogRead(TURB_SENSOR_PIN);
  // Placeholder — calibrate for your turbidity sensor
  float voltage = raw * (3.3 / 4095.0);
  float ntu = voltage * 100.0; // rough placeholder
  return max(ntu, 0.0f);
}

/**
 * Read battery level (if using a voltage divider on a battery).
 * Returns percentage (0-100).
 */
float readBatteryLevel() {
  // If powered via USB this is not applicable — return 100
  // For battery: read ADC on a voltage divider and map to 0-100%
  return 100.0;
}

/**
 * Get Wi-Fi signal strength in dBm.
 */
float getSignalStrength() {
  return (float)WiFi.RSSI();
}

// =============================================================
//                      NETWORK HELPERS
// =============================================================

/**
 * Connect (or reconnect) to Wi-Fi.
 */
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected!  IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Connection FAILED — will retry next loop");
  }
}

/**
 * Register this ESP32 with the backend.
 * Endpoint: POST /api/esp32/register
 */
bool registerDevice() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/register";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-ESP32-ID", DEVICE_ID);
  http.setTimeout(10000);

  // Build JSON body
  JsonDocument doc;
  doc["canalId"] = CANAL_ID;

  String body;
  serializeJson(doc, body);

  Serial.printf("[REG] POST %s\n", url.c_str());
  int httpCode = http.POST(body);

  if (httpCode == 200) {
    String response = http.getString();
    Serial.printf("[REG] Success: %s\n", response.c_str());
    http.end();
    return true;
  } else {
    String response = http.getString();
    Serial.printf("[REG] Failed (HTTP %d): %s\n", httpCode, response.c_str());
    http.end();
    return false;
  }
}

/**
 * Send sensor reading to the backend.
 * Endpoint: POST /api/esp32/data
 */
bool sendReading(float depth, float temperature, float pH, float turbidity,
                 float batteryLevel, float signalStrength) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/data";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-ESP32-ID", DEVICE_ID);
  http.setTimeout(10000);

  // Build JSON payload
  JsonDocument doc;
  doc["canalId"]        = CANAL_ID;
  doc["depth"]          = round(depth * 100.0) / 100.0;
  doc["waterLevel"]     = round(depth * 100.0) / 100.0;
  doc["temperature"]    = round(temperature * 10.0) / 10.0;
  doc["pH"]             = round(pH * 100.0) / 100.0;
  doc["turbidity"]      = round(turbidity * 10.0) / 10.0;
  doc["batteryLevel"]   = round(batteryLevel);
  doc["signalStrength"] = round(signalStrength);

  String body;
  serializeJson(doc, body);

  Serial.printf("[DATA] POST %s\n", url.c_str());
  Serial.printf("       Depth=%.2fm  Temp=%.1f°C  pH=%.2f  Turb=%.1f  Batt=%.0f%%\n",
                depth, temperature, pH, turbidity, batteryLevel);

  int httpCode = http.POST(body);

  if (httpCode == 200) {
    String response = http.getString();
    Serial.printf("[DATA] OK: %s\n", response.c_str());
    http.end();
    return true;
  } else {
    String response = http.getString();
    Serial.printf("[DATA] Error (HTTP %d): %s\n", httpCode, response.c_str());
    http.end();
    return false;
  }
}

// =============================================================
//                      SETUP & LOOP
// =============================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("========================================");
  Serial.println("  Canal Monitoring System — ESP32");
  Serial.printf("  Device ID : %s\n", DEVICE_ID);
  Serial.printf("  Canal ID  : %s\n", CANAL_ID);
  Serial.printf("  Server    : %s\n", SERVER_URL);
  Serial.printf("  Interval  : %d seconds\n", SEND_INTERVAL);
  Serial.println("========================================");

  // Configure sensor pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Connect to Wi-Fi
  connectWiFi();

  // Register device with backend
  if (WiFi.status() == WL_CONNECTED) {
    deviceRegistered = registerDevice();
    if (!deviceRegistered) {
      Serial.println("[WARN] Registration failed — will retry before first send");
    }
  }
}

void loop() {
  // Ensure Wi-Fi is connected
  connectWiFi();

  unsigned long now = millis();

  // Send data every SEND_INTERVAL seconds
  if (now - lastSendTime >= (unsigned long)SEND_INTERVAL * 1000) {
    lastSendTime = now;

    // Retry registration if it hasn't succeeded yet
    if (!deviceRegistered) {
      deviceRegistered = registerDevice();
      if (!deviceRegistered) {
        Serial.println("[WARN] Still not registered — skipping this reading");
        return;
      }
    }

    // ── Read all sensors ──
    float depth       = readUltrasonicDepth();
    float temperature = readTemperature();
    float pH          = readPH();
    float turbidity   = readTurbidity();
    float battery     = readBatteryLevel();
    float rssi        = getSignalStrength();

    // Skip if ultrasonic reading failed
    if (depth < 0) {
      Serial.println("[WARN] Bad depth reading — skipping");
      return;
    }

    readingCount++;
    Serial.printf("\n── Reading #%d ──\n", readingCount);

    // ── Send to backend ──
    bool ok = sendReading(depth, temperature, pH, turbidity, battery, rssi);

    if (ok) {
      Serial.println("[OK] Data sent successfully");
    } else {
      Serial.println("[ERR] Failed to send data");
    }
  }
}
