"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Gauge,
  Settings2,
  Info,
  BarChart3,
  Save,
  Loader2,
  Trash2,
  AlertTriangle,
  ChevronDown,
  Download,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CanalInfo } from "@/types/canal";
import { useCanalSSE } from "@/hooks/useCanalSSE";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
});

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

interface TimelinePoint {
  timestamp: number;
  label: string;
  height: number;
  flowRate: number;
}

function resolveReadingTime(
  reading: {
    timestamp?: string | number | Date;
    receivedAt?: string | number | Date;
    createdAt?: string | number | Date;
  } | null,
): number | null {
  if (!reading) return null;

  const candidates = [reading.timestamp, reading.receivedAt, reading.createdAt];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }

  return null;
}

export default function AdminCanalDashboard() {
  const params = useParams();
  const router = useRouter();
  const canalId = params.canalId as string;

  const [canal, setCanal] = useState<CanalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  // SSE: live reading — no polling needed
  const { reading, connected } = useCanalSSE(canalId);

  const fetchCanal = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/canals/${canalId}`);
      if (res.ok) {
        const j = await res.json();
        setCanal(j.canal ?? j);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [canalId]);

  useEffect(() => {
    fetchCanal();
  }, [fetchCanal]);

  const fetchReadings = useCallback(
    async (startDate?: string, endDate?: string) => {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const query = new URLSearchParams({
          limit: "2000",
          page: "1",
        });

        if (startDate) {
          query.set("startDate", `${startDate}T00:00:00.000Z`);
        }
        if (endDate) {
          query.set("endDate", `${endDate}T23:59:59.999Z`);
        }

        const res = await fetch(
          `${BACKEND_URL}/api/canals/${encodeURIComponent(canalId)}/readings?${query.toString()}`,
        );

        if (!res.ok) {
          throw new Error(`Failed to load readings (HTTP ${res.status})`);
        }

        const json = (await res.json()) as {
          readings?: Array<{
            timestamp?: string | number | Date;
            receivedAt?: string | number | Date;
            createdAt?: string | number | Date;
            height?: number;
            depth?: number;
            waterLevel?: number;
            flowRate?: number;
          }>;
        };

        const points = (json.readings ?? [])
          .map((r) => {
            const ts = resolveReadingTime(r);
            const heightRaw = r.height ?? r.depth ?? Number(r.waterLevel ?? NaN);
            const flowRaw = Number(r.flowRate ?? NaN);

            if (
              ts == null ||
              !Number.isFinite(ts) ||
              !Number.isFinite(heightRaw) ||
              !Number.isFinite(flowRaw)
            ) {
              return null;
            }

            const d = new Date(ts);
            return {
              timestamp: ts,
              label: d.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              height: +heightRaw.toFixed(3),
              flowRate: +flowRaw.toFixed(3),
            } satisfies TimelinePoint;
          })
          .filter((point): point is TimelinePoint => point !== null)
          .sort((a, b) => a.timestamp - b.timestamp);

        setTimeline(points);
      } catch (err) {
        setHistoryError(
          err instanceof Error ? err.message : "Failed to load readings",
        );
      } finally {
        setHistoryLoading(false);
      }
    },
    [canalId],
  );

  useEffect(() => {
    if (!canalId) return;
    fetchReadings(fromDate, toDate);
  }, [canalId, fromDate, toDate, fetchReadings]);

  useEffect(() => {
    if (!reading) return;

    const ts =
      resolveReadingTime(
        reading as {
          timestamp?: string | number | Date;
          receivedAt?: string | number | Date;
          createdAt?: string | number | Date;
        },
      ) ?? Date.now();
    const heightRaw =
      reading.height ?? reading.depth ?? Number(reading.waterLevel ?? NaN);
    const flowRaw = reading.flowRate ?? NaN;

    if (!Number.isFinite(heightRaw) || !Number.isFinite(flowRaw)) return;

    const d = new Date(ts);
    const point: TimelinePoint = {
      timestamp: ts,
      label: d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      height: +heightRaw.toFixed(3),
      flowRate: +flowRaw.toFixed(3),
    };

    setTimeline((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.timestamp === point.timestamp &&
        last.height === point.height &&
        last.flowRate === point.flowRate
      ) {
        return prev;
      }

      const next = [...prev, point];
      return next.length > 240 ? next.slice(-240) : next;
    });
  }, [reading]);

  // ─── Editable Settings State ─────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // ─── Delete State ────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ─── UI State ────────────────────────────────────────────────
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);

  const handleDeleteCanal = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/canals/${canalId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`);
      }
      // Redirect to main app page after successful delete
      router.push("/app");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  // Form state for editable fields
  const [editForm, setEditForm] = useState({
    isActive: true,
    depthOffset: "0",
    upperLimit: "20",
    lowerLimit: "2",
    n: "0.025",
    S: "0.0005",
    b: "3.0",
    z: "1.5",
    D: "",
    u: "1",
    depthMax: "2.5",
    shape: "trapezoid" as "trapezoid" | "rectangle" | "circle",
  });

  // Initialize form when canal loads
  useEffect(() => {
    if (canal) {
      setEditForm({
        isActive: canal.isActive ?? true,
        depthOffset: String(canal.depthOffset ?? 0),
        upperLimit: String(canal.upperLimit ?? 20),
        lowerLimit: String(canal.lowerLimit ?? 2),
        n: String(canal.manningsParams?.n ?? 0.025),
        S: String(canal.manningsParams?.S ?? 0.0005),
        b: String(canal.manningsParams?.b ?? 3.0),
        z: String(canal.manningsParams?.z ?? 1.5),
        D: String(canal.manningsParams?.D ?? ""),
        u: String(canal.manningsParams?.u ?? 1),
        depthMax: String(canal.manningsParams?.depthMax ?? 2.5),
        shape: canal.manningsParams?.shape ?? "trapezoid",
      });
    }
  }, [canal]);

  const handleSaveSettings = async () => {
    if (!isEditMode) return;
    const confirmed = window.confirm(
      "Save these setting changes for this canal?",
    );
    if (!confirmed) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const body = {
      isActive: editForm.isActive,
      depthOffset: parseFloat(editForm.depthOffset) || 0,
      upperLimit: parseFloat(editForm.upperLimit) || 20,
      lowerLimit: parseFloat(editForm.lowerLimit) || 2,
      manningsParams: {
        shape: editForm.shape,
        n: parseFloat(editForm.n) || 0.025,
        S: parseFloat(editForm.S) || 0.0005,
        u: parseFloat(editForm.u) || 1,
        ...(editForm.shape !== "circle" && editForm.b
          ? { b: parseFloat(editForm.b) }
          : {}),
        ...(editForm.shape === "trapezoid" && editForm.z
          ? { z: parseFloat(editForm.z) }
          : {}),
        ...(editForm.shape === "circle" && editForm.D
          ? { D: parseFloat(editForm.D) }
          : {}),
        ...(editForm.depthMax
          ? { depthMax: parseFloat(editForm.depthMax) }
          : {}),
      },
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/canals/${canalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`);
      }

      setSaveSuccess(true);
      setIsEditMode(false);
      // Re-fetch canal to show updated values
      fetchCanal();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const rangeStartTs = fromDate
    ? new Date(`${fromDate}T00:00:00.000Z`).getTime()
    : null;
  const rangeEndTs = toDate ? new Date(`${toDate}T23:59:59.999Z`).getTime() : null;

  const filteredTimeline = useMemo(() => {
    return timeline.filter((point) => {
      if (rangeStartTs != null && point.timestamp < rangeStartTs) return false;
      if (rangeEndTs != null && point.timestamp > rangeEndTs) return false;
      return true;
    });
  }, [timeline, rangeStartTs, rangeEndTs]);

  const chartHeightDomain = useMemo(() => {
    if (filteredTimeline.length === 0) return [0, 1] as const;
    const values = filteredTimeline.map((p) => p.height);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.1, 0.05);
    return [Math.max(0, min - pad), max + pad] as const;
  }, [filteredTimeline]);

  const chartFlowDomain = useMemo(() => {
    if (filteredTimeline.length === 0) return [0, 1] as const;
    const values = filteredTimeline.map((p) => p.flowRate);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.1, 0.05);
    return [Math.max(0, min - pad), max + pad] as const;
  }, [filteredTimeline]);

  const exportTimelineCsv = () => {
    if (filteredTimeline.length === 0) {
      window.alert("No readings available for the selected date range.");
      return;
    }

    const rows = [
      ["Timestamp", "Height (m)", "Flow Rate (m3/s)"],
      ...filteredTimeline.map((row) => [
        new Date(row.timestamp).toISOString(),
        row.height.toFixed(3),
        row.flowRate.toFixed(3),
      ]),
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${canal?.canalId ?? canalId}-readings-${fromDate || "all"}-to-${toDate || "all"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }
  if (!canal) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Canal not found.</p>
      </div>
    );
  }

  const status = reading?.status ?? "STOPPED";

  // ─── Time-based offline detection ─────────────────────────
  const lastReadingTime =
    resolveReadingTime(
      reading as { timestamp?: string; receivedAt?: string } | null,
    ) ??
    timeline[timeline.length - 1]?.timestamp ??
    null;
  const isOffline = !connected && !lastReadingTime;

  const measuredTimestamp = resolveReadingTime(
    reading as {
      timestamp?: string | number | Date;
      receivedAt?: string | number | Date;
      createdAt?: string | number | Date;
    } | null,
  );
  const measuredTimestampLabel = measuredTimestamp
    ? new Date(measuredTimestamp).toLocaleString()
    : "Waiting for reading";

  const [lon, lat] = canal.location.coordinates;
  const mp = canal.manningsParams;
  const currentHeight =
    reading?.height ??
    reading?.depth ??
    (reading?.waterLevel != null ? Number(reading.waterLevel) : null);
  const readingTimestampLabel = lastReadingTime
    ? new Date(lastReadingTime).toLocaleString()
    : "Waiting for reading";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Heading */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{canal.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">
              {canal.canalId}
            </p>
          </div>
          <span
            title={connected ? "Live stream connected" : "Connecting…"}
            className={`mt-1 w-2.5 h-2.5 rounded-full border-2 border-background shadow ${
              connected ? "bg-green-500 animate-pulse" : "bg-yellow-400"
            }`}
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-amber-600 border-amber-400">
            Admin View
          </Badge>
        </div>
      </div>

      {/* Top info row: metrics + map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Gauge className="w-4 h-4" /> Live Metrics
              </CardTitle>
              <Badge variant={isOffline ? "outline" : "default"}>
                {isOffline ? "Offline" : "Connected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary: Water Depth/Height - EMPHASIZED */}
            <div className="bg-linear-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/20 dark:to-blue-950/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Water Height
                </span>
                <span className="text-xs text-muted-foreground text-right">
                  Last received: {readingTimestampLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Measured at: {measuredTimestampLabel}
              </p>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                  {currentHeight != null ? currentHeight.toFixed(2) : "—"}
                </span>
                <span className="text-lg text-muted-foreground">m</span>
              </div>
            </div>

            {/* Secondary metrics: Velocity & Flow Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 p-3 border">
                <p className="text-xs text-muted-foreground mb-1">Velocity</p>
                <p className="text-xl font-semibold">
                  {reading?.speed != null ? reading.speed.toFixed(3) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">m/s</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3 border">
                <p className="text-xs text-muted-foreground mb-1">Flow Rate</p>
                <p className="text-xl font-semibold">
                  {reading?.flowRate != null
                    ? reading.flowRate.toFixed(2)
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">m³/s</p>
              </div>
            </div>

            {/* More Info Section - Collapsible */}
            <div className="border-t pt-3">
              <button
                onClick={() => setShowMoreInfo(!showMoreInfo)}
                className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Info className="w-4 h-4" /> More Info
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    showMoreInfo ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showMoreInfo && (
                <div className="mt-3 space-y-2 pt-3 border-t divide-y">
                  <Row
                    label="Flow Area"
                    value={
                      reading?.calculatedArea != null
                        ? `${reading.calculatedArea.toFixed(4)} m²`
                        : "—"
                    }
                  />
                  <Row
                    label="Hydraulic Radius"
                    value={
                      reading?.calculatedHydraulicRadius != null
                        ? `${reading.calculatedHydraulicRadius.toFixed(4)} m`
                        : "—"
                    }
                  />
                  <Row
                    label="Wetted Perimeter"
                    value={
                      reading?.wettedPerimeter != null
                        ? `${reading.wettedPerimeter.toFixed(4)} m`
                        : "—"
                    }
                  />
                  <Row
                    label="Battery"
                    value={
                      reading?.batteryLevel != null
                        ? `${reading.batteryLevel.toFixed(0)}%`
                        : "—"
                    }
                  />
                  <Row
                    label="Signal"
                    value={
                      reading?.signalStrength != null
                        ? `${reading.signalStrength} dBm`
                        : "—"
                    }
                  />
                </div>
              )}
            </div>

            <Separator className="my-2" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row
                label="Sensor"
                value={<span className="capitalize">{canal.sensorType}</span>}
              />
              <Row
                label="Lon/Lat"
                value={
                  <span className="font-mono text-xs">
                    {lon.toFixed(4)}, {lat.toFixed(4)}
                  </span>
                }
              />
              <Row label="Device ID" value={canal.esp32DeviceId ?? "—"} />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden min-h-65">
          <CardContent className="p-0 h-full min-h-65">
            <MiniMap
              canals={[
                {
                  canalId: canal.canalId,
                  name: canal.name,
                  coordinates: canal.location.coordinates,
                  status,
                  flowRate: reading?.flowRate ?? null,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <CardTitle className="text-base">Recent Readings Table</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="fromDate" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="toDate" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={exportTimelineCsv}
                className="h-9"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historyError && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {historyError}
            </div>
          )}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Timestamp</th>
                  <th className="text-right px-3 py-2 font-medium">
                    Height (m)
                  </th>
                  <th className="text-right px-3 py-2 font-medium">
                    Flow Rate (m³/s)
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyLoading && filteredTimeline.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={3}>
                      Loading readings from database...
                    </td>
                  </tr>
                ) : filteredTimeline.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={3}>
                      No readings found for the selected date range.
                    </td>
                  </tr>
                ) : (
                  filteredTimeline
                    .slice(-20)
                    .reverse()
                    .map((row) => (
                      <tr
                        key={`${row.timestamp}-${row.flowRate}`}
                        className="border-t"
                      >
                        <td className="px-3 py-2">
                          {new Date(row.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.height.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.flowRate.toFixed(3)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Manning's Params Panel */}
      {mp && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Settings2 className="w-4 h-4" /> Manning&apos;s Equation
              Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 divide-y-0">
              <Row
                label="Cross-section shape"
                value={<span className="capitalize">{mp.shape}</span>}
              />
              <Row label="Manning's n" value={mp.n?.toFixed(4) ?? "—"} />
              <Row label="Bed slope S" value={mp.S?.toFixed(6) ?? "—"} />
              <Row label="Unit factor u" value={mp.u?.toString() ?? "—"} />
              {mp.b != null && (
                <Row label="Bottom width b" value={`${mp.b} m`} />
              )}
              {mp.z != null && (
                <Row label="Side slope z" value={mp.z.toString()} />
              )}
              {mp.D != null && <Row label="Diameter D" value={`${mp.D} m`} />}
              {mp.depthMax != null && (
                <Row label="Max depth" value={`${mp.depthMax} m`} />
              )}
              {canal.depthOffset != null && canal.depthOffset !== 0 && (
                <Row label="Sensor height" value={`${canal.depthOffset} cm`} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Device Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            <Info className="w-4 h-4" /> Device &amp; Canal Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6">
            <Row
              label="Canal ID"
              value={<span className="font-mono text-xs">{canal.canalId}</span>}
            />
            <Row
              label="Type"
              value={<span className="capitalize">{canal.type}</span>}
            />
            <Row
              label="IIMS Device"
              value={canal.esp32DeviceId ?? "Not assigned"}
            />
            <Row label="Active" value={canal.isActive ? "Yes" : "No"} />
            <Row
              label="Sensor type"
              value={<span className="capitalize">{canal.sensorType}</span>}
            />
            <Row
              label="Created"
              value={new Date(canal.createdAt).toLocaleDateString()}
            />
            {canal.description && (
              <div className="col-span-full py-1.5">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm">{canal.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5">
            <Settings2 className="w-4 h-4" /> Canal Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              {isEditMode
                ? "Editing enabled. Save or cancel your changes."
                : "Settings are locked. Click Edit Settings to make changes."}
            </p>
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (canal) {
                        setEditForm({
                          isActive: canal.isActive ?? true,
                          depthOffset: String(canal.depthOffset ?? 0),
                          upperLimit: String(canal.upperLimit ?? 20),
                          lowerLimit: String(canal.lowerLimit ?? 2),
                          n: String(canal.manningsParams?.n ?? 0.025),
                          S: String(canal.manningsParams?.S ?? 0.0005),
                          b: String(canal.manningsParams?.b ?? 3.0),
                          z: String(canal.manningsParams?.z ?? 1.5),
                          D: String(canal.manningsParams?.D ?? ""),
                          u: String(canal.manningsParams?.u ?? 1),
                          depthMax: String(
                            canal.manningsParams?.depthMax ?? 2.5,
                          ),
                          shape: canal.manningsParams?.shape ?? "trapezoid",
                        });
                      }
                      setIsEditMode(false);
                      setSaveError(null);
                    }}
                    disabled={saving}
                  >
                    Cancel Edit
                  </Button>
                  <Button onClick={handleSaveSettings} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1.5" />
                        Save Settings
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditMode(true);
                    setSaveSuccess(false);
                    setSaveError(null);
                  }}
                >
                  Edit Settings
                </Button>
              )}
            </div>
          </div>

          {/* Edit form - only show when in edit mode */}
          {isEditMode && (
            <>
              {/* Sensor type + active */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sensor Type</Label>
                  <div className="flex gap-2">
                    {(["radar", "ultrasonic"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setEditForm((p) => ({ ...p, shape: p.shape }))
                        }
                        disabled
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                          canal.sensorType === s
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Change sensor type via re-registration.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Active</Label>
                  <div className="flex gap-2">
                    {([true, false] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() =>
                          setEditForm((p) => ({ ...p, isActive: v }))
                        }
                        disabled={!isEditMode}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          editForm.isActive === v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        {v ? "Active" : "Inactive"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sensor height / depthOffset */}
              {canal.sensorType === "ultrasonic" && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
                  <Label htmlFor="depthOffset" className="font-semibold">
                    Sensor Height above Canal Floor (cm)
                  </Label>
                  <Input
                    id="depthOffset"
                    type="number"
                    step="1"
                    min="0"
                    max="1000"
                    value={editForm.depthOffset}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        depthOffset: e.target.value,
                      }))
                    }
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Physical distance (cm) from the ultrasonic sensor down to
                    the canal floor when empty.{" "}
                    <strong>
                      Water depth = this value − measured distance.
                    </strong>
                  </p>
                </div>
              )}

              {/* Flow limits */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="upperLimit">High Flow Threshold (m³/s)</Label>
                  <Input
                    id="upperLimit"
                    type="number"
                    step="any"
                    value={editForm.upperLimit}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, upperLimit: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lowerLimit">Low Flow Threshold (m³/s)</Label>
                  <Input
                    id="lowerLimit"
                    type="number"
                    step="any"
                    value={editForm.lowerLimit}
                    disabled={!isEditMode}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, lowerLimit: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Manning's params */}
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Manning&apos;s Equation Parameters
                </p>
                <div className="space-y-2">
                  <Label>Cross-Section Shape</Label>
                  <div className="flex gap-2">
                    {(["trapezoid", "rectangle", "circle"] as const).map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setEditForm((p) => ({ ...p, shape: s }))
                          }
                          disabled={!isEditMode}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                            editForm.shape === s
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted"
                          }`}
                        >
                          {s}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mp-n">Manning&apos;s n</Label>
                    <Input
                      id="mp-n"
                      type="number"
                      step="any"
                      value={editForm.n}
                      disabled={!isEditMode}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, n: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mp-S">Bed Slope S</Label>
                    <Input
                      id="mp-S"
                      type="number"
                      step="any"
                      value={editForm.S}
                      disabled={!isEditMode}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, S: e.target.value }))
                      }
                    />
                  </div>
                  {editForm.shape !== "circle" && (
                    <div className="space-y-2">
                      <Label htmlFor="mp-b">Bottom Width b (m)</Label>
                      <Input
                        id="mp-b"
                        type="number"
                        step="any"
                        value={editForm.b}
                        disabled={!isEditMode}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, b: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {editForm.shape === "trapezoid" && (
                    <div className="space-y-2">
                      <Label htmlFor="mp-z">Side Slope z (H:V)</Label>
                      <Input
                        id="mp-z"
                        type="number"
                        step="any"
                        value={editForm.z}
                        disabled={!isEditMode}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, z: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {editForm.shape === "circle" && (
                    <div className="space-y-2">
                      <Label htmlFor="mp-D">Diameter D (m)</Label>
                      <Input
                        id="mp-D"
                        type="number"
                        step="any"
                        value={editForm.D}
                        disabled={!isEditMode}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, D: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="mp-u">Unit Factor u</Label>
                    <Input
                      id="mp-u"
                      type="number"
                      step="any"
                      value={editForm.u}
                      disabled={!isEditMode}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, u: e.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      1 = SI, 1.49 = US
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mp-depthMax">Max Depth (m)</Label>
                    <Input
                      id="mp-depthMax"
                      type="number"
                      step="any"
                      value={editForm.depthMax}
                      disabled={!isEditMode}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, depthMax: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {saveError && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="p-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 text-sm">
              Settings saved successfully.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Trend Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTimeline.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              No chart data for the selected date range.
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Height vs Timestamp
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={filteredTimeline}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "Height (m)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11 },
                      }}
                      domain={chartHeightDomain}
                    />
                    <Tooltip
                      formatter={(value: number | string | undefined) => [
                        Number(value ?? 0).toFixed(3),
                        "Height (m)",
                      ]}
                      labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="height"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Flow Rate vs Timestamp
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={filteredTimeline}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "Flow Rate (m³/s)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11 },
                      }}
                      domain={chartFlowDomain}
                    />
                    <Tooltip
                      formatter={(value: number | string | undefined) => [
                        Number(value ?? 0).toFixed(3),
                        "Flow Rate (m³/s)",
                      ]}
                      labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                    />
                    <Line
                      type="monotone"
                      dataKey="flowRate"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone — Delete Canal */}
      <Card className="border-destructive/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="w-4 h-4" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Deactivating this canal will hide it from the dashboard and stop
            accepting new data from the IIMS device. This action can be reversed
            by reactivating it from the database.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete Canal
            </Button>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm font-medium">
                Type{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                  {canal.canalId}
                </code>{" "}
                to confirm deletion:
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={canal.canalId}
                className="max-w-sm font-mono text-sm"
              />
              {deleteError && (
                <p className="text-sm text-destructive">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={deleteConfirmText !== canal.canalId || deleting}
                  onClick={handleDeleteCanal}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Confirm Delete
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
