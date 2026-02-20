"use client";

import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useCanalSSE } from "@/hooks/useCanalSSE";

interface Point {
  time: string;
  flowRate: number;
  speed: number | null;
}

const MAX_POINTS = 60;

export default function LiveFlowChart({ canalId }: { canalId: string }) {
  const { reading } = useCanalSSE(canalId);
  const [data, setData] = useState<Point[]>([]);
  const prevTs = useRef<string | null>(null);

  useEffect(() => {
    if (!reading || reading.timestamp === prevTs.current) return;
    prevTs.current = reading.timestamp;

    const t = new Date(reading.timestamp);
    const label = t.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setData((prev) => {
      const next = [
        ...prev,
        {
          time: label,
          flowRate: reading.flowRate ?? 0,
          speed: reading.speed ?? null,
        },
      ];
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
    });
  }, [reading]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Waiting for live data…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
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
        <Line
          type="monotone"
          dataKey="flowRate"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          name="Flow Rate"
        />
        <Line
          type="monotone"
          dataKey="speed"
          stroke="#f59e0b"
          strokeWidth={1.5}
          dot={false}
          name="Velocity"
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
