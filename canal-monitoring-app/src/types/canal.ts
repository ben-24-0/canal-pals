/* ──────────────────────────────────────────────────────────────
 *  Canal & CanalReading – shared TypeScript types
 * ────────────────────────────────────────────────────────────── */

/** Manning's equation parameters stored on a canal document. */
export interface ManningsParams {
  /** Cross-section shape: "trapezoid" | "rectangle" | "circle" */
  shape: "trapezoid" | "rectangle" | "circle";
  /** Bottom width (m) – trapezoid / rectangle */
  b?: number;
  /** Side slope (horizontal/vertical) – trapezoid */
  z?: number;
  /** Diameter (m) – circular */
  D?: number;
  /** Bed slope S₀ */
  S: number;
  /** Manning's roughness coefficient */
  n: number;
  /** Unit factor (1 for SI, 1.49 for US customary) */
  u: number;
  /** Maximum measurable depth (m) – used for offset calc */
  depthMax?: number;
}

/** Static canal information (returned by GET /api/canals/:id). */
export interface CanalInfo {
  _id?: string;
  canalId: string;
  name: string;
  type: "irrigation" | "drainage" | "water-supply";
  location: {
    type?: string;
    coordinates: [number, number]; // [lon, lat]
  };
  esp32DeviceId?: string;
  isActive: boolean;
  sensorType: "radar" | "ultrasonic";
  manningsParams?: ManningsParams;
  description?: string;
  capacity?: number;
  depthOffset?: number;
  createdAt: string;
  updatedAt?: string;
}

/** A single real-time reading (from SSE or REST). */
export interface CanalReading {
  canalId: string;
  esp32DeviceId?: string;
  status:
    | "FLOWING"
    | "STOPPED"
    | "LOW_FLOW"
    | "HIGH_FLOW"
    | "BLOCKED"
    | "ERROR";

  // Core measurements
  flowRate: number;
  speed?: number;
  discharge?: number;
  waterLevel?: number;
  depth?: number;

  // Manning's calculated fields (ultrasonic)
  calculatedArea?: number;
  calculatedHydraulicRadius?: number;
  wettedPerimeter?: number;
  sensorType?: "radar" | "ultrasonic";

  // Environmental
  temperature?: number;
  pH?: number;
  turbidity?: number;

  // Device health
  batteryLevel?: number;
  signalStrength?: number;

  // GPS
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
  };

  // Errors & metadata
  errors?: Array<{
    errorCode: string;
    errorMessage: string;
    timestamp: string;
  }>;
  metadata?: {
    firmwareVersion?: string;
    deviceUptime?: number;
    freeMemory?: number;
    resetReason?: string;
  };

  timestamp: string;
  receivedAt?: string;
}

/** Shape used by the map's pin merging logic. */
export interface CanalPin {
  canal: CanalInfo;
  reading: CanalReading | null;
}
