"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface Props {
  canalId: string;
}

interface DepthPoint {
  label: string;
  depth: number;
}

export default function DepthReadingsChart({ canalId }: Props) {
  const [data, setData] = useState<DepthPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/dashboard/timeseries/${canalId}?interval=hour&hours=24`,
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        const points: DepthPoint[] = (json.data ?? json ?? []).map(
          (d: {
            _id?: string;
            timestamp?: string;
            avgDepth?: number;
            depth?: number;
            waterLevel?: number;
          }) => ({
            label: new Date(d._id ?? d.timestamp ?? "").toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            depth: d.avgDepth ?? d.depth ?? d.waterLevel ?? 0,
          }),
        );
        setData(points);
      } catch {
        // Placeholder data
        const now = Date.now();
        const pts: DepthPoint[] = Array.from({ length: 24 }, (_, i) => {
          const t = new Date(now - (24 - i) * 3600_000);
          return {
            label: t.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            depth: +(1.0 + Math.random() * 0.8).toFixed(3),
          };
        });
        setData(pts);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [canalId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground animate-pulse">
        Loading…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          label={{
            value: "m",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 11 },
          }}
          domain={[0, "auto"]}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="depth"
          stroke="#3b82f6"
          fill="url(#depthGrad)"
          strokeWidth={2}
          name="Depth"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
