"use client";

import { useParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import Navbar from "../../../src/components/Navbar";

import canals from "../../../src/data/canals";
import { canalTimeSeries } from "../../../src/data/canalTimeSeries";
import CanalMap from "../../../src/components/map/CanalMap";

export default function CanalDashboardPage() {
  const { canalId } = useParams();
  const rawCanalId = canalId;
  const resolvedCanalId = Array.isArray(rawCanalId)
    ? rawCanalId[0]
    : rawCanalId;

  const canalFeature = canals.features.find(
    (f) => f.properties.id === resolvedCanalId
  );



  const data = canalTimeSeries[canalId as string] || [];
  console.log("Resolved canalId:", resolvedCanalId);
  console.log("Chart data:", data);

  return (
    <div className="p-6 space-y-6">
      <Navbar />
      <h1 className="text-xl font-semibold">{canalFeature?.properties.name}</h1>

      {/* Map */}
      <div className="h-[40vh] border rounded">
        <CanalMap
          focus={{
            longitude: canalFeature.geometry.coordinates[0],
            latitude: canalFeature.geometry.coordinates[1],
            zoom: 15,
          }}
        />
      </div>

      {/* Chart */}
      <div className="border rounded p-4 h-[350px]">
        <h2 className="font-medium mb-4">Flow Rate vs Time</h2>

        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="flow"
              stroke="#2563eb"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
