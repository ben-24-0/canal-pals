"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
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
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
      <Navbar />
      <div className="w-full max-w-5xl mx-auto px-4 pt-24 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-8 text-primary">Canal Hub Dashboard</h1>

        {/* Search */}
        <input
          type="text"
          placeholder="Search canal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-2 border-primary px-4 py-2 rounded-lg w-72 mb-8 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {/* Table */}
        <div className="w-full max-w-3xl bg-card rounded-xl shadow-lg border border-primary overflow-hidden">
          <table className="w-full text-md">
            <thead className="bg-primary text-white">
              <tr>
                <th className="p-4">Canal</th>
                <th>Status</th>
                <th>Discharge (m³/s)</th>
              </tr>
            </thead>
            <tbody>
              {canalList.map((canal) => (
                <tr
                  key={canal.id}
                  onClick={() => router.push(`/dashboard/${canal.id}`)}
                  className="cursor-pointer hover:bg-primary/10 transition"
                >
                  <td className="p-4 font-semibold text-primary flex items-center gap-2 group" title="Click for details">
                    {canal.name}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#2323FF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5 ml-1 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform"
                      aria-hidden="true"
                    >
                      <path d="M7 17L17 7" />
                      <path d="M7 7h10v10" />
                    </svg>
                  </td>
                  <td>
                    <span
                      className={
                        canal.metrics.status === "FLOWING"
                          ? "text-green-600 font-bold"
                          : "text-red-600 font-bold"
                      }
                    >
                      {canal.metrics.status}
                    </span>
                  </td>
                  <td className="text-center">{canal.metrics.speed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
