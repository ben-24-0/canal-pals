"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import Navbar from "../../../components/Navbar";

import canals from "../../../data/canals";
import CanalMap from "../../../components/map/CanalMap";
import CircularGauge from "../../../components/dashboard/CircularGauge";
import MonthlyAreaChart from "../../../components/dashboard/MonthlyAreaChart";
import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Footer from "../../../components/Footer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const POLL_INTERVAL = 3000; // ms

type LiveReading = {
  status: string;
  flowRate: number;
  speed: number;
  discharge: number;
  waterLevel?: number;
  temperature?: number;
  pH?: number;
  batteryLevel?: number;
  signalStrength?: number;
  timestamp?: string;
};

export default function CanalDashboardPage() {
  const { canalId } = useParams();
  const resolvedCanalId = Array.isArray(canalId) ? canalId[0] : canalId;

  const canalFeature = canals.features.find(
    (f) => f.properties.id === resolvedCanalId,
  );

  // ── Live data from backend buffer ────────────────────────────────
  const [live, setLive] = useState<LiveReading | null>(null);
  // Keep a rolling history for the trend chart (last ~200 readings)
  const historyRef = useRef<{ time: string; value: number }[]>([]);
  const [trendData, setTrendData] = useState<{ day: string; value: number }[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchLive() {
      try {
        const res = await fetch(
          `${API_BASE}/api/esp32/latest/${resolvedCanalId}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const r: LiveReading = json.reading;
        setLive(r);

        // Append to rolling history
        const now = new Date();
        const label = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        historyRef.current = [
          ...historyRef.current.slice(-199),
          { time: label, value: r.discharge },
        ];
        setTrendData(
          historyRef.current.map((h) => ({ day: h.time, value: h.value })),
        );
      } catch {
        // silent
      }
    }

    fetchLive();
    const id = setInterval(fetchLive, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [resolvedCanalId]);

  // ── Derived values ───────────────────────────────────────────────
  const liveDischarge = live?.discharge ?? 0;
  const battery = live?.batteryLevel ?? 0;
  const signal = live?.signalStrength ?? 0;
  const systemStatus = live ? "Online" : "Offline";
  const lastUpdated = live?.timestamp
    ? new Date(live.timestamp).toLocaleString()
    : "—";

  const canalLocation = canalFeature?.geometry?.coordinates
    ? `Lat: ${canalFeature.geometry.coordinates[1].toFixed(4)}, Lon: ${canalFeature.geometry.coordinates[0].toFixed(4)}`
    : "Unknown";

  // Flow health
  const optimal_threshold = 500;
  const minimum_threshold = 200;
  let flowHealth = "Good";
  let flowHealthColor = "#22C55E";
  if (liveDischarge < minimum_threshold) {
    flowHealth = "Low";
    flowHealthColor = "#FF4D4F";
  } else if (liveDischarge < optimal_threshold) {
    flowHealth = "Moderate";
    flowHealthColor = "#FFB020";
  }

  const canalStatus = live?.status ?? "STOPPED";
  const showLiveFlow = canalStatus !== "STOPPED";

  // Rolling averages from history
  const histLen = historyRef.current.length;
  const dailyAvg =
    histLen > 0
      ? Math.round(
          historyRef.current.reduce((s, h) => s + h.value, 0) / histLen,
        )
      : 0;
  const flowVariability =
    histLen > 1
      ? (() => {
          const mean = dailyAvg;
          const variance =
            historyRef.current.reduce(
              (s, h) => s + Math.pow(h.value - mean, 2),
              0,
            ) / histLen;
          return mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100) : 0;
        })()
      : 0;

  if (!canalFeature) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
        <Navbar />
        <div className="w-full max-w-2xl mx-auto px-4 pt-24 flex flex-col items-center">
          <h1 className="text-xl font-semibold text-red-600">
            Canal not found
          </h1>
          <p>The requested canal does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      {/* Canal System Name Heading */}
      <div className="w-full flex flex-col items-center justify-center mt-6 mb-2">
        <h1
          className="text-4xl font-bold text-primary"
          style={{ fontFamily: "Inter, SF Pro, Roboto, sans-serif" }}
        >
          {canalFeature.properties.name}
        </h1>
      </div>
      {/* Header Bar */}
      <header
        className="w-full h-16 flex items-center justify-between px-8 border-b border-primary bg-white sticky top-0 z-40"
        style={{ fontFamily: "Inter, SF Pro, Roboto, sans-serif" }}
      >
        <div className="flex flex-col">
          <span className="text-xl font-bold text-primary">
            {canalFeature.properties.name}
          </span>
          <span className="text-xs text-gray-500">{canalLocation}</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-xs text-gray-500">
            Last Updated: {lastUpdated}
          </span>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: systemStatus === "Online" ? "#EAF1FF" : "#FF4D4F",
              color: systemStatus === "Online" ? "#1E6CFF" : "#fff",
            }}
          >
            {systemStatus}
          </span>
        </div>
      </header>
      {/* Main Content Container */}
      <main className="w-full flex flex-col items-center justify-center flex-1">
        <div className="w-full max-w-5xl px-2 md:px-6 flex flex-col gap-8">
          {/* Map Section */}
          <div className="w-full flex flex-col items-center justify-center mt-8">
            <div className="w-full max-w-3xl md:max-w-4xl lg:max-w-5xl h-60 md:h-80 rounded-xl shadow border border-primary overflow-hidden mx-auto">
              <CanalMap
                focus={{
                  longitude: canalFeature.geometry.coordinates[0],
                  latitude: canalFeature.geometry.coordinates[1],
                  zoom: 15,
                }}
              />
            </div>
            <div className="w-full flex flex-row items-center justify-center gap-8 mt-6">
              {showLiveFlow ? (
                <>
                  {/* Hero Flow Rate KPI */}
                  <div className="flex-1 bg-card rounded-xl shadow border border-primary py-6 flex flex-col items-center justify-center min-w-45 max-w-xs">
                    <span
                      className="text-[56px] md:text-[72px] font-bold"
                      style={{
                        color: "#1E6CFF",
                        fontFamily: "Inter, SF Pro, Roboto, sans-serif",
                      }}
                    >
                      {liveDischarge}
                    </span>
                    <span className="text-lg text-gray-500 font-medium">
                      m³/s
                    </span>
                    <span className="text-sm text-primary mt-2">
                      Live canal discharge
                    </span>
                  </div>
                  {/* Flow Health Donut */}
                  <div className="flex flex-col items-center justify-center max-w-xs">
                    {(() => {
                      const rawPercent = Math.round(
                        (liveDischarge / optimal_threshold) * 100,
                      );
                      const percent = Math.max(5, Math.min(90, rawPercent));
                      return (
                        <CircularGauge
                          value={percent}
                          label={flowHealth}
                          color={flowHealthColor}
                          unit="%"
                        />
                      );
                    })()}
                    <span className="text-xs text-gray-500 mt-2">
                      Flow Health
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex-1 bg-card rounded-xl shadow border border-primary p-8 flex flex-col items-center justify-center min-w-45 max-w-xs">
                  <span className="text-2xl font-bold text-red-600 mb-2">
                    Canal Stopped
                  </span>
                  <span className="text-base text-gray-700">
                    No live flow data available.
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Trend Analysis — live rolling discharge */}
          <div className="w-full flex flex-col items-center justify-center mt-4">
            <div className="flex flex-row items-center gap-4 mb-2 w-full justify-start">
              <span className="text-lg font-semibold text-primary">
                Live Discharge Trend
              </span>
              <span className="text-xs text-gray-500">
                ({trendData.length} readings collected)
              </span>
            </div>
            <div className="w-full">
              <MonthlyAreaChart data={trendData} color="#1E6CFF" />
            </div>
          </div>
          {/* Secondary Metrics */}
          <div className="w-full flex flex-row gap-6 mt-4  pb-5 items-stretch">
            <div className="flex-1 bg-card rounded-xl shadow border border-primary pb-7 flex flex-col items-center justify-center min-w-45">
              <CircularGauge
                value={dailyAvg}
                label="Avg Discharge"
                color="#00E5FF"
                unit=" m³/s"
              />
            </div>
            <div className="flex-1 bg-card rounded-xl shadow border border-primary pt-6 mb-0 pb-15 flex flex-col items-center justify-center min-w-45">
              <CircularGauge
                value={Math.round(battery)}
                label="Battery"
                color="#1E6CFF"
                unit="%"
              />
            </div>
            <div className="flex-1 bg-card rounded-xl shadow border border-primary p-4 flex flex-col items-center justify-center min-w-45">
              <span className="text-sm font-semibold text-primary">
                Flow Variability
              </span>
              <div className="w-full h-4 bg-secondary rounded mt-2">
                <div
                  className="h-4 rounded"
                  style={{
                    width: `${flowVariability}%`,
                    background: "#1E6CFF",
                  }}
                ></div>
              </div>
              <span className="text-xs text-gray-500 mt-2">
                {flowVariability}%
              </span>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
