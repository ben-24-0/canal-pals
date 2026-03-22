/*
 * ============================================================
 *  Canal Monitoring System — ESP32 + SIM800L + I2C Firmware
 * ============================================================
 *
 *  Hardware:
 *    - ESP32 Dev Module
 *    - SIM800L GSM module (GPRS data via AT commands)
 *    - Arduino Nano slave on I2C (sends ultrasonic distance + radar)
 *    - 12V battery with voltage divider on GPIO 34
 *
 *  Workflow:
 *    1. Read ultrasonic distance + radar status from Nano over I2C
 *    2. Read battery voltage from ADC
 *    3. Register this device with the backend (once)
 *    4. POST raw sensor data every DATA_SEND_INTERVAL ms
 *
 *  The backend converts distance → depth via:
 *    depth = depthOffset − distance   (both in cm)
 *  Then runs Manning's equation to compute flow rate, velocity, etc.
 *
 *  Required: No extra Arduino libraries — uses Wire.h & HardwareSerial.
 * ============================================================
 */

#include <Wire.h>
#include <HardwareSerial.h>

// =====================  I2C CONFIG  ==========================
#define I2C_SLAVE_ADDR 8
#define I2C_SDA        21
#define I2C_SCL        22

// =====================  SIM800L CONFIG  ======================
#define GSM_RX 25   // ESP32 RX ← SIM800L TX
#define GSM_TX 26   // ESP32 TX → SIM800L RX

// =====================  BATTERY CONFIG  ======================
#define BATTERY_PIN 34
const float R1 = 47000.0;           // upper resistor (ohms)
const float R2 = 10000.0;           // lower resistor (ohms)
const float ADC_REF = 3.3 / 4095.0; // ESP32 12-bit ADC reference

// =====================  SERVER CONFIG  =======================
// >>> CHANGE THESE to match your deployment <<<
#define SERVER_URL   "https://canal-pals.onrender.com"

// >>> MUST match an existing canal in your MongoDB <<<
#define CANAL_ID     "peechi-canal"

// Unique device identifier — backend uses this to authorise the device
#define DEVICE_ID    "ESP32_SIM_PEECHI_CANAL"

// =====================  TIMING  ==============================
const unsigned long I2C_READ_INTERVAL  = 2000;   // read Nano every 2 s
const unsigned long DATA_SEND_INTERVAL = 10000;  // send to server every 10 s
const unsigned long GSM_RECONNECT_INTERVAL = 60000; // re-check GPRS every 60 s

// =====================  GLOBALS  =============================
HardwareSerial SerialGSM(1);

uint16_t ultrasonicDistance = 0;   // cm — raw distance from sensor
int      radarStatus        = 0;   // 0 = no motion, 1 = motion detected
float    batteryVoltage     = 0.0;
int      batteryPercent     = 0;
bool     deviceRegistered   = false;
int      sendCount          = 0;

unsigned long lastI2CRead      = 0;
unsigned long lastDataSend     = 0;
unsigned long lastGSMCheck     = 0;

// =============================================================
//                          SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========================================");
  Serial.println("  Canal Monitoring — ESP32 + SIM800L");
  Serial.println("  Device : " DEVICE_ID);
  Serial.println("  Canal  : " CANAL_ID);
  Serial.println("  Server : " SERVER_URL);
  Serial.println("========================================\n");

  // Battery ADC
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);

  // I2C master
  Wire.begin(I2C_SDA, I2C_SCL);
  Serial.println("[I2C] Initialised (SDA=" + String(I2C_SDA) +
                 ", SCL=" + String(I2C_SCL) + ")");

  // SIM800L serial
  SerialGSM.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  Serial.println("[GSM] Serial started on RX=" + String(GSM_RX) +
                 " TX=" + String(GSM_TX));

  delay(3000);  // let SIM800L boot
  initGSM();

  Serial.println("\n[SYS] Ready — entering main loop\n");
}

// =============================================================
//                          LOOP
// =============================================================
void loop() {
  unsigned long now = millis();

  // 1. Read sensors from Nano
  if (now - lastI2CRead >= I2C_READ_INTERVAL) {
    lastI2CRead = now;
    readI2CData();
  }

  // 2. Periodically verify GPRS is still up
  if (now - lastGSMCheck >= GSM_RECONNECT_INTERVAL) {
    lastGSMCheck = now;
    ensureGPRS();
  }

  // 3. Send data to backend
  if (now - lastDataSend >= DATA_SEND_INTERVAL) {
    lastDataSend = now;

    readBatteryVoltage();

    // Register once
    if (!deviceRegistered) {
      deviceRegistered = registerDevice();
    }

    sendDataToServer();
  }
}

// =============================================================
//                     SENSOR READING
// =============================================================

/**
 * Read 4 bytes from the Arduino Nano over I2C:
 *   [distanceHigh, distanceLow, radarHigh, radarLow]
 */
void readI2CData() {
  Wire.requestFrom(I2C_SLAVE_ADDR, 4);

  if (Wire.available() == 4) {
    byte uH = Wire.read();
    byte uL = Wire.read();
    byte rH = Wire.read();
    byte rL = Wire.read();

    ultrasonicDistance = (uH << 8) | uL;  // cm
    radarStatus       = (rH << 8) | rL;   // 0 or 1

    Serial.printf("[I2C] distance=%u cm, radar=%d\n",
                  ultrasonicDistance, radarStatus);
  } else {
    Serial.println("[I2C] WARN — expected 4 bytes, got " +
                   String(Wire.available()));
  }
}

/**
 * Read battery voltage through a voltage divider.
 * Maps 11.0 V → 0 %, 12.6 V → 100 %.
 */
void readBatteryVoltage() {
  long rawADC = 0;
  for (int i = 0; i < 10; i++) {
    rawADC += analogRead(BATTERY_PIN);
    delay(10);
  }
  rawADC /= 10;

  float pinVoltage = rawADC * ADC_REF;
  batteryVoltage   = pinVoltage * ((R1 + R2) / R2);
  batteryPercent   = (int)((batteryVoltage - 11.0) / (12.6 - 11.0) * 100.0);
  batteryPercent   = constrain(batteryPercent, 0, 100);

  Serial.printf("[BAT] ADC=%ld  Vbat=%.2fV  %d%%\n",
                rawADC, batteryVoltage, batteryPercent);
}

// =============================================================
//                     GSM / GPRS
// =============================================================

/** Full GSM + GPRS initialisation sequence. */
void initGSM() {
  Serial.println("[GSM] Initialising...");

  sendATCommand("AT",                                  1000);
  sendATCommand("ATE0",                                500);   // echo off
  sendATCommand("AT+CFUN=1",                           2000);
  sendATCommand("AT+CPIN?",                            1000);
  sendATCommand("AT+CSQ",                              1000);  // signal quality
  sendATCommand("AT+CREG?",                            1000);  // network reg

  // GPRS bearer
  sendATCommand("AT+SAPBR=3,1,\"CONTYPE\",\"GPRS\"",  2000);
  sendATCommand("AT+SAPBR=3,1,\"APN\",\"internet\"",  2000);  // change APN if needed
  sendATCommand("AT+SAPBR=1,1",                        5000);  // open bearer
  delay(2000);
  sendATCommand("AT+SAPBR=2,1",                        2000);  // query IP

  // NOTE: AT+HTTPSSL must be called inside an HTTP session (after HTTPINIT).
  // It is set in httpPost() — do NOT call it here.

  Serial.println("[GSM] Init complete");
}

/** Quick check — reopen GPRS bearer if it dropped. */
void ensureGPRS() {
  Serial.println("[GSM] Checking GPRS...");
  String resp = sendATCommandGetResponse("AT+SAPBR=2,1", 2000);
  if (resp.indexOf("0.0.0.0") >= 0 || resp.indexOf("ERROR") >= 0) {
    Serial.println("[GSM] Bearer down — reopening");
    sendATCommand("AT+SAPBR=1,1", 5000);
    delay(2000);
    sendATCommand("AT+SAPBR=2,1", 2000);
  }
}

// =============================================================
//                     HTTP HELPERS
// =============================================================

/**
 * Register this device with POST /api/esp32/register
 * Body:  { "canalId": "<CANAL_ID>" }
 * Header: X-ESP32-ID: <DEVICE_ID>
 */
bool registerDevice() {
  Serial.println("\n--- Registering Device ---");

  String jsonData = "{\"canalId\":\"" + String(CANAL_ID) + "\"}";
  String url = String(SERVER_URL) + "/api/esp32/register";

  int httpStatus = httpPost(url, jsonData);

  if (httpStatus == 200) {
    Serial.println("[REG] Success");
    return true;
  } else {
    Serial.printf("[REG] Failed (HTTP %d)\n", httpStatus);
    return false;
  }
}

/**
 * Send sensor data with POST /api/esp32/data
 * JSON payload:
 *   {
 *     "canalId":      "<CANAL_ID>",
 *     "distance":     <ultrasonicDistance>,   // cm — raw from sensor
 *     "radarStatus":  <radarStatus>,
 *     "batteryLevel": <batteryPercent>
 *   }
 *
 * The backend converts distance → depth using the canal's depthOffset,
 * then calculates flow via Manning's equation.
 */
void sendDataToServer() {
  sendCount++;
  Serial.printf("\n--- Sending Reading #%d ---\n", sendCount);

  // Build JSON
  String jsonData = "{";
  jsonData += "\"canalId\":\"" + String(CANAL_ID) + "\",";
  jsonData += "\"distance\":" + String(ultrasonicDistance) + ",";
  jsonData += "\"radarStatus\":" + String(radarStatus) + ",";
  jsonData += "\"batteryLevel\":" + String(batteryPercent);
  jsonData += "}";

  String url = String(SERVER_URL) + "/api/esp32/data";

  Serial.println("[DATA] " + jsonData);
  int httpStatus = httpPost(url, jsonData);

  if (httpStatus == 200) {
    Serial.printf("[DATA] OK — reading #%d sent\n", sendCount);
  } else {
    Serial.printf("[DATA] Error (HTTP %d)\n", httpStatus);
  }
}

/**
 * Silently terminate any stale HTTP session.
 * Ignores ERROR — this is intentional cleanup before a fresh session.
 */
void httpForceTerminate() {
  SerialGSM.println("AT+HTTPTERM");
  delay(1000);
  // Drain response silently
  while (SerialGSM.available()) SerialGSM.read();
}

/**
 * Perform an HTTP POST via SIM800L AT commands.
 * Returns the HTTP status code (e.g. 200), or -1 on error.
 */
int httpPost(String url, String jsonBody) {
  // 1. Silently kill any leftover HTTP session
  httpForceTerminate();
  delay(300);

  // 2. Start a new HTTP session — abort if it fails
  String initResp = sendATCommandGetResponse("AT+HTTPINIT", 2000);
  if (initResp.indexOf("ERROR") >= 0) {
    Serial.println("[HTTP] HTTPINIT failed — aborting");
    return -1;
  }
  delay(300);

  // 3. Set bearer profile
  sendATCommand("AT+HTTPPARA=\"CID\",1", 1000);
  delay(200);

  // 4. Enable SSL (Render.com requires HTTPS)
  //    Must be called INSIDE the HTTP session (after HTTPINIT)
  sendATCommand("AT+HTTPSSL=1", 1000);
  delay(200);

  // 5. Set URL
  String urlCmd = "AT+HTTPPARA=\"URL\",\"" + url + "\"";
  sendATCommand(urlCmd, 2000);
  delay(200);

  // 6. Set Content-Type
  sendATCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 1000);
  delay(200);

  // 7. Custom header: X-ESP32-ID
  String hdrCmd = "AT+HTTPPARA=\"USERDATA\",\"X-ESP32-ID: " +
                  String(DEVICE_ID) + "\"";
  sendATCommand(hdrCmd, 1000);
  delay(200);

  // 8. Tell SIM800L we want to upload <length> bytes (10 s timeout)
  String dataCmd = "AT+HTTPDATA=" + String(jsonBody.length()) + ",10000";
  String dataResp = sendATCommandGetResponse(dataCmd, 3000);

  // Wait for the "DOWNLOAD" prompt before writing the body
  if (dataResp.indexOf("DOWNLOAD") < 0) {
    Serial.println("[HTTP] No DOWNLOAD prompt — aborting");
    sendATCommand("AT+HTTPTERM", 1000);
    return -1;
  }

  // 9. Send JSON body
  SerialGSM.print(jsonBody);
  delay(2000);   // give time for the module to accept the data

  // 10. Execute POST — use 15 s timeout (SSL handshake is slow)
  String actionResp = sendATCommandGetResponse("AT+HTTPACTION=1", 15000);
  delay(1000);

  // 11. Parse HTTP status from  +HTTPACTION: 1,<status>,<datalen>
  int httpStatus = parseHTTPStatus(actionResp);

  // 12. Read response body (debug)
  if (httpStatus > 0) {
    sendATCommand("AT+HTTPREAD", 2000);
    delay(300);
  }

  // 13. Always terminate the HTTP session
  sendATCommand("AT+HTTPTERM", 1000);
  delay(300);

  return httpStatus;
}

/**
 * Parse the HTTP status code from a +HTTPACTION response.
 *   e.g.  +HTTPACTION: 1,200,123  →  200
 */
int parseHTTPStatus(String response) {
  int idx = response.indexOf("+HTTPACTION:");
  if (idx < 0) return -1;

  int firstComma  = response.indexOf(',', idx);
  int secondComma = response.indexOf(',', firstComma + 1);
  if (firstComma < 0 || secondComma < 0) return -1;

  String code = response.substring(firstComma + 1, secondComma);
  code.trim();
  return code.toInt();
}

// =============================================================
//                     AT COMMAND HELPERS
// =============================================================

/** Send an AT command and print its response (fire-and-forget). */
void sendATCommand(String command, int timeout) {
  Serial.print(">> ");
  Serial.println(command);
  SerialGSM.println(command);

  unsigned long start = millis();
  while (millis() - start < (unsigned long)timeout) {
    while (SerialGSM.available()) {
      Serial.write(SerialGSM.read());
    }
  }
  Serial.println();
}

/** Send an AT command and return the full response as a String. */
String sendATCommandGetResponse(String command, int timeout) {
  Serial.print(">> ");
  Serial.println(command);
  SerialGSM.println(command);

  String response = "";
  unsigned long start = millis();
  while (millis() - start < (unsigned long)timeout) {
    while (SerialGSM.available()) {
      char c = SerialGSM.read();
      Serial.write(c);
      response += c;
    }
  }
  Serial.println();
  return response;
}
