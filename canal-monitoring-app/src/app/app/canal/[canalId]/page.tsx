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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { CanalInfo } from "@/types/canal";
import { useCanalSSE } from "@/hooks/useCanalSSE";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
});

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://canal-pals.onrender.com";

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

function resolveReadingTime(reading: {
  timestamp?: string | number | Date;
  receivedAt?: string | number | Date;
  createdAt?: string | number | Date;
} | null): number | null {
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    apn: "",
    gprsUser: "",
    gprsPass: "",
    sendIntervalMs: "",
    maxMqttFailures: "",
    otaCheckIntervalMs: "",
    otaToken: "",
  });
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);

  // SSE: live reading without polling
  const { reading, connected } = useCanalSSE(canalId);

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

  useEffect(() => {
    fetchCanal();
  }, [fetchCanal]);

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
    const heightRaw = reading.height ?? reading.depth ?? Number(reading.waterLevel ?? 0);
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

  const status = reading?.status ?? "STOPPED";
  const statusCfg = STATUS_CONFIG[status];
  const latestReadingTs =
    resolveReadingTime(reading as { timestamp?: string; receivedAt?: string } | null) ??
    timeline[timeline.length - 1]?.timestamp ??
    null;
  const lastUpdated = latestReadingTs
    ? formatDistanceToNow(new Date(latestReadingTs), { addSuffix: true })
    : "Never";
  const [lon, lat] = canal?.location.coordinates ?? [0, 0];

  // Health score: status 40% + battery 30% + signal 30%
  const statusScore =
    status === "FLOWING" ? 40 : status === "LOW_FLOW" ? 25 : 0;
  const battScore =
    reading?.batteryLevel != null ? (reading.batteryLevel / 100) * 30 : 15;
  const sigScore =
    reading?.signalStrength != null
      ? Math.max(0, ((reading.signalStrength + 120) / 70) * 30)
      : 15;
  const healthScore = Math.round(statusScore + battScore + sigScore);
  const deviceOnline =
    connected ||
    (latestReadingTs != null ? Date.now() - latestReadingTs <= 10 * 60 * 1000 : false);
  const currentHeight =
    reading?.height ?? reading?.depth ?? (reading?.waterLevel != null ? Number(reading.waterLevel) : null);
  const heightMeasuredAt = latestReadingTs
    ? new Date(latestReadingTs).toLocaleString()
    : "Waiting for reading";

  const predictionData = useMemo(() => {
    if (timeline.length === 0) return [];

    const past = timeline.slice(-12).map((p) => ({
      timestamp: p.timestamp,
      label: p.label,
      actualHeight: p.height,
      predictedHeight: undefined as number | undefined,
    }));

    if (past.length < 2) return past;

    const deltas = past
      .slice(1)
      .map((p, i) => p.actualHeight - (past[i].actualHeight ?? 0));
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

    const intervals = past
      .slice(1)
      .map((p, i) => p.timestamp - past[i].timestamp)
      .filter((ms) => Number.isFinite(ms) && ms > 0);
    const avgIntervalMs =
      intervals.length > 0
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : 60_000;

    const latest = past[past.length - 1];
    const bridge = {
      ...latest,
      predictedHeight: latest.actualHeight,
    };

    const future = Array.from({ length: 6 }, (_, i) => {
      const ts = latest.timestamp + avgIntervalMs * (i + 1);
      const val = Math.max(0, latest.actualHeight + avgDelta * (i + 1));
      const d = new Date(ts);
      return {
        timestamp: ts,
        label: d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        actualHeight: undefined,
        predictedHeight: +val.toFixed(3),
      };
    });

    return [...past.slice(0, -1), bridge, ...future];
  }, [timeline]);

  const publishSettings = useCallback(
    async (extras?: Record<string, unknown>) => {
      if (!canal) return;

      const payload: Record<string, unknown> = { ...extras };
      const map: Array<[keyof typeof settingsForm, string]> = [
        ["apn", "apn"],
        ["gprsUser", "gprsUser"],
        ["gprsPass", "gprsPass"],
        ["otaToken", "otaToken"],
      ];

      for (const [k, out] of map) {
        const v = settingsForm[k].trim();
        if (v.length > 0) payload[out] = v;
      }

      const intMap: Array<[keyof typeof settingsForm, string]> = [
        ["sendIntervalMs", "sendIntervalMs"],
        ["maxMqttFailures", "maxMqttFailures"],
        ["otaCheckIntervalMs", "otaCheckIntervalMs"],
      ];

      for (const [k, out] of intMap) {
        const raw = settingsForm[k].trim();
        if (!raw) continue;
        const n = Number(raw);
        if (Number.isFinite(n)) payload[out] = n;
      }

      if (Object.keys(payload).length === 0) {
        setSettingsMsg("Add at least one setting to publish.");
        return;
      }

      setSavingSettings(true);
      setSettingsMsg(null);

      try {
        const res = await fetch(`${BACKEND_URL}/api/esp32/settings/${canal.canalId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSettingsMsg(j?.message || "Failed to publish settings.");
          return;
        }

        setSettingsMsg("Settings published to device topic.");
      } catch {
        setSettingsMsg("Failed to publish settings.");
      } finally {
        setSavingSettings(false);
      }
    },
    [canal, settingsForm],
  );

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
              <p className="text-2xl font-bold text-blue-900 leading-tight">
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
                  reading?.height != null
                    ? `${reading.height.toFixed(2)} m`
                    : reading?.depth != null
                      ? `${reading.depth.toFixed(2)} m`
                      : reading?.waterLevel != null
                        ? `${Number(reading.waterLevel).toFixed(2)} m`
                        : "—"
                }
                icon={Droplets}
              />
              <MetricRow
                label="Manning Velocity"
                value={
                  reading?.speed != null
                    ? `${reading.speed.toFixed(2)} m/s`
                    : "—"
                }
                icon={Activity}
              />
              <MetricRow
                label="Flow Rate"
                value={
                  reading?.flowRate != null
                    ? `${reading.flowRate.toFixed(2)} m³/s`
                    : "—"
                }
                icon={Gauge}
              />
              <MetricRow
                label="Sensor Distance"
                value={
                  reading?.rawDistance != null
                    ? `${Number(reading.rawDistance).toFixed(1)} cm`
                    : "—"
                }
                icon={Gauge}
              />
              <MetricRow
                label="Temperature"
                value={
                  reading?.temperature != null
                    ? `${reading.temperature.toFixed(1)} °C`
                    : "—"
                }
                icon={Thermometer}
              />
              <MetricRow
                label="Battery"
                value={
                  reading?.batteryLevel != null
                    ? `${reading.batteryLevel.toFixed(0)}%`
                    : "—"
                }
                icon={Battery}
              />
              <MetricRow
                label="Signal"
                value={
                  reading?.signalStrength != null
                    ? `${reading.signalStrength} dBm`
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
                      <th className="text-left px-3 py-2 font-medium">Timestamp</th>
                      <th className="text-right px-3 py-2 font-medium">Height (m)</th>
                      <th className="text-right px-3 py-2 font-medium">Flow Rate (m³/s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-muted-foreground" colSpan={3}>
                          Waiting for live readings...
                        </td>
                      </tr>
                    ) : (
                      timeline
                        .slice(-10)
                        .reverse()
                        .map((row) => (
                          <tr key={`${row.timestamp}-${row.flowRate}`} className="border-t">
                            <td className="px-3 py-2">{new Date(row.timestamp).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono">{row.height.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right font-mono">{row.flowRate.toFixed(3)}</td>
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
                  flowRate: reading?.flowRate ?? null,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Device Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="APN"
              value={settingsForm.apn}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, apn: e.target.value }))
              }
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="GPRS User"
              value={settingsForm.gprsUser}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, gprsUser: e.target.value }))
              }
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="GPRS Password"
              value={settingsForm.gprsPass}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, gprsPass: e.target.value }))
              }
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="OTA Token"
              value={settingsForm.otaToken}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, otaToken: e.target.value }))
              }
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Send Interval ms (1000..3600000)"
              value={settingsForm.sendIntervalMs}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, sendIntervalMs: e.target.value }))
              }
            />
            <input
              className="border rounded-md px-3 py-2 text-sm"
              placeholder="Max MQTT Failures (1..100)"
              value={settingsForm.maxMqttFailures}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, maxMqttFailures: e.target.value }))
              }
            />
            <input
              className="border rounded-md px-3 py-2 text-sm md:col-span-2"
              placeholder="OTA Check Interval ms (300000..86400000)"
              value={settingsForm.otaCheckIntervalMs}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, otaCheckIntervalMs: e.target.value }))
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="px-3 py-2 rounded-md border text-sm"
              onClick={() => publishSettings()}
              disabled={savingSettings}
            >
              {savingSettings ? "Publishing..." : "Publish Settings"}
            </button>
            <button
              className="px-3 py-2 rounded-md border text-sm"
              onClick={() => publishSettings({ forceReadNow: true })}
              disabled={savingSettings}
            >
              Force Read Now
            </button>
            <button
              className="px-3 py-2 rounded-md border text-sm"
              onClick={() => publishSettings({ registerNow: true })}
              disabled={savingSettings}
            >
              Register Now
            </button>
            <button
              className="px-3 py-2 rounded-md border text-sm text-red-600"
              onClick={() => publishSettings({ reboot: true })}
              disabled={savingSettings}
            >
              Reboot Device
            </button>
          </div>

          {settingsMsg ? (
            <p className="mt-3 text-sm text-muted-foreground">{settingsMsg}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Water Trend Analysis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              Waiting for live data to render charts...
            </div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold mb-2">Height vs Time</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
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
                      formatter={(value: number) => [value.toFixed(3), "Height (m)"]}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0]?.payload?.timestamp) {
                          return new Date(payload[0].payload.timestamp).toLocaleString();
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
                <h3 className="text-sm font-semibold mb-2">Flow Rate vs Time</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
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
                      formatter={(value: number) => [value.toFixed(3), "Flow Rate (m³/s)"]}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0]?.payload?.timestamp) {
                          return new Date(payload[0].payload.timestamp).toLocaleString();
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

              <div>
                <h3 className="text-sm font-semibold mb-2">Predicted Height Rise</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={predictionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
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
                      formatter={(value: number, name: string) => [
                        value.toFixed(3),
                        name === "predictedHeight" ? "Predicted Height (m)" : "Actual Height (m)",
                      ]}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0]?.payload?.timestamp) {
                          return new Date(payload[0].payload.timestamp).toLocaleString();
                        }
                        return "";
                      }}
                    />
                    <ReferenceLine
                      x={predictionData.find((d) => d.predictedHeight != null && d.actualHeight != null)?.label}
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      label="Now"
                    />
                    <Line
                      type="monotone"
                      dataKey="actualHeight"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      name="actualHeight"
                    />
                    <Line
                      type="monotone"
                      dataKey="predictedHeight"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      connectNulls={false}
                      name="predictedHeight"
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
