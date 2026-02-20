"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { predictFlowRate } from "@/lib/prediction";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface Props {
  canalId: string;
}

interface PredictionPoint {
  label: string;
  actual?: number;
  predicted?: number;
}

export default function PredictionChart({ canalId }: Props) {
  const [data, setData] = useState<PredictionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndPredict = async () => {
      try {
        // Fetch last 24h of hourly data
        const res = await fetch(
          `${BACKEND_URL}/api/dashboard/timeseries/${canalId}?interval=hour&hours=24`,
        );
        let history: number[] = [];

        if (res.ok) {
          const json = await res.json();
          history = (json.data ?? json ?? []).map(
            (d: { avgFlowRate?: number; flowRate?: number }) =>
              d.avgFlowRate ?? d.flowRate ?? 0,
          );
        }

        // Fall back to random if no history
        if (history.length < 6) {
          history = Array.from(
            { length: 24 },
            () => +(8 + Math.random() * 6).toFixed(2),
          );
        }

        // Build past points
        const now = Date.now();
        const pastPoints: PredictionPoint[] = history.map((val, i) => ({
          label: new Date(
            now - (history.length - i) * 3_600_000,
          ).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          actual: val,
        }));

        // Generate predictions for next 6 hours
        const predicted = predictFlowRate(history, 6);
        const futurePoints: PredictionPoint[] = predicted.map((val, i) => ({
          label: new Date(now + (i + 1) * 3_600_000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          predicted: val,
        }));

        // Bridge point (last actual = first prediction start)
        const bridge: PredictionPoint = {
          label: pastPoints[pastPoints.length - 1]?.label ?? "",
          actual: pastPoints[pastPoints.length - 1]?.actual,
          predicted: pastPoints[pastPoints.length - 1]?.actual,
        };

        setData([...pastPoints.slice(0, -1), bridge, ...futurePoints]);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAndPredict();
  }, [canalId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground animate-pulse">
        Generating predictions…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Not enough data for prediction
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
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
        <ReferenceLine
          x={data.find((d) => d.predicted != null && d.actual != null)?.label}
          stroke="#94a3b8"
          strokeDasharray="4 4"
          label="Now"
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          name="Actual"
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="predicted"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          name="Predicted"
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
