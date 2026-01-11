"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { canalMetrics } from "../../data/canalMetrics";
import canals from "../../data/canals";

export default function DashboardPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const canalList = canals.features
    .map((f: any) => ({
      id: f.properties.id,
      name: f.properties.name,
      metrics: canalMetrics[f.properties.id],
    }))
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Canal Hub Dashboard</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Search canal..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border px-3 py-2 rounded w-64"
      />

      {/* Table */}
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Canal</th>
              <th>Status</th>
              <th>Flow Rate (m³/s)</th>
              <th>Speed (m/s)</th>
            </tr>
          </thead>
          <tbody>
            {canalList.map((canal) => (
              <tr
                key={canal.id}
                onClick={() => router.push(`/dashboard/${canal.id}`)}
                className="cursor-pointer hover:bg-gray-50"
              >
                <td className="p-3 font-medium">{canal.name}</td>
                <td>
                  <span
                    className={
                      canal.metrics.status === "FLOWING"
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {canal.metrics.status}
                  </span>
                </td>
                <td>{canal.metrics.flowRate}</td>
                <td>{canal.metrics.speed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
