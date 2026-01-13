import React from "react";

interface CircularGaugeProps {
  value: number; // 0-100
  label: string;
  color?: string;
  unit?: string;
}

export default function CircularGauge({ value, label, color = "#2323FF", unit = "" }: CircularGaugeProps) {
  const size = 120;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - progress / 100);
  return (
    <div style={{ width: size, height: size, display: "inline-block" }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s" , padding:"20px"}}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.3em"
          fontSize="1.25em"
          fill={color}
          fontWeight="bold"
        >
          {value}
          {unit}
        </text>
      </svg>
      <div style={{ textAlign: "center", marginTop: 8, color, fontWeight: "bold" }}>{label}</div>
    </div>
  );
}
