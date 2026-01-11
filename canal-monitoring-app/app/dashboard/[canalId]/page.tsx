"use client";

import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import Navbar from "../../../src/components/Navbar";

import canals from "../../../src/data/canals";
import { canalTimeSeries } from "../../../src/data/canalTimeSeries";
import CanalMap from "../../../src/components/map/CanalMap";

export default function CanalDashboardPage() {
  const { canalId } = useParams();

  const canalFeature: any = canals.features.find(
    (f: any) => f.properties.id === canalId
  );

  const data = canalTimeSeries[canalId as string] || [];

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
      <div className="border rounded p-4">
        <h2 className="font-medium mb-4">Flow Rate vs Time</h2>

        <LineChart width={600} height={300} data={data}>
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line dataKey="flow" />
        </LineChart>
      </div>
    </div>
  );
}
