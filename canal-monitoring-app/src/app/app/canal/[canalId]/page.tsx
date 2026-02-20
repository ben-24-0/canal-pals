"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CanalInfo } from "@/types/canal";
import LiveFlowChart from "@/components/dashboard/LiveFlowChart";
import DailyAvgChart from "@/components/dashboard/DailyAvgChart";
import WeeklyBarChart from "@/components/dashboard/WeeklyBarChart";
import PredictionChart from "@/components/dashboard/PredictionChart";
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

interface MetricRowProps {
  label: string;
  value: string;
  icon: React.ElementType;
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
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
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
                label="Water Depth"
                value={
                  reading?.depth != null
                    ? `${reading.depth.toFixed(2)} m`
                    : reading?.waterLevel != null
                      ? `${Number(reading.waterLevel).toFixed(2)} m`
                      : "—"
                }
                icon={Droplets}
              />
              <MetricRow
                label="Velocity"
                value={
                  reading?.speed != null
                    ? `${reading.speed.toFixed(2)} m/s`
                    : "—"
                }
                icon={Activity}
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

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Flow Rate Analysis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="live">
            <TabsList className="mb-4">
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
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
            <TabsContent value="prediction">
              <PredictionChart canalId={canalId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
