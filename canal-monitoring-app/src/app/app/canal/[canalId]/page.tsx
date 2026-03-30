"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Droplets,
  Gauge,
  Thermometer,
  Battery,
  Wifi,
  Activity,
  BarChart3,
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
import type { CanalInfo, CanalReading } from "@/types/canal";
import { useCanalSSE } from "@/hooks/useCanalSSE";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
});

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const DEFAULT_SEND_INTERVAL_MS = 30 * 60 * 1000;
const OFFLINE_EXTRA_BUFFER_MS = 2 * 60 * 1000;

function getReadingTimestampMs(reading: CanalReading | null): number {
  if (!reading) return 0;
  if (reading.timestamp) {
    const ts = new Date(reading.timestamp).getTime();
    if (Number.isFinite(ts) && ts > 0) return ts;
  }
  if (reading.receivedAt) {
    const ts = new Date(reading.receivedAt).getTime();
    if (Number.isFinite(ts) && ts > 0) return ts;
  }
  return 0;
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  FLOWING: { label: "Active", variant: "default" },
  LOW_FLOW: { label: "Low Flow", variant: "secondary" },
  HIGH_FLOW: { label: "High Flow", variant: "destructive" },
  BLOCKED: { label: "Blocked", variant: "destructive" },
  STOPPED: { label: "Offline", variant: "outline" },
  ERROR: { label: "Error", variant: "destructive" },
};

interface MetricRowProps {
  label: string;
  value: string;
  icon: React.ElementType;
}

interface TimelinePoint {
  timestamp: number;
  label: string;
  iso: string;
  height: number;
  flowRate: number;
}

type GraphRangeMode = "3days" | "week" | "month";

function getRangeStartMs(mode: GraphRangeMode): number {
  const now = Date.now();
  if (mode === "week") return now - 7 * 24 * 60 * 60 * 1000;
  if (mode === "month") return now - 30 * 24 * 60 * 60 * 1000;
  return now - 3 * 24 * 60 * 60 * 1000;
}

function resolveReadingTime(
  reading: {
    timestamp?: string | number | Date;
    receivedAt?: string | number | Date;
    createdAt?: string | number | Date;
  } | null,
): number | null {
  if (!reading) return null;

  const candidates = [reading.receivedAt, reading.timestamp, reading.createdAt];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }

  return null;
}
function MetricRow({ label, value, icon: Icon }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {label}
      </div>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function UserCanalDashboard() {
  const params = useParams();
  const canalId = params.canalId as string;

  const [canal, setCanal] = useState<CanalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [polledReading, setPolledReading] = useState<CanalReading | null>(null);
  const [appliedIntervalMs, setAppliedIntervalMs] = useState(
    DEFAULT_SEND_INTERVAL_MS,
  );
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [graphRangeMode, setGraphRangeMode] =
    useState<GraphRangeMode>("3days");

  // SSE: live reading without polling
  const { reading, connected } = useCanalSSE(canalId);

  const activeReading = useMemo(() => {
    const sseTs = getReadingTimestampMs(reading);
    const pollTs = getReadingTimestampMs(polledReading);
    return sseTs >= pollTs ? reading : polledReading;
  }, [reading, polledReading]);

  const fetchCanal = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/canals/${canalId}`);
      if (res.ok) {
        const j = await res.json();
        setCanal(j.canal ?? j);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [canalId]);

  const fetchLatestReading = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/esp32/latest/${canalId}`);
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (body?.reading) {
        setPolledReading(body.reading as CanalReading);
      }
    } catch (err) {
      console.error(err);
    }
  }, [canalId]);

  const fetchDeviceSettings = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/esp32/settings/${canalId}`);
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      const effectiveInterval = Number(body?.effectiveSendIntervalMs);
      const remoteInterval = Number(body?.settings?.sendIntervalMs);
      const fallbackInterval = Number(body?.fallbackSendIntervalMs);

      const targetInterval =
        Number.isFinite(effectiveInterval) && effectiveInterval > 0
          ? effectiveInterval
          : Number.isFinite(remoteInterval) && remoteInterval > 0
          ? remoteInterval
          : Number.isFinite(fallbackInterval) && fallbackInterval > 0
            ? fallbackInterval
            : DEFAULT_SEND_INTERVAL_MS;

      setAppliedIntervalMs(targetInterval);
    } catch (err) {
      console.error(err);
    }
  }, [canalId]);

  useEffect(() => {
    fetchCanal();
    fetchLatestReading();
    fetchDeviceSettings();
  }, [fetchCanal, fetchLatestReading, fetchDeviceSettings]);

  useEffect(() => {
    if (!canalId) return;
    const timer = setInterval(() => {
      fetchCanal();
      fetchLatestReading();
      fetchDeviceSettings();
    }, 10000);
    return () => clearInterval(timer);
  }, [canalId, fetchCanal, fetchLatestReading, fetchDeviceSettings]);

  useEffect(() => {
    if (!reading) return;

    const time =
      resolveReadingTime(
        reading as {
          timestamp?: string | number | Date;
          receivedAt?: string | number | Date;
          createdAt?: string | number | Date;
        },
      ) ?? Date.now();
    const heightRaw =
      reading.height ?? reading.depth ?? Number(reading.waterLevel ?? 0);
    const flowRaw = reading.flowRate ?? 0;

    if (!Number.isFinite(heightRaw) || !Number.isFinite(flowRaw)) return;

    const date = new Date(time);
    const point: TimelinePoint = {
      timestamp: time,
      label: date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      iso: date.toISOString(),
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
      return next.length > 180 ? next.slice(-180) : next;
    });
  }, [reading]);

  const filteredTimeline = useMemo(() => {
    const startMs = getRangeStartMs(graphRangeMode);
    return timeline.filter((point) => point.timestamp >= startMs);
  }, [timeline, graphRangeMode]);

  const status = activeReading?.status ?? "STOPPED";
  const statusCfg = STATUS_CONFIG[status];
  const lastUpdated = activeReading?.timestamp
    ? formatDistanceToNow(new Date(activeReading.timestamp), {
        addSuffix: true,
      })
    : "Never";
  const currentHeight =
    activeReading?.height ??
    activeReading?.depth ??
    (activeReading?.waterLevel != null
      ? Number(activeReading.waterLevel)
      : null);
  const heightMeasuredAt = activeReading?.timestamp
    ? new Date(activeReading.timestamp).toLocaleString()
    : activeReading?.receivedAt
      ? new Date(activeReading.receivedAt).toLocaleString()
      : "Waiting for reading";
  const [lon, lat] = canal?.location.coordinates ?? [0, 0];

  // Health score: status 40% + battery 30% + signal 30%
  const statusScore =
    status === "FLOWING" ? 40 : status === "LOW_FLOW" ? 25 : 0;
  const battScore =
    activeReading?.batteryLevel != null
      ? (activeReading.batteryLevel / 100) * 30
      : 15;
  const sigScore =
    activeReading?.signalStrength != null
      ? Math.max(0, ((activeReading.signalStrength + 120) / 70) * 30)
      : 15;
  const healthScore = Math.round(statusScore + battScore + sigScore);
  const ts = getReadingTimestampMs(activeReading);
  const offlineThresholdMs = appliedIntervalMs + OFFLINE_EXTRA_BUFFER_MS;
  const deviceOnline =
    Number.isFinite(ts) && ts > 0
      ? Date.now() - ts <= offlineThresholdMs
      : false;

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page heading */}
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

      {/* Top info row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Metrics Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Metrics</CardTitle>
              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            </div>
            <div className="pt-1">
              <Badge variant={deviceOnline ? "default" : "outline"}>
                Device {deviceOnline ? "Online" : "Offline"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-md border border-blue-200/70 bg-blue-50/60 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold">
                Live Height
              </p>
              <p className="text-2xl font-bold leading-tight water-level-gradient">
                {currentHeight != null ? `${currentHeight.toFixed(2)} m` : "—"}
              </p>
              <p className="text-[11px] text-blue-800/90 mt-0.5">
                Measured at: {heightMeasuredAt}
              </p>
            </div>

            <div className="divide-y divide-border">
              <MetricRow
                label="Water Height"
                value={
                  activeReading?.height != null
                    ? `${activeReading.height.toFixed(2)} m`
                    : activeReading?.depth != null
                      ? `${activeReading.depth.toFixed(2)} m`
                      : activeReading?.waterLevel != null
                        ? `${Number(activeReading.waterLevel).toFixed(2)} m`
                        : "—"
                }
                icon={Droplets}
              />
              <MetricRow
                label="Manning Velocity"
                value={
                  activeReading?.speed != null
                    ? `${activeReading.speed.toFixed(2)} m/s`
                    : "—"
                }
                icon={Activity}
              />
              <MetricRow
                label="Flow Rate"
                value={
                  activeReading?.flowRate != null
                    ? `${activeReading.flowRate.toFixed(2)} m³/s`
                    : "—"
                }
                icon={Gauge}
              />
              <MetricRow
                label="Sensor Distance"
                value={
                  activeReading?.rawDistance != null
                    ? `${Number(activeReading.rawDistance).toFixed(1)} cm`
                    : "—"
                }
                icon={Gauge}
              />
              <MetricRow
                label="Temperature"
                value={
                  activeReading?.temperature != null
                    ? `${activeReading.temperature.toFixed(1)} °C`
                    : "—"
                }
                icon={Thermometer}
              />
              <MetricRow
                label="Battery"
                value={
                  activeReading?.batteryLevel != null
                    ? `${activeReading.batteryLevel.toFixed(0)}%`
                    : "—"
                }
                icon={Battery}
              />
              <MetricRow
                label="Signal"
                value={
                  activeReading?.signalStrength != null
                    ? `${activeReading.signalStrength} dBm`
                    : "—"
                }
                icon={Wifi}
              />
            </div>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">
                  Last updated
                </span>
                <p>{lastUpdated}</p>
              </div>
              <div>
                <span className="font-medium text-foreground">Coordinates</span>
                <p className="font-mono">
                  {lat.toFixed(4)}, {lon.toFixed(4)}
                </p>
              </div>
              <div>
                <span className="font-medium text-foreground">Sensor</span>
                <p className="capitalize">{canal.sensorType}</p>
              </div>
              <div>
                <span className="font-medium text-foreground">Health</span>
                <p>{healthScore}/100</p>
              </div>
            </div>

            <Separator className="my-3" />
            <div>
              <p className="text-sm font-medium text-foreground mb-2">
                Recent Live Readings
              </p>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">
                        Timestamp
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        Height (m)
                      </th>
                      <th className="text-right px-3 py-2 font-medium">
                        Flow Rate (m³/s)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTimeline.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-3 text-muted-foreground"
                          colSpan={3}
                        >
                          Waiting for live readings...
                        </td>
                      </tr>
                    ) : (
                      filteredTimeline
                        .slice(-10)
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
            </div>
          </CardContent>
        </Card>

        {/* Mini Map */}
        <Card className="overflow-hidden min-h-65">
          <CardContent className="p-0 h-full min-h-65">
            <MiniMap
              canals={[
                {
                  canalId: canal.canalId,
                  name: canal.name,
                  coordinates: canal.location.coordinates,
                  status,
                  flowRate: activeReading?.flowRate ?? null,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Water Trend Analysis</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={graphRangeMode === "3days" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setGraphRangeMode("3days")}
              >
                3 Days
              </Badge>
              <Badge
                variant={graphRangeMode === "week" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setGraphRangeMode("week")}
              >
                Week
              </Badge>
              <Badge
                variant={graphRangeMode === "month" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setGraphRangeMode("month")}
              >
                Month
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTimeline.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              Waiting for live data to render charts...
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold mb-2">Height vs Time</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={filteredTimeline}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 3]}
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "Height (m)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 11 },
                      }}
                    />
                    <Tooltip
                      formatter={(value: number | string | undefined) => [
                        Number(value ?? 0).toFixed(3),
                        "Height (m)",
                      ]}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0]?.payload?.timestamp) {
                          return new Date(
                            payload[0].payload.timestamp,
                          ).toLocaleString();
                        }
                        return "";
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="height"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                      name="Height"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Flow Rate vs Time
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={filteredTimeline}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="label"
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
                    />
                    <Tooltip
                      formatter={(value: number | string | undefined) => [
                        Number(value ?? 0).toFixed(3),
                        "Flow Rate (m³/s)",
                      ]}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0]?.payload?.timestamp) {
                          return new Date(
                            payload[0].payload.timestamp,
                          ).toLocaleString();
                        }
                        return "";
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="flowRate"
                      stroke="#0284c7"
                      strokeWidth={2}
                      dot={false}
                      name="Flow Rate"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
