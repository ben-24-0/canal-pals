"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import canals from "../../data/canals";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const POLL_INTERVAL = 3000; // ms — match simulator frequency

type LiveMetric = {
  status: string;
  flowRate: number;
  speed: number;
  discharge: number;
  timestamp?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [liveMetrics, setLiveMetrics] = useState<Record<string, LiveMetric>>(
    {},
  );

  // Poll the backend buffer for live data
  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      try {
        const res = await fetch(`${API_BASE}/api/esp32/latest`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.canals) {
          setLiveMetrics(json.canals);
        }
      } catch {
        // backend may not be running yet — silently retry
      }
    }

    fetchMetrics(); // initial
    const id = setInterval(fetchMetrics, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const canalList = canals.features
    .map((f: any) => {
      const live = liveMetrics[f.properties.id];
      return {
        id: f.properties.id,
        name: f.properties.name,
        status: live?.status ?? "—",
        discharge: live?.discharge ?? "—",
        flowRate: live?.flowRate ?? "—",
        speed: live?.speed ?? "—",
        hasLive: !!live,
        timestamp: live?.timestamp,
      };
    })
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
      <Navbar />
      <div className="w-full max-w-5xl mx-auto px-4 pt-24 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-2 text-primary">
          Canal Hub Dashboard
        </h1>
        <p className="text-xs text-gray-500 mb-6">
          Live data from ESP32 sensors &middot; updates every{" "}
          {POLL_INTERVAL / 1000}s
        </p>

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
                <th className="p-4 text-left">Canal</th>
                <th>Status</th>
                <th>Flow (m³/s)</th>
                <th>Speed (m/s)</th>
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
                  <td
                    className="p-4 font-semibold text-primary flex items-center gap-2 group"
                    title="Click for details"
                  >
                    {/* live indicator dot */}
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        canal.hasLive
                          ? "bg-green-500 animate-pulse"
                          : "bg-gray-400"
                      }`}
                    />
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
                  <td className="text-center">
                    <span
                      className={
                        canal.status === "FLOWING"
                          ? "text-green-600 font-bold"
                          : canal.status === "STOPPED"
                            ? "text-red-600 font-bold"
                            : "text-yellow-600 font-bold"
                      }
                    >
                      {canal.status}
                    </span>
                  </td>
                  <td className="text-center">
                    {typeof canal.flowRate === "number"
                      ? canal.flowRate.toFixed(1)
                      : canal.flowRate}
                  </td>
                  <td className="text-center">
                    {typeof canal.speed === "number"
                      ? canal.speed.toFixed(2)
                      : canal.speed}
                  </td>
                  <td className="text-center">
                    {typeof canal.discharge === "number"
                      ? canal.discharge.toFixed(0)
                      : canal.discharge}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
