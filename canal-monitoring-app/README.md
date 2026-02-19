# Canal Monitoring App — Agent Reference README

This document is written for other agents and maintainers to understand, navigate, and extend the Canal Monitoring App. It describes the project idea, repository layout, each file's purpose (especially backend), runtime behavior, APIs, data flow, developer workflows, and operational notes.

---

## Project Overview

- Purpose: real-time monitoring of irrigation/drainage/water-supply canals using ESP32 devices that push telemetry to an Express backend and a Next.js frontend dashboard. The backend buffers incoming readings in-memory for resilience and periodically flushes them to MongoDB.
- Key features:
  - ESP32 data ingestion endpoint with validation and device registration
  - In-memory buffering + periodic bulk flush to MongoDB for performance
  - Canal management (CRUD)
  - Dashboard endpoints for live metrics, time-series and alerts
  - Simulation scripts and database initializer for local development

---

## Quick Start

Prerequisites: Node 18+, MongoDB (local or cloud), Git.

1. Install root/frontend deps (Next.js app):

```bash
# from repo root
npm install
```

2. Backend setup & start (backend runs on :3001 by default):

```bash
cd backend
npm install
# initialize DB with sample canals and readings
npm run init-db
# run in dev mode
npm run dev
```

3. Frontend (default Next app):

```bash
# from repo root
npm run dev
```

4. Simulate an ESP32 sending data (optional):

```bash
cd backend
npm run simulate
```

---

## Repository Structure (high-level)

The workspace contains two main areas: Next.js frontend under `src/` and the backend API under `backend/`.

- components.json
- eslint.config.mjs
- next.config.ts
- package.json
- src/ — Next.js frontend (app router)
  - app/ — pages and dashboard routes
  - components/ — UI components used in the frontend
  - data/, lib/, types/ — frontend data and utilities
- backend/ — Express API and server
  - server.js
  - package.json
  - models/
    - Canal.js
    - CanalReading.js
  - routes/
    - esp32.js
    - canals.js
    - dashboard.js
  - lib/
    - dataBuffer.js
  - scripts/
    - init-database.js
    - simulate-esp32.js
  - test/

---

## File-by-file (backend) — purpose & behavior

Note: all paths below are relative to the repository root.

- `backend/server.js` — main Express app. Responsibilities:
  - loads environment via `dotenv` and connects to MongoDB with Mongoose
  - sets up security middleware (`helmet`, `cors`) and logging (`morgan`)
  - configures two rate-limiters: one specific to `/api/esp32` (per-device throttling) and a general one for `/api`
  - mounts routes: `/api/esp32`, `/api/canals`, `/api/dashboard`
  - starts the `dataBuffer` flush timer and performs graceful shutdown by calling `dataBuffer.stopAndFlush()` to ensure no readings are lost
  - exposes `/health` and root endpoints for service checks

- `backend/routes/esp32.js` — ingestion and device endpoints. Key behavior:
  - `POST /api/esp32/data` — main ingestion endpoint for ESP32 devices. Validates payload heavily using `express-validator`, ensures `canalId` exists and device association is authorized, then pushes a reading object into the in-memory `dataBuffer` (no immediate DB write). Responds with buffer stats and optional alerts.
  - `POST /api/esp32/register` — registers an ESP32 device to a canal by setting `canal.esp32DeviceId`.
  - `GET /api/esp32/latest/:canalId` and `GET /api/esp32/latest` — read most recent reading(s) from memory (fast path for UI)
  - `POST /api/esp32/flush` — manual flush trigger that calls `dataBuffer.flush()`
  - `GET /api/esp32/config/:deviceId` — returns device configuration (e.g., updateInterval, thresholds)

- `backend/routes/canals.js` — canal management and reading retrieval:
  - `GET /api/canals` — list/filter canals (pagination supported)
  - `GET /api/canals/:canalId` — get canal detail + latest reading
  - `POST /api/canals` — create a canal (validates `canalId`, name, location)
  - `PUT /api/canals/:canalId` — update canal metadata
  - `DELETE /api/canals/:canalId` — soft-delete (sets `isActive=false`)
  - `GET /api/canals/:canalId/readings` — fetch historical readings (supports pagination, time range, and status filtering)
  - `GET /api/canals/nearby/:longitude/:latitude` — geospatial lookup using the geospatial index

- `backend/routes/dashboard.js` — endpoints tailored for the frontend dashboard:
  - `/api/dashboard/overview` — high-level KPIs (total canals, active/offline count, alert counts)
  - `/api/dashboard/metrics` — live metrics read from `dataBuffer` (fast, memory-based)
  - `/api/dashboard/timeseries/:canalId` — aggregated time-series using MongoDB aggregation (interval grouping: minute/hour/day)
  - `/api/dashboard/alerts` — recent alerts (aggregated & flattened)
  - `/api/dashboard/stats` — system statistics (readings counts, averages)

- `backend/models/Canal.js` — Mongoose schema for canals:
  - fields: `canalId` (unique index), `name`, `type` (enum), `location` (GeoJSON Point, 2dsphere index), `esp32DeviceId` (sparse unique), `isActive`, timestamps
  - static methods: `findByDeviceId`, `findNearby(long, lat, maxDistance)`

- `backend/models/CanalReading.js` — Mongoose schema for telemetry readings:
  - fields include `canalId`, `esp32DeviceId`, `status` (enum), `flowRate`, `speed`, `discharge`, `waterLevel`, `temperature`, `pH`, `turbidity`, `batteryLevel`, `signalStrength`, `gpsCoordinates`, `errors`, `metadata`, `timestamp`, `receivedAt`
  - many indexes: compound indexes (`canalId, timestamp`), `esp32DeviceId`, `status`, and a TTL index on `timestamp` to optionally expire old readings (configured to 30 days in the schema)
  - virtual `dataQuality` and instance helpers `isRecentReading()`, `hasAlert()`
  - pre-save hook to normalize `status` from flowRate if not provided

- `backend/lib/dataBuffer.js` — in-memory buffer & flush mechanism (core of ingestion reliability):
  - maintains a Map per `canalId` with `latest` and `buffer` arrays
  - `push(canalId, reading)` updates `latest` and enqueues reading into buffer array
  - `getLatest`, `getAll`, `getBuffer`, `getBufferStats` provide read-only accessors used by routes
  - `flush()` performs `CanalReading.insertMany(allReadings, { ordered: false })` for efficient bulk writes, clears buffers after success/partial success, and returns counts
  - `startFlushTimer()` starts a periodic timer with interval `ESP32_BUFFER_FLUSH_INTERVAL` environment variable (default 600s)
  - `stopAndFlush()` is used on graceful shutdown to ensure buffered readings are persisted

- `backend/scripts/init-database.js` — creates sample canals and populates sample historical + recent readings for local dev. Useful for seeding and simulating real data.

- `backend/scripts/simulate-esp32.js` — simulator to POST sample payloads to `POST /api/esp32/data` (see script for options). Helpful for load testing and debugging.

- `backend/package.json` — scripts and dependencies. Notable scripts: `dev` (nodemon), `init-db`, `simulate`, `simulate:canoli` presets.

---

## Environment Variables

Create a `.env` in `backend/` (or set env vars in your container/orchestration). Key variables used:

- `MONGODB_URI` — MongoDB connection string
- `PORT` — backend port (default 3001)
- `FRONTEND_URL` — allowed CORS origin for the frontend
- `NODE_ENV` — `development` or `production`
- `ESP32_BUFFER_FLUSH_INTERVAL` — seconds between automatic flushes (default 600)

Security/operational notes:
- Keep `MONGODB_URI` secret (use secrets manager in production)
- Rate-limiting is configured in `server.js` for basic DDoS protection

---

## API Reference (essential)

All API endpoints are prefixed by `/api` (except `/health`). Responses are JSON.

1) POST /api/esp32/data
- Purpose: ingest telemetry from ESP32
- Headers: `X-ESP32-ID: <deviceId>` (recommended) or include `deviceId` in body
- Body (JSON summary — all fields validated):

```json
{
  "canalId": "peechi-canal",
  "status": "FLOWING",
  "flowRate": 14.2,
  "speed": 1.8,
  "discharge": 520,
  "waterLevel": 1.5,
  "temperature": 25.1,
  "pH": 7.1,
  "batteryLevel": 92,
  "signalStrength": -60,
  "gpsCoordinates": { "latitude": 10.53, "longitude": 76.28 },
  "metadata": { "firmwareVersion": "1.0.3" }
}
```

- Behavior: validates, checks canal & device auth, pushes to `dataBuffer`, returns buffer stats and possible alerts. Does NOT write directly to DB.

2) GET /api/esp32/latest/:canalId
- Returns the latest reading for a canal from memory (fast).

3) POST /api/esp32/flush
- Trigger immediate flush of buffers to MongoDB.

4) POST /api/esp32/register
- Register a device to a canal (associates `esp32DeviceId` to a canal doc).

5) GET /api/canals
- List canals (supports filters `active`, `type`, pagination)

6) GET /api/canals/:canalId/readings
- Fetch historical readings from MongoDB (supports `limit`, `page`, `startDate`, `endDate`, `status`)

7) GET /api/dashboard/metrics
- Live metrics read from memory buffer and enriched with canal info.

8) GET /health
- Basic healthcheck with version, uptime, environment

---

## Data Flow & Reliability (how ingestion works)

1. ESP32 POSTs JSON payload to `/api/esp32/data` with `X-ESP32-ID` header.
2. Server validates payload and checks `Canal` existence and device authorization.
3. Server creates a plain reading object and calls `dataBuffer.push(canalId, reading)` — this updates `latest` and appends the reading to the in-memory buffer.
4. Every `ESP32_BUFFER_FLUSH_INTERVAL` seconds the server bulk-inserts buffered readings into MongoDB using `insertMany` for efficiency and clears buffers. On graceful shutdown the server calls `stopAndFlush()` to attempt a final persist.

Design tradeoffs:
- In-memory buffering reduces write amplification and improves throughput but risks data loss if process crashes before flush; mitigate with frequent flushes and graceful shutdown handlers (already implemented).
- `insertMany(..., ordered:false)` improves resilience by continuing on duplicates.

---

## Indexes, TTL and Retention

- `CanalReading` schema defines multiple indexes for efficient queries: `canalId + timestamp`, `esp32DeviceId + timestamp`, `status + timestamp`, and a TTL index that expires readings after 30 days by default. Agents modifying retention must update the TTL index in `CanalReading.js`.

---

## Operational & Security Notes

- Rate limiting: `esp32RateLimit` is stricter (100 req/min/device) to avoid noisy devices; adjust in `server.js`.
- CORS configured with `FRONTEND_URL` environment variable.
- Use HTTPS and reverse proxy in production; ensure `X-Forwarded-*` headers are trusted as needed.

---

## How other agents should work with this repo

- To add a new backend endpoint:
  1. Add route logic to an existing `routes/*.js` or create a new route file and mount it in `server.js`.
  2. Add tests to `backend/test/` (the repo has `test/api-test.js`) and update `package.json` scripts if needed.
  3. If the change affects DB models, update `models/*.js` and include migration steps (manual or scripted) if necessary.

- To change ingestion behavior (buffer/flush): modify `backend/lib/dataBuffer.js`. Pay attention to `FLUSH_INTERVAL_MS` and how `flush()` clears buffers.

- To simulate load or validate behavior: use `backend/scripts/simulate-esp32.js` or update it to spawn multiple simulated devices.

- For agents that automate deployments: ensure env vars are injected, persistent MongoDB is used, and the process manager properly handles SIGINT/SIGTERM so `stopAndFlush()` runs.

---

## Troubleshooting & Common Tasks

- If `/api/esp32/data` returns 404 for `canalId`: verify the `canalId` exists in DB; run `npm run init-db` to seed sample canals.
- If readings are not appearing in DB: check `dataBuffer.getBufferStats()` at `/api/esp32/buffer-stats` and manually call `/api/esp32/flush`.
- If Mongo connection fails: check `MONGODB_URI` and network reachability.

---

## Suggested Next Improvements (for agents)

- Persist queued buffer to local disk (or Redis) as a fallback to survive process crashes between flushes.
- Add authentication & API keys for admin endpoints (canal creation, device registration).
- Add end-to-end tests that assert readings flow from simulator → buffer → DB and surface in the frontend.
- Add metrics and monitoring (Prometheus, logs) around flush durations and insertion errors.

---

## Where to find things

- Server entry: [backend/server.js](backend/server.js)
- Ingestion & device routes: [backend/routes/esp32.js](backend/routes/esp32.js)
- Canal management: [backend/routes/canals.js](backend/routes/canals.js)
- Dashboard metrics: [backend/routes/dashboard.js](backend/routes/dashboard.js)
- Buffer & flush logic: [backend/lib/dataBuffer.js](backend/lib/dataBuffer.js)
- Data model: [backend/models/Canal.js](backend/models/Canal.js) and [backend/models/CanalReading.js](backend/models/CanalReading.js)
- DB seeding: [backend/scripts/init-database.js](backend/scripts/init-database.js)

---

If you'd like, I can:
- expand the README with a formal OpenAPI spec for the backend
- add example Postman/HTTPie collection or automated tests
- add a Dockerfile and Docker Compose for local dev with MongoDB

Tell me which of these you'd like next.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
