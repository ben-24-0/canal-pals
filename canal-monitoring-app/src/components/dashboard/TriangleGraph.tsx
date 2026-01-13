import React from "react";

interface TriangleGraphProps {
  values: [number, number, number];
  labels: [string, string, string];
  color?: string;
}

// Equilateral triangle, values 0-100 for each axis
export default function TriangleGraph({ values, labels, color = "#2323FF" }: TriangleGraphProps) {
  // Calculate points for the triangle
  const size = 200;
  const center = size / 2;
  const r = size * 0.42;
  // 3 vertices
  const points = [
    [center, center - r], // top
    [center - r * Math.sin(Math.PI / 3), center + r * Math.cos(Math.PI / 3)], // bottom left
    [center + r * Math.sin(Math.PI / 3), center + r * Math.cos(Math.PI / 3)], // bottom right
  ];
  // Calculate the inner point based on values (normalized)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const getPoint = (value: number, angle: number) => [
    center + (r * value / 100) * Math.sin(toRad(angle)),
    center - (r * value / 100) * Math.cos(toRad(angle)),
  ];
  const valuePoints = [
    getPoint(values[0], 0), // top
    getPoint(values[1], 120), // bottom left
    getPoint(values[2], 240), // bottom right
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Outer triangle */}
      <polygon
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={3}
      />
      {/* Value triangle */}
      <polygon
        points={valuePoints.map((p) => p.join(",")).join(" ")}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={2}
      />
      {/* Dots at vertices */}
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={5} fill={color} />
      ))}
      {/* Dots at value points */}
      {valuePoints.map((p, i) => (
        <circle key={i + 10} cx={p[0]} cy={p[1]} r={6} fill="#fff" stroke={color} strokeWidth={2} />
      ))}
      {/* Labels */}
      <text x={center} y={center - r - 12} textAnchor="middle" fontSize={14} fill={color} fontWeight="bold">
        {labels[0]}
      </text>
      <text x={center - r * Math.sin(Math.PI / 3) - 10} y={center + r * Math.cos(Math.PI / 3) + 18} textAnchor="end" fontSize={14} fill={color} fontWeight="bold">
        {labels[1]}
      </text>
      <text x={center + r * Math.sin(Math.PI / 3) + 10} y={center + r * Math.cos(Math.PI / 3) + 18} textAnchor="start" fontSize={14} fill={color} fontWeight="bold">
        {labels[2]}
      </text>
    </svg>
  );
}
