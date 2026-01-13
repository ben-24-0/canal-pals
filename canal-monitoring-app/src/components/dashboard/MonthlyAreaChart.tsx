import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MonthlyAreaChartProps {
  data: { day: number | string; value: number }[];
  color?: string;
}

export default function MonthlyAreaChart({ data, color = "#2323FF" }: MonthlyAreaChartProps) {
  // Detect if data is hourly (24h) by checking if day is a string with ":"
  const isHourly = data.length > 0 && typeof data[0].day === "string" && data[0].day.includes(":");
  return (
    <div className="w-full h-75 bg-card rounded-xl shadow border border-primary p-4">
      <h2 className="font-semibold text-lg mb-2 text-primary">Monthly Summary</h2>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" stroke={color} fontSize={12} interval={isHourly ? 2 : 0} />
          <YAxis stroke={color} fontSize={12} />
          <Tooltip contentStyle={{ background: "#fff", borderColor: color, color: color }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill="url(#colorArea)"
            strokeWidth={2}
            dot={{ r: 3, stroke: color, strokeWidth: 2, fill: "#fff" }}
            activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
