"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Gauge, Settings2, Info, BarChart3, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CanalInfo } from "@/types/canal";
import LiveFlowChart from "@/components/dashboard/LiveFlowChart";
import DailyAvgChart from "@/components/dashboard/DailyAvgChart";
import WeeklyBarChart from "@/components/dashboard/WeeklyBarChart";
import PredictionChart from "@/components/dashboard/PredictionChart";
import DepthReadingsChart from "@/components/dashboard/DepthReadingsChart";
import { useCanalSSE } from "@/hooks/useCanalSSE";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("@/components/map/MiniMap"), {
  ssr: false,
});

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function AdminCanalDashboard() {
  const params = useParams();
  const canalId = params.canalId as string;

  const [canal, setCanal] = useState<CanalInfo | null>(null);
  const [loading, setLoading] = useState(true);

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

  // ─── Editable Settings State ─────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
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
        ...(editForm.shape !== "circle" && editForm.b ? { b: parseFloat(editForm.b) } : {}),
        ...(editForm.shape === "trapezoid" && editForm.z ? { z: parseFloat(editForm.z) } : {}),
        ...(editForm.shape === "circle" && editForm.D ? { D: parseFloat(editForm.D) } : {}),
        ...(editForm.depthMax ? { depthMax: parseFloat(editForm.depthMax) } : {}),
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
      // Re-fetch canal to show updated values
      fetchCanal();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
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
  const statusCfg = STATUS_CONFIG[status];
  const lastUpdated = reading?.timestamp
    ? formatDistanceToNow(new Date(reading.timestamp), { addSuffix: true })
    : "Never";
  const [lon, lat] = canal.location.coordinates;
  const mp = canal.manningsParams;

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
        <Badge variant="outline" className="text-amber-600 border-amber-400">
          Admin View
        </Badge>
      </div>

      {/* Top info row: metrics + map */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Gauge className="w-4 h-4" /> Live Metrics
              </CardTitle>
              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <Row
                label="Flow Rate"
                value={
                  reading?.flowRate != null
                    ? `${reading.flowRate.toFixed(4)} m³/s`
                    : "—"
                }
              />
              <Row
                label="Depth"
                value={
                  reading?.depth != null
                    ? `${reading.depth.toFixed(3)} m`
                    : reading?.waterLevel != null
                      ? `${Number(reading.waterLevel).toFixed(3)} m`
                      : "—"
                }
              />
              <Row
                label="Velocity"
                value={
                  reading?.speed != null
                    ? `${reading.speed.toFixed(4)} m/s`
                    : "—"
                }
              />
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
                label="Temperature"
                value={
                  reading?.temperature != null
                    ? `${reading.temperature.toFixed(1)} °C`
                    : "—"
                }
              />
              <Row
                label="pH"
                value={reading?.pH != null ? reading.pH.toFixed(1) : "—"}
              />
              <Row
                label="Turbidity"
                value={
                  reading?.turbidity != null
                    ? `${reading.turbidity.toFixed(1)} NTU`
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
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Row label="Last updated" value={lastUpdated} />
              <Row
                label="Sensor"
                value={<span className="capitalize">{canal.sensorType}</span>}
              />
              <Row
                label="Lon/Lat"
                value={
                  <span className="font-mono">
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
                <Row label="Depth offset" value={`${canal.depthOffset} m`} />
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
              label="ESP32 Device"
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

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Flow Rate Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="live">
            <TabsList className="mb-4 flex-wrap gap-y-1">
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="depth">Depth</TabsTrigger>
              <TabsTrigger value="prediction">Prediction</TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              <LiveFlowChart canalId={canalId} />
            </TabsContent>
            <TabsContent value="24h">
              <DailyAvgChart canalId={canalId} interval="hour" hours={24} />
            </TabsContent>
            <TabsContent value="weekly">
              <WeeklyBarChart canalId={canalId} />
            </TabsContent>
            <TabsContent value="depth">
              <DepthReadingsChart canalId={canalId} />
            </TabsContent>
            <TabsContent value="prediction">
              <PredictionChart canalId={canalId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
