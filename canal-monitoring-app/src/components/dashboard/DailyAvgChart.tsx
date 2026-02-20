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
  interval?: "hour" | "minute";
  hours?: number;
}

interface Point {
  label: string;
  avgFlowRate: number;
}

export default function DailyAvgChart({
  canalId,
  interval = "hour",
  hours = 24,
}: Props) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/dashboard/timeseries/${canalId}?interval=${interval}&hours=${hours}`,
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        const points: Point[] = (json.data ?? json ?? []).map(
          (d: {
            _id?: string;
            timestamp?: string;
            avgFlowRate?: number;
            flowRate?: number;
          }) => ({
            label: new Date(d._id ?? d.timestamp ?? "").toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            avgFlowRate: d.avgFlowRate ?? d.flowRate ?? 0,
          }),
        );
        setData(points);
      } catch {
        // Generate placeholder data
        const now = Date.now();
        const pts: Point[] = Array.from({ length: hours }, (_, i) => {
          const t = new Date(now - (hours - i) * 3600_000);
          return {
            label: t.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            avgFlowRate: +(8 + Math.random() * 6).toFixed(2),
          };
        });
        setData(pts);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [canalId, interval, hours]);

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
          <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor="hsl(var(--primary))"
              stopOpacity={0}
            />
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
            value: "m³/s",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 11 },
          }}
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
          dataKey="avgFlowRate"
          stroke="hsl(var(--primary))"
          fill="url(#flowGrad)"
          strokeWidth={2}
          name="Avg Flow Rate"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
