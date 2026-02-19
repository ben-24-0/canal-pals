# Canal Monitoring API Backend

A secure REST API for receiving and managing canal monitoring data from ESP32 devices.

## 🚀 Features

- **Secure ESP32 Data Reception**: Secure endpoints with validation and rate limiting
- **MongoDB Integration**: Scalable data storage with time-series optimization
- **Real-time Monitoring**: Live canal status and metrics
- **Dashboard APIs**: Comprehensive data aggregation for dashboards
- **Geospatial Queries**: Location-based canal discovery
- **Alert System**: Automated alerts for canal anomalies
- **Production Ready**: Optimized for Render deployment

## 📊 API Endpoints

### ESP32 Endpoints

```http
POST /api/esp32/data          # Receive canal data from ESP32
GET  /api/esp32/status        # ESP32 health check
POST /api/esp32/register      # Register new ESP32 device
GET  /api/esp32/config/:id    # Get configuration for ESP32
```

### Canal Management

```http
GET    /api/canals                    # List all canals
GET    /api/canals/:id               # Get specific canal
POST   /api/canals                   # Create new canal
PUT    /api/canals/:id               # Update canal
DELETE /api/canals/:id               # Deactivate canal
GET    /api/canals/:id/readings      # Get canal readings
GET    /api/canals/nearby/:lng/:lat  # Find nearby canals
```

### Dashboard APIs

```http
GET /api/dashboard/overview      # System overview
GET /api/dashboard/metrics       # Current metrics
GET /api/dashboard/timeseries/:id # Time series data
GET /api/dashboard/alerts        # Active alerts
GET /api/dashboard/stats         # System statistics
```

### System

```http
GET /health                      # API health check
GET /                           # API information
```

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 18+
- MongoDB 4.4+
- npm or yarn

### Local Development Setup

1. **Clone and navigate to backend**

   ```bash
   cd backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Setup environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your settings:

   ```env
   MONGODB_URI=mongodb://localhost:27017/canal-monitoring
   FRONTEND_URL=http://localhost:3000
   PORT=3001
   ```

4. **Start MongoDB** (if running locally)

   ```bash
   # Using MongoDB Community
   mongod --dbpath /path/to/your/db

   # Or using Docker
   docker run --name mongodb -p 27017:27017 -d mongo:latest
   ```

5. **Initialize database with sample data**

   ```bash
   node scripts/init-database.js
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

### 📱 ESP32 Configuration

Your ESP32 should send data in this format:

**Endpoint**: `POST /api/esp32/data`

**Headers**:

```http
Content-Type: application/json
X-ESP32-ID: ESP32_UNIQUE_DEVICE_ID
```

**Sample JSON Payload**:

```json
{
  "canalId": "peechi-canal",
  "status": "FLOWING",
  "flowRate": 14.2,
  "speed": 1.8,
  "discharge": 520,
  "waterLevel": 1.5,
  "temperature": 25.3,
  "pH": 7.2,
  "batteryLevel": 85,
  "signalStrength": -65,
  "gpsCoordinates": {
    "latitude": 10.535959,
    "longitude": 76.280492
  },
  "timestamp": "2024-01-20T10:30:00Z"
}
```

**Required Fields**: `canalId`, `status`, `flowRate`, `speed`, `discharge`

**Status Values**: `FLOWING`, `STOPPED`, `LOW_FLOW`, `HIGH_FLOW`, `BLOCKED`, `ERROR`

## 🚀 Deployment on Render

### 1. Prepare for Deployment

1. **Create a MongoDB Atlas cluster** (recommended) or use Render's MongoDB
   - Go to [MongoDB Atlas](https://cloud.mongodb.com/)
   - Create free cluster
   - Get connection string

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Canal monitoring API backend"
   git push origin main
   ```

### 2. Deploy on Render

1. **Create Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Choose the `backend` folder as root directory

2. **Configure Build Settings**

   ```yaml
   Build Command: npm install
   Start Command: npm start
   ```

3. **Set Environment Variables**

   ```env
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/canal-monitoring
   FRONTEND_URL=https://your-frontend-domain.com
   PORT=10000
   ```

4. **Deploy**: Click "Create Web Service"

### 3. Initialize Production Database

After deployment, initialize your database:

```bash
# Clone and setup locally, then run with production MONGODB_URI
NODE_ENV=production MONGODB_URI=your-production-uri node scripts/init-database.js
```

### 4. Test Your Deployment

```bash
# Health check
curl https://your-api-url.onrender.com/health

# Get canals
curl https://your-api-url.onrender.com/api/canals

# Test ESP32 endpoint
curl -X POST https://your-api-url.onrender.com/api/esp32/data \
  -H "Content-Type: application/json" \
  -H "X-ESP32-ID: ESP32_TEST_001" \
  -d '{
    "canalId": "peechi-canal",
    "status": "FLOWING",
    "flowRate": 14.2,
    "speed": 1.8,
    "discharge": 520
  }'
```

## 🔧 ESP32 Arduino Code Template

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* apiUrl = "https://your-api-url.onrender.com/api/esp32/data";
const char* deviceId = "ESP32_PEECHI_CANAL_001";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");
}

void sendCanalData(float flowRate, float speed, float discharge, String status) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(apiUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-ESP32-ID", deviceId);

    StaticJsonDocument<300> doc;
    doc["canalId"] = "peechi-canal";
    doc["status"] = status;
    doc["flowRate"] = flowRate;
    doc["speed"] = speed;
    doc["discharge"] = discharge;
    doc["batteryLevel"] = getBatteryLevel();
    doc["signalStrength"] = WiFi.RSSI();
    doc["timestamp"] = getISOTimestamp();

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Data sent successfully");
      Serial.println(response);
    } else {
      Serial.println("Error sending data");
      Serial.println(httpResponseCode);
    }

    http.end();
  }
}

void loop() {
  // Read sensor data
  float flowRate = readFlowRate();
  float speed = readSpeed();
  float discharge = calculateDischarge(flowRate, speed);
  String status = determineStatus(flowRate);

  // Send data every 5 minutes
  sendCanalData(flowRate, speed, discharge, status);
  delay(300000); // 5 minutes
}
```

## 🔒 Security Features

- **Rate Limiting**: Prevents spam and DDoS attacks
- **CORS Protection**: Restricts cross-origin requests
- **Input Validation**: All inputs are validated and sanitized
- **Device Authentication**: ESP32 devices require registration
- **Error Handling**: Secure error messages in production
- **Helmet.js**: Security headers for production

## 📈 Data Models

### Canal Schema

```javascript
{
  canalId: String (unique),
  name: String,
  type: String, // irrigation, drainage, water-supply
  location: { type: Point, coordinates: [lng, lat] },
  esp32DeviceId: String (unique),
  isActive: Boolean,
  description: String,
  capacity: Number
}
```

### Canal Reading Schema

```javascript
{
  canalId: String,
  esp32DeviceId: String,
  status: String, // FLOWING, STOPPED, etc.
  flowRate: Number,
  speed: Number,
  discharge: Number,
  waterLevel: Number,
  temperature: Number,
  pH: Number,
  batteryLevel: Number,
  signalStrength: Number,
  gpsCoordinates: { latitude: Number, longitude: Number },
  timestamp: Date,
  receivedAt: Date
}
```

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**

   ```bash
   # Check connection string
   # Ensure network access in MongoDB Atlas
   # Verify credentials
   ```

2. **ESP32 Can't Send Data**

   ```bash
   # Check device ID registration
   # Verify JSON format
   # Check network connectivity
   # Verify API URL
   ```

3. **Rate Limiting Issues**

   ```bash
   # Increase rate limits in environment variables
   # Check if ESP32 is sending too frequently
   ```

4. **CORS Errors**
   ```bash
   # Update FRONTEND_URL environment variable
   # Check origin in browser network tab
   ```

## 📞 Support

For issues or questions:

1. Check the logs: `docker logs container-id` or Render logs
2. Validate your JSON payload with online JSON validators
3. Check network connectivity between ESP32 and API
4. Verify environment variables are set correctly

## 🔄 Updates & Maintenance

- **Database Cleanup**: Old readings are automatically deleted after 30 days
- **Monitoring**: Use `/health` endpoint for uptime monitoring
- **Scaling**: Render auto-scales based on traffic
- **Backup**: Regular MongoDB backups recommended

---

🎯 **Your API is now ready to receive real data from ESP32 devices!**
