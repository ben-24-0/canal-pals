# Canal Monitoring App — Full Revamp Agent Plan

This document is the single source of truth for the complete revamp of the Canal Monitoring App. Any agent working on this must read this document fully before making any changes. All decisions, architecture choices, data shapes, and implementation order are defined here.

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Tech Stack (unchanged)](#2-tech-stack)
3. [Authentication System](#3-authentication-system)
4. [Routing & Page Map](#4-routing--page-map)
5. [Pre-Login Landing Page](#5-pre-login-landing-page)
6. [Post-Login Layout & Sidebar](#6-post-login-layout--sidebar)
7. [Canal Module Cards Hub (Home after login)](#7-canal-module-cards-hub)
8. [Favourites & Search System](#8-favourites--search-system)
9. [Admin: Adding a New Canal Module](#9-admin-adding-a-new-canal-module)
10. [Manning's Equation — Full Spec](#10-mannings-equation--full-spec)
11. [User Dashboard (per canal)](#11-user-dashboard-per-canal)
12. [Admin Dashboard (per canal)](#12-admin-dashboard-per-canal)
13. [Map Page](#13-map-page)
14. [Backend Revamp](#14-backend-revamp)
15. [Database Schema Changes](#15-database-schema-changes)
16. [API Reference (new/changed)](#16-api-reference-newchanged)
17. [Environment Variables](#17-environment-variables)
18. [Implementation Order for Agents](#18-implementation-order-for-agents)
19. [Agent Suggestions & Additions](#19-agent-suggestions--additions)

---

## 1. Project Vision

The Canal Monitoring App is an IoT-based real-time canal water monitoring system. ESP32 microcontrollers equipped with either **ultrasonic depth sensors** or **radar sensors** are physically deployed at canals. They send water depth (or flow rate in the case of radar) to this backend. The backend computes flow rate using the **Manning's Equation** for ultrasonic modules and serves calculated metrics to the frontend.

The frontend provides:
- A **public landing page** (no login required) that explains the system.
- A **user dashboard** for logged-in observers to see canal metrics and charts.
- An **admin dashboard** for administrators to register new canal modules, edit Manning's constants, and access deeper analytics.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express.js |
| Database | MongoDB with Mongoose |
| Auth | NextAuth.js (credentials provider) — or a custom JWT approach using Jose/jsonwebtoken |
| Maps | Mapbox GL JS (via `react-map-gl`) — already integrated |
| Charts | Recharts (already integrated) |
| IoT Device | ESP32 (ultrasonic or radar sensor) |

> NOTE: For authentication, use **NextAuth.js v5 (Auth.js)** with a `credentials` provider backed by MongoDB users. Both `NEXTAUTH_SECRET` and `NEXTAUTH_URL` must be set in `.env.local`.

UI Guidelines (important):

- Use `shadcn/ui` components as the standard component library for a professional, consistent look and accessible defaults. Prefer shadcn primitives (Buttons, Cards, Dialogs, Inputs, Tabs) and extend them with project-specific styles only when necessary.
- Implement light and dark themes with Tailwind's `dark` strategy and a global theme toggle persisted in `localStorage` and reflected via a React context/provider (`ThemeProvider`). Ensure contrast and accessibility in both modes.
- Preserve the current site color palette exactly — do not change primary/secondary colors. Create Tailwind CSS variables that reference the existing palette to keep styles consistent across components and themes.
- Keep visual consistency by using shadcn design tokens, spacing, and typography scale; avoid ad-hoc CSS unless required for specific UI needs.

---

## 3. Authentication System

### 3.1 User Roles

| Role | Permissions |
|---|---|
| `user` | View all canal dashboards, charts, favourites |
| `admin` | Everything above + register canal modules, edit Manning's constants, edit location, delete modules |

### 3.2 Seeded Credentials (dev/demo)

Store hashed passwords in MongoDB in a `users` collection via the init script.

```
admin@canal.io  /  admin123   → role: admin
user@canal.io   /  user123    → role: user
```

> Do NOT store plain text passwords. Use `bcrypt` with salt rounds = 10.

### 3.3 Auth Flow

1. User visits `/` — sees landing page (public, no auth required).
2. User clicks **Login** button in Navbar → goes to `/login`.
3. Login page has email + password fields. Uses NextAuth credentials provider.
4. On success:
   - `admin` role → redirect to `/app` (admin hub).
   - `user` role → redirect to `/app` (user hub, same route but different UI elements visible).
5. Session is stored as a JWT cookie.
6. Any `/app/*` route must be protected — unauthenticated users redirect to `/login`.
7. Logout clears the session and redirects to `/`.

### 3.4 Session Shape

```ts
// session.user shape (extend NextAuth default)
{
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
}
```

### 3.5 Middleware

Create `middleware.ts` at the root. Protect all routes under `/app/*`. Public routes: `/`, `/login`.

```ts
// middleware.ts (pseudocode)
export { auth as middleware } from "@/auth"
export const config = { matcher: ["/app/:path*"] }
```

### 3.6 Files to create

```
src/auth.ts                   — NextAuth config
src/app/login/page.tsx        — Login UI
src/app/api/auth/[...nextauth]/route.ts — Auth route handler
src/middleware.ts             — Route protection
backend/models/User.js        — User Mongoose model
backend/scripts/init-database.js — UPDATED to seed users
```

---

## 4. Routing & Page Map

```
/                          → Public landing page (pre-login)
/login                     → Login page

/app                       → Canal Modules Hub (post-login home)
/app/map                   → Full map of all canal modules
/app/canal/[canalId]       → Canal dashboard (user view)
/app/admin/canal/[canalId] → Canal dashboard (admin view — admin only)
/app/admin/add-module      → Add new canal module (admin only)
```

> The sidebar is rendered inside a shared layout file `src/app/app/layout.tsx` which wraps all `/app/*` pages.

---

## 5. Pre-Login Landing Page

**Route:** `/` (existing `src/app/page.tsx`) — keep this largely as-is.

### Required sections (top to bottom):

1. **Navbar** — updated to show "Login" button. If already logged in, show "Go to Dashboard" button.
2. **Hero / Map Section** — the existing `HomeCanalMap` component showing marked canal locations. Keep this.
3. **What Is This Website** — existing `WhatIsWebsite` component. Keep.
4. **Our Solution** — existing `OurSolution` component. Keep.
5. **Canal Images Gallery** — NEW section. A simple responsive grid of 3–4 canal photos (use placeholder images for now, easy to replace). Add a `src/components/CanalGallery.tsx` component.
6. **How It Works** — NEW section. Brief 3-step explainer: (1) ESP32 measures depth, (2) Backend calculates flow, (3) Dashboard shows live metrics. Use icon cards.
7. **Footer** — existing footer. Keep.

> No login gate. The entire page is publicly accessible. Do NOT redirect to `/app` automatically from here.

---

## 6. Post-Login Layout & Sidebar

**File:** `src/app/app/layout.tsx`

This layout wraps all post-login pages. It provides:

### 6.1 Sidebar

A left sidebar (collapsible on mobile). Items:

| Icon | Label | Route | Visibility |
|---|---|---|---|
| Home | Canal Modules | `/app` | All |
| Map | Map View | `/app/map` | All |
| Star | Favourites | `/app` (filtered to favourites) | All |
| Settings | Add Module | `/app/admin/add-module` | Admin only |
| User | Profile / Logout | — | All |

The sidebar must read session role and hide admin-only items for `user` role.

### 6.2 Top Bar

A top header bar with:
- App logo / name left
- **Global search bar** in the center (searches canal name or ID — see section 8)
- Notification bell (placeholder for now)
- User avatar + name, role badge (right)

### 6.3 Layout Behavior

- Sidebar is always visible on desktop (≥ 1024px).
- On mobile, sidebar is hidden behind a hamburger toggle.
- Main content fills remaining width.

---

## 7. Canal Module Cards Hub

**Route:** `/app`  
**File:** `src/app/app/page.tsx`

This is the first page a user sees after login. It replaces the current dashboard list.

### 7.1 Page Structure

1. **Favourited Modules strip** — horizontally scrollable row at the top. Shows only modules the current user has starred/favourited. If none, shows a "Star a canal to favourite it" hint.
2. **All Canal Modules grid** — card grid (3 columns desktop, 2 tablet, 1 mobile). Each card is a `CanalModuleCard` component.
3. **Search bar** above the grid (synced with global top-bar search).

### 7.2 CanalModuleCard Component

**File:** `src/components/canal/CanalModuleCard.tsx`

Each card displays:

```
┌─────────────────────────────┐
│ [●] ACTIVE  /  [○] OFFLINE   │ ← colour-coded indicator
│                              │
│  Peechi Irrigation Canal     │ ← canal name
│  ID: peechi-canal            │ ← canal ID (small)
│                              │
│  Flow Rate: 14.2 m³/s        │ ← calculated from Manning's
│  Depth: 1.24 m               │ ← latest raw depth from ESP32
│  Sensor: Ultrasonic          │ ← or Radar
│                              │
│  Last seen: 2 min ago        │ ← timestamp
│  [★ Favourite]  [→ View]     │ ← action buttons
└─────────────────────────────┘
```

- Active state: green indicator dot. Conditions: last reading ≤ 5 minutes ago.
- Offline state: grey indicator dot.
- "View" button navigates to:
  - `/app/admin/canal/[canalId]` for admin.
  - `/app/canal/[canalId]` for user.
- Favourite button toggles starred state (stored in `localStorage` for MVP, or in user document in DB for full implementation).
- Data is polled from `GET /api/esp32/latest` every `POLL_INTERVAL` seconds (configurable, default: 30s on frontend).

---

## 8. Favourites & Search System

### 8.1 Favourites

- A user can favourite any canal module.
- Favourited modules appear in the horizontal strip at the top of `/app`.
- Storage: `localStorage` key `favourites` (array of canalIds). Upgrade to DB later.
- A `useFavourites` custom hook (`src/hooks/useFavourites.ts`) manages this.

### 8.2 Search

- Global search bar in the top bar filters canals by name or ID substring match.
- A `useSearch` hook (`src/hooks/useSearch.ts`) holds the query string in React state (or URL search param).
- The canal hub grid, favourites strip, and map markers all react to the active search query.
- If query is empty, show all; if query present, filter.

---

## 9. Admin: Adding a New Canal Module

**Route:** `/app/admin/add-module`  
**File:** `src/app/app/admin/add-module/page.tsx`  
**Visibility:** Admin only. Redirect `user` role to `/app`.

This is a multi-step wizard form. Use a step indicator at the top (Step 1, 2, 3...).

---

### Step 1 — Device Identity & Sensor Type

| Field | Type | Notes |
|---|---|---|
| Canal Name | text | Full human-readable name |
| Canal ID | text (slug) | Auto-slugified from name. Validation: `/^[a-z0-9-]+$/`, 3–50 chars |
| ESP32 Device ID | text | The unique hardware ID you will flash/set on the ESP32. This is the `X-ESP32-ID` header value. Must be unique across all modules. |
| Sensor Type | dropdown | `ultrasonic` or `radar` |

**How the ESP32 pairing works (explain on-screen):**
> "Enter the unique device ID you will configure on your ESP32. Once registered, only readings from an ESP32 sending this exact ID in the `X-ESP32-ID` header will be accepted for this canal. If the pairing needs to change, edit the module later (admin only)."

This keeps the current backend security model intact: `canal.esp32DeviceId` is compared against the incoming `X-ESP32-ID` header in `POST /api/esp32/data`.

---

### Step 2 — Location

| Field | Type | Notes |
|---|---|---|
| Latitude | number | -90 to 90 |
| Longitude | number | -180 to 180 |
| Map picker (optional) | map click | Clicking the mini map fills lat/lon fields |

Include a small `react-map-gl` mini map where clicking a point auto-fills the lat/lon fields.

---

### Step 3 — Manning's Equation Parameters

This step only applies fully for `ultrasonic` sensor type. For `radar`, these fields are informational/optional (radar directly reports flow rate).

See [Section 10](#10-mannings-equation--full-spec) for the full equation spec.

| Field | Type | Notes |
|---|---|---|
| Channel Cross-Section Shape | dropdown | Trapezoidal, Triangular, Rectangular, Wide Flat, Circular |
| Shape-specific dimensions | (dynamic — see below) | Changes based on shape selected |
| Channel Slope S | number | Dimensionless (e.g., 0.001). Range: 0.00001 – 1.0 |
| Manning's n | dropdown + custom | Pre-filled options with labels (see Section 10). Can type a custom value. |
| Unit System | dropdown | SI (u=1.0), US Customary (u=1.486) |

**Dynamic dimension fields per shape:**

| Shape | Fields shown |
|---|---|
| Trapezoidal | Bottom width `b` (m), Side slope `z` (H:V ratio) |
| Triangular | Side slope `z` |
| Rectangular | Bottom width `b` (m) |
| Wide Flat | Bottom width `b` (m) — note: R ≈ y, valid only when b >> y |
| Circular | Pipe diameter `D` (m) |

> For all shapes: depth `y` (or `θ` for circular) is the live variable received from the ESP32 sensor at runtime. These dimension fields are fixed canal geometry parameters set once during registration.

---

### Step 4 — Review & Submit

Show a summary card of all entered data. Admin clicks "Register Module". On success:
- The new module card appears in `/app` hub.
- The canal pin appears on the map.
- Toast notification: "Canal module registered successfully."

---

## 10. Manning's Equation — Full Spec

Manning's equation:

$$Q = \frac{u}{n} \cdot A \cdot R^{2/3} \cdot S^{1/2}$$

Where:
- `Q` = volumetric flow rate (m³/s for SI, ft³/s for US)
- `u` = unit conversion factor (1.0 for SI metric, 1.486 for US customary)
- `n` = Manning's roughness coefficient (dimensionless)
- `A` = cross-sectional flow area
- `R` = hydraulic radius = A / P (where P = wetted perimeter)
- `S` = channel slope (energy grade line, dimensionless)

### 10.1 Cross-Section Formulas

These formulas are encoded in the backend in `backend/lib/mannings.js`.

| Shape | Flow Area A | Wetted Perimeter P | Hydraulic Radius R |
|---|---|---|---|
| Trapezoidal | `y(b + zy)` | `b + 2y√(1 + z²)` | `y(b + zy) / (b + 2y√(1 + z²))` |
| Triangular | `zy²` | `2y√(1 + z²)` | `zy / (2y√(1 + z²))` |
| Rectangular | `by` | `b + 2y` | `by / (b + 2y)` |
| Wide Flat | `by` | `b` | `y` |
| Circular (partial) | `(θ - sinθ) × D²/8` | `θD/2` | `(D/4) × (1 - sinθ/θ)` |

**Circular section note:** `θ` (in radians) is derived from water depth `y` and pipe diameter `D`:

$$\theta = 2 \arccos\left(1 - \frac{2y}{D}\right)$$

This forms a closed channel when `y = D`. Do not allow `y > D`.

### 10.2 Pre-defined Manning's n Dropdown Values

```
| Label                                | n value |
|--------------------------------------|---------|
| Concrete (formed, no finish)         | 0.015   |
| Concrete (float finish)              | 0.013   |
| Earth, clean and straight            | 0.022   |
| Earth, winding, weeds/pools          | 0.035   |
| Grass-lined channels                 | 0.030   |
| Natural stream, clean                | 0.030   |
| Natural stream, irregular, weeds     | 0.045   |
| Brick                                | 0.015   |
| Cast iron                            | 0.013   |
| PVC / plastic pipe                   | 0.010   |
| Riprap (coarse gravel)               | 0.035   |
| Custom (enter value below)           | —       |
```

### 10.3 Backend Calculation Location

File: `backend/lib/mannings.js`

This module exports a pure function:

```js
/**
 * Calculate flow rate using Manning's equation.
 * @param {Object} params
 * @param {string} params.shape - 'trapezoidal' | 'triangular' | 'rectangular' | 'wide-flat' | 'circular'
 * @param {number} params.depth - water depth y (meters)
 * @param {number} params.b - bottom width (trapezoidal, rectangular, wide-flat)
 * @param {number} params.z - side slope (trapezoidal, triangular)
 * @param {number} params.D - pipe diameter (circular)
 * @param {number} params.S - channel slope
 * @param {number} params.n - Manning's roughness coefficient
 * @param {number} params.u - unit conversion (1.0 SI, 1.486 US)
 * @returns {{ flowRate: number, area: number, hydraulicRadius: number, wettedPerimeter: number }}
 */
function calculateFlowRate(params) { ... }

module.exports = { calculateFlowRate };
```

This function is called in `routes/esp32.js` when a reading arrives AND when a reading is fetched via `/api/canals/:canalId/readings`.

### 10.4 Sensor Type Routing Logic

In `routes/esp32.js` within `POST /api/esp32/data`:

```
IF canal.sensorType === 'ultrasonic':
  - ESP32 sends: { depth: number } (in meters)
  - Backend calculates flowRate via calculateFlowRate(canal.manningsParams + { depth })
  - Stores both depth and calculated flowRate in the reading

IF canal.sensorType === 'radar':
  - ESP32 sends: { flowRate: number } directly (existing logic, no change)
  - Backend stores flowRate as-is from the device
  - depth field will be null/undefined
```

---

## 11. User Dashboard (per canal)

**Route:** `/app/canal/[canalId]`  
**File:** `src/app/app/canal/[canalId]/page.tsx`

### Layout (top to bottom)

---

#### 11.1 Top Info Row

Two side-by-side panels:

**Left panel — Metrics Card:**
```
Canal Name + ID
Status badge (ACTIVE / OFFLINE / HIGH_FLOW / BLOCKED)
─────────────────────────────
Flow Rate:      14.2 m³/s
Water Depth:     1.24 m
Speed:           1.8 m/s
Discharge:       520 m³/s
Temperature:    24.5 °C
pH:              7.1
Battery:         92%
Signal:         -60 dBm
─────────────────────────────
Last updated:   2 min ago
Coordinates:    10.5359, 76.2804
Sensor Type:    Ultrasonic
```

**Right panel — Mini Map:**
- `react-map-gl` map showing only this canal's marker
- Marker is colour-coded by status
- Map style toggle: Satellite / Street / Outdoors (3 buttons above the map)
- Click on marker shows a popup with name and current flow rate

---

#### 11.2 Charts Section

Use `recharts`. All charts are below the top row, in a tab group.

| Tab | Chart | Description |
|---|---|---|
| Live | `MonthlyAreaChart` (adapted) | Real-time line chart updating every poll interval. Shows flow rate last 60 minutes |
| 24h | Area chart | Average flow rate per hour over last 24h |
| Weekly | Bar chart | Average flow rate per day for last 7 days |
| Monthly | Area chart | Average per day for last 30 days |
| Year Compare | Multi-line chart | Year-on-year comparison of flow rate (same calendar months, multiple year lines) |
| Prediction | Dashed line chart | Simple mock/statistical prediction of flow based on last 30 days trend |

#### 11.3 Year-by-Year Comparison Chart

- Shows multiple lines on one Recharts `LineChart`.
- Each line = one calendar year of monthly averages.
- X-axis: Jan – Dec.
- Y-axis: avg flow rate (m³/s).
- Data from `GET /api/dashboard/timeseries/:canalId?interval=month&years=3` (new query param — see backend section).

#### 11.4 Prediction Chart

- A simple extrapolation (linear or moving average) based on last 30 days of daily averages.
- Show dashed line for predicted 7 days ahead.
- Add a disclaimer label: "Indicative prediction only".
- Calculation done in frontend utility `src/lib/prediction.ts`.

#### 11.5 Additional Impression Features (for guests)

- **Alert timeline** — vertical timeline of recent alerts (HIGH_FLOW, BLOCKED, LOW_BATTERY events) with timestamps.
- **Health score gauge** — circular gauge (existing `CircularGauge.tsx`) showing a 0–100 score based on: status (40%), battery (30%), signal (30%).
- **Stats row** — 4 stat cards below charts: Total Readings Today, Peak Flow Rate (24h), Avg Flow Rate (24h), Uptime %.

---

## 12. Admin Dashboard (per canal)

**Route:** `/app/admin/canal/[canalId]`  
**File:** `src/app/app/admin/canal/[canalId]/page.tsx`

### Inherits everything from the User Dashboard (Section 11), PLUS:

---

#### 12.1 Manning's Parameters Panel

A collapsible card below the top info row.

```
Manning's Equation Parameters
─────────────────────────────
Shape:         Trapezoidal
Bottom width b: 3.2 m
Side slope z:   1.5
Slope S:        0.00045
Manning's n:    0.022 (Earth, clean and straight)
Unit system:    SI (u = 1.0)
─────────────────────────────
[Edit Parameters]
```

Clicking "Edit Parameters" opens an inline form (same fields as add-module Step 3) with a "Save Changes" button. On save, `PUT /api/canals/:canalId` updates the `manningsParams` sub-document. All future readings for this canal use the new constants immediately.

#### 12.2 Location Edit

Below the mini map, admin sees:
```
Lat: 10.5359  Lon: 76.2804
[Edit Location]
```
Clicking opens a map-click interface to set a new location. On save, `PUT /api/canals/:canalId` updates `location.coordinates`.

#### 12.3 Device Info Panel

```
ESP32 Device ID:   ESP32_PEECHI_001
Sensor Type:       Ultrasonic
Registered:        2025-11-01
Last Reading:      2 min ago
[Change Device ID]  [Deactivate Module]
```

#### 12.4 Additional Admin Graphs

Two extra chart tabs (in addition to user's tabs):

| Tab | Chart |
|---|---|
| Raw Depth | Line chart of raw depth values (y in metres) — useful for calibrating Manning's params |
| Manning's Calc Detail | Shows A (area), R (hydraulic radius) over time, so admin can verify the equation is behaving correctly |

---

## 13. Map Page

**Route:** `/app/map`  
**File:** `src/app/app/map/page.tsx`

- Full-screen Mapbox map.
- **All registered canals** shown as pins/markers.
- Marker colour = status (green = FLOWING, yellow = LOW_FLOW, red = HIGH_FLOW/BLOCKED/ERROR, grey = OFFLINE).
- Click on a marker → side panel slides in with the canal mini-dashboard (same cards as Section 11.1 left panel).
- **Map style switcher** top-right: Satellite, Streets, Outdoors, Dark.
- **Filters panel** top-left: filter by status, type (irrigation/drainage/water-supply), sensor type.
- **Search integrated** — typing in global top search filters which markers are shown and pans to the first match.

---

## 14. Backend Revamp

### 14.1 New File: `backend/lib/mannings.js`

Implement the `calculateFlowRate(params)` function as specified in Section 10.3.

Full implementation skeleton:

```js
function calculateFlowRate({ shape, depth, b, z, D, S, n, u }) {
  let A, P;

  switch (shape) {
    case 'trapezoidal':
      A = depth * (b + z * depth);
      P = b + 2 * depth * Math.sqrt(1 + z * z);
      break;
    case 'triangular':
      A = z * depth * depth;
      P = 2 * depth * Math.sqrt(1 + z * z);
      break;
    case 'rectangular':
      A = b * depth;
      P = b + 2 * depth;
      break;
    case 'wide-flat':
      A = b * depth;
      P = b;
      break;
    case 'circular': {
      const theta = 2 * Math.acos(1 - (2 * depth) / D);
      A = ((theta - Math.sin(theta)) * D * D) / 8;
      P = (theta * D) / 2;
      break;
    }
    default:
      throw new Error(`Unknown channel shape: ${shape}`);
  }

  const R = A / P;
  const Q = (u / n) * A * Math.pow(R, 2 / 3) * Math.pow(S, 0.5);
  return { flowRate: Q, area: A, wettedPerimeter: P, hydraulicRadius: R };
}

module.exports = { calculateFlowRate };
```

### 14.2 Updates to `backend/routes/esp32.js`

#### POST /api/esp32/data — updated logic

Incoming payload changes:

```
Ultrasonic ESP32 sends:
{
  canalId: "peechi-canal",
  deviceId: "...",           // OR header X-ESP32-ID
  depth: 1.24,               // metres — the only sensor reading
  waterLevel: 1.24,          // same as depth (alias for compatibility)
  temperature: 24.5,
  pH: 7.1,
  batteryLevel: 92,
  signalStrength: -60
}

Radar ESP32 sends:
{
  canalId: "peechi-canal",
  deviceId: "...",
  flowRate: 14.2,            // direct reading from radar
  speed: 1.8,
  discharge: 520,
  waterLevel: 1.24,
  temperature: 24.5,
  pH: 7.1,
  batteryLevel: 92,
  signalStrength: -60
}
```

After reading is received server side:

```js
if (canal.sensorType === 'ultrasonic') {
  const result = calculateFlowRate({
    shape: canal.manningsParams.shape,
    depth: req.body.depth,
    b: canal.manningsParams.b,
    z: canal.manningsParams.z,
    D: canal.manningsParams.D,
    S: canal.manningsParams.S,
    n: canal.manningsParams.n,
    u: canal.manningsParams.u,
  });
  readingObj.flowRate = result.flowRate;
  readingObj.calculatedArea = result.area;
  readingObj.calculatedHydraulicRadius = result.hydraulicRadius;
  readingObj.depth = req.body.depth;
} else if (canal.sensorType === 'radar') {
  // Use flowRate as sent directly by device
  readingObj.flowRate = req.body.flowRate;
  readingObj.speed = req.body.speed;
  readingObj.discharge = req.body.discharge;
}
```

Then push to `dataBuffer` as before.

### 14.3 Configurable ESP32 Reporting Interval

Add to `.env`:
```
ESP32_REPORTING_INTERVAL_SECONDS=60
```

This value is returned in `GET /api/esp32/config/:deviceId`:
```json
{
  "updateInterval": 60
}
```

The ESP32 firmware should poll this endpoint on startup and use the `updateInterval` value to set its own timer.

### 14.4 New Route: `backend/routes/auth.js`

If using a custom auth instead of NextAuth (not recommended but optional fallback):

- `POST /api/auth/login` — validates email/password, returns a signed JWT.
- `GET /api/auth/me` — validates JWT from `Authorization: Bearer <token>` header, returns user info.

Under NextAuth architecture, this may not be needed as NextAuth handles auth server-side.

### 14.5 Data Pipeline Note

With ESP32s sending every 60 seconds and potentially many devices:
- The existing in-memory buffer + timed flush (`dataBuffer.js`) handles this well.
- For very large deployments: consider a message queue (see Section 19 for suggestions).
- Monitor `/api/esp32/buffer-stats` to watch buffer growth.

---

## 15. Database Schema Changes

### 15.1 Updated `Canal` Model

Add these fields to the existing `Canal` schema (`backend/models/Canal.js`):

```js
sensorType: {
  type: String,
  enum: ['ultrasonic', 'radar'],
  default: 'ultrasonic',
},
manningsParams: {
  shape: { type: String, enum: ['trapezoidal','triangular','rectangular','wide-flat','circular'] },
  b: { type: Number },       // bottom width (m)
  z: { type: Number },       // side slope (H:V)
  D: { type: Number },       // pipe diameter for circular (m)
  S: { type: Number },       // channel slope
  n: { type: Number },       // Manning's roughness coefficient
  u: { type: Number, default: 1.0 }, // unit factor; 1.0=SI, 1.486=US
},
```

### 15.2 Updated `CanalReading` Model

Add these fields to `backend/models/CanalReading.js`:

```js
depth: {
  type: Number,
  min: 0,
  default: null,
  // Raw depth reading from ultrasonic sensor (metres)
},
calculatedArea: {
  type: Number,
  min: 0,
  default: null,
  // Cross-sectional flow area A (m²) computed from Manning's
},
calculatedHydraulicRadius: {
  type: Number,
  min: 0,
  default: null,
  // Hydraulic radius R (m) computed from Manning's
},
sensorType: {
  type: String,
  enum: ['ultrasonic', 'radar'],
  default: 'ultrasonic',
},
```

### 15.3 New `User` Model

`backend/models/User.js`:

```js
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  favouriteCanals: [{ type: String }],  // array of canalIds
  createdAt: { type: Date, default: Date.now },
});
```

---

## 16. API Reference (new/changed)

### New endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/canals` | Updated — now also accepts `sensorType`, `manningsParams` |
| `PUT` | `/api/canals/:canalId` | Updated — now also allows editing `manningsParams`, `location`, `esp32DeviceId` |
| `GET` | `/api/dashboard/timeseries/:canalId` | Updated — add `?years=3` param for year-on-year data |
| `GET` | `/api/esp32/config/:deviceId` | Updated — now returns `updateInterval` from env |
| `GET` | `/api/users/me/favourites` | Get current user's favourited canalIds |
| `PUT` | `/api/users/me/favourites` | Update favourites list |

### Changed payload for `POST /api/esp32/data` (ultrasonic)

Now accepts `depth` instead of (or in addition to) `flowRate`.

Validation update: if sensorType is `ultrasonic`, require `depth`; if `radar`, require `flowRate`.

---

## 17. Environment Variables

### Frontend (`/.env.local`)

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

### Backend (`/backend/.env`)

```env
MONGODB_URI=mongodb://localhost:27017/canal-monitoring
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
ESP32_BUFFER_FLUSH_INTERVAL=600
ESP32_REPORTING_INTERVAL_SECONDS=60
JWT_SECRET=your-jwt-secret
```

---

## 18. Implementation Order for Agents

Follow this order strictly. Do NOT skip phases.

```
Phase 1 — Auth Foundation
  1.1  Install NextAuth.js v5 (npm install next-auth@beta)
  1.2  Create backend/models/User.js
  1.3  Update backend/scripts/init-database.js to seed users
  1.4  Create src/auth.ts (credentials provider hitting backend /api/auth/login)
  1.5  Create src/app/api/auth/[...nextauth]/route.ts
  1.6  Create src/middleware.ts
  1.7  Create src/app/login/page.tsx
  1.8  Update Navbar to show Login / Go to Dashboard based on session

Phase 2 — Manning's Equation Backend
  2.1  Create backend/lib/mannings.js with calculateFlowRate()
  2.2  Update backend/models/Canal.js with new fields
  2.3  Update backend/models/CanalReading.js with new fields
  2.4  Update backend/routes/esp32.js to route ultrasonic vs radar
  2.5  Update backend/routes/canals.js POST/PUT to accept new fields
  2.6  Update backend/scripts/init-database.js to seed manningsParams
  2.7  Test with simulate-esp32.js (update simulator to send depth)

Phase 3 — Post-Login Layout & Hub
  3.1  Create src/app/app/layout.tsx with sidebar + topbar
  3.2  Create src/components/sidebar/Sidebar.tsx
  3.3  Create src/hooks/useFavourites.ts
  3.4  Create src/hooks/useSearch.ts
  3.5  Create src/components/canal/CanalModuleCard.tsx
  3.6  Create src/app/app/page.tsx (module hub)

Phase 4 — Add Module Wizard (Admin)
  4.1  Create src/app/app/admin/add-module/page.tsx
  4.2  Create multi-step form components (Step1, Step2, Step3, Step4)
  4.3  Wire form submit to POST /api/canals

Phase 5 — User Dashboard
  5.1  Create src/app/app/canal/[canalId]/page.tsx
  5.2  Update/create chart components as needed
  5.3  Prediction utility src/lib/prediction.ts

Phase 6 — Admin Dashboard
  6.1  Create src/app/app/admin/canal/[canalId]/page.tsx
  6.2  Manning's edit form component
  6.3  Location edit with map picker

Phase 7 — Map Page
  7.1  Create src/app/app/map/page.tsx
  7.2  Map with all markers, style switcher, filter panel, slide-in detail panel

Phase 8 — Landing Page Polish
  8.1  Add CanalGallery section
  8.2  Add How It Works section
  8.3  Update Navbar conditional login/dashboard button
```

---

## 19. Agent Suggestions & Additions

These are suggestions from the agent that the user has not explicitly requested but could significantly improve the project. Review and decide which to include.

### 19.1 WebSocket / SSE for Real-Time Updates (HIGH PRIORITY)

Currently, the frontend polls `/api/esp32/latest` every N seconds. A better approach is **Server-Sent Events (SSE)** on the backend:

- `GET /api/stream/canals` — SSE endpoint. When `dataBuffer.push()` is called, it broadcasts the new reading to all connected SSE clients.
- Frontend uses `EventSource` instead of `setInterval`. Instant updates, lower overhead.
- No library needed on backend (plain `res.setHeader('Content-Type', 'text/event-stream')`).

### 19.2 Alert Notifications (MEDIUM)

- When a reading has `status === 'HIGH_FLOW' || 'BLOCKED' || 'ERROR'` or `batteryLevel < 20`, emit a browser notification via the Web Notifications API.
- Add a notification bell in the top bar that shows unread alert count.
- Store alert history in a `alerts` MongoDB collection.

### 19.3 CSV / PDF Export (LOW)

- Add "Export CSV" button on dashboard charts.
- Export current chart time range data as CSV.
- Use `papaparse` (already in many Next.js projects) or native `Blob` + CSV generation.

### 19.4 Dark Mode Support

- Tailwind already supports `dark:` variants.
- Add a theme toggle in the top bar.
- Persist preference in `localStorage`.

### 19.5 Manning's Equation Input Validation UX

- On the Add Module / Edit form, add a **live preview** of calculated Q given a sample depth (e.g. "At depth = 1.0 m, estimated Q = 12.4 m³/s"). This lets admins sanity-check their parameters before saving.
- Implement this as a client-side calculation using the same formula — port `mannings.js` to TypeScript as `src/lib/mannings.ts`.

### 19.6 Canal Depth Calibration Mode (ADMIN)

- Admins should be able to set a "reference depth" (e.g., when canal is known to be dry, depth sensor should read 0). This is an offset applied to all incoming depth values:
  - `correctedDepth = rawDepth - canal.depthOffset`
- Add `depthOffset: Number` to Canal model, configurable in admin edit panel.

### 19.7 ESP32 Firmware Template

- Add a `firmware/` folder with a reference Arduino sketch (`.ino`) that shows how to send data to the API with the correct payload, headers, and configurable `reportingIntervalSeconds` fetched from `/api/esp32/config/:deviceId`.
- This dramatically reduces time for hardware engineers to get started.

### 19.8 OTA-Ready Config Pull

- Currently ESP32 config (interval) is pulled via `GET /api/esp32/config/:deviceId`.
- Expand this endpoint to also return threshold settings, alarm levels, sensor calibration offsets, and firmware version to check against.
- This forms a lightweight OTA config-push system without requiring reflashing.

### 19.9 Historical Data Retention Strategy

- The current TTL index expires readings after 30 days.
- Consider a **data downsampling job**: after 7 days, keep only hourly averages; after 30 days, keep only daily averages. This preserves long-term trends without blowing up storage.
- Implement as a MongoDB scheduled task or a cron job script in `backend/scripts/downsample.js`.

### 19.10 Multi-Canal Comparison View

- A page at `/app/compare` that lets users select 2–4 canals and side-by-side compare their flow rates on shared time-axis charts. Useful for irrigation management decisions.

---

## Notes for Agents

- When editing existing files, maintain backward compatibility with any existing data in MongoDB.
- Always update `backend/scripts/init-database.js` when schema changes; the seed data must always match current schemas.
- Running `npm run init-db` from `backend/` must always produce a valid, testable state.
- The `backend/scripts/simulate-esp32.js` must be updated to simulate ultrasonic (depth) payloads, not just flow rate.
- Do not break the existing `/api/esp32/latest` polling route — the frontend depends on it during the transition.
- Keep Manning's equation calculation in `backend/lib/mannings.js` as a pure function with zero side effects. It can also be ported to `src/lib/mannings.ts` for frontend use.
- Never store plain text passwords. Always use `bcrypt.hash()`.
- Run `npm run test` from `backend/` after each backend phase to catch regressions.
