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
import { canalTimeSeries } from "../../../data/canalTimeSeries";
import CanalMap from "../../../components/map/CanalMap";
import CircularGauge from "../../../components/dashboard/CircularGauge";
import MonthlyAreaChart from "../../../components/dashboard/MonthlyAreaChart";
import React, { useState } from "react";
import { useParams } from "next/navigation";
// If you need useParams, import it from 'next/navigation' instead:
// import { useParams } from 'next/navigation';
import Footer from "../../../components/Footer";

export default function CanalDashboardPage() {
  const { canalId } = useParams();
  const rawCanalId = canalId;
  const resolvedCanalId = Array.isArray(rawCanalId)
    ? rawCanalId[0]
    : rawCanalId;

  const canalFeature = canals.features.find(
    (f) => f.properties.id === resolvedCanalId
  );

  // Unique mock data per canal
  // Live fluctuating discharge value
  const [liveDischarge, setLiveDischarge] = React.useState(0);
  let baseDischarge = 0,
    battery = 0,
    signal = 0,
    lastUpdated = "2026-01-13 14:32",
    systemStatus = "Online";

  // Stable, precomputed time series for each canal
  // Add 24-hour and 7/30-day datasets for each canal, centered around baseDischarge
  const hourlyDataMap: Record<string, { hour: number; value: number }[]> = {
    "peechi-canal": Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      value: Math.round(
        520 + 20 * Math.sin((i / 24) * 2 * Math.PI) + (i % 2 === 0 ? 10 : -10)
      ),
    })),
    "canoli-canal": Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      value: Math.round(
        110 + 8 * Math.sin((i / 24) * 2 * Math.PI) + (i % 2 === 0 ? 3 : -3)
      ),
    })),
    "puthussery-kalady-canal": Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      value: Math.round(
        340 + 15 * Math.sin((i / 24) * 2 * Math.PI) + (i % 2 === 0 ? 6 : -6)
      ),
    })),
    unknown: Array.from({ length: 24 }, (_, i) => ({ hour: i, value: 0 })),
  };
  const monthlyDataMap: Record<string, { day: number; value: number }[]> = {
    "peechi-canal": Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      value: Math.round(
        520 + 40 * Math.sin((i / 31) * 2 * Math.PI) + (i % 2 === 0 ? 15 : -15)
      ),
    })),
    "canoli-canal": Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      value: Math.round(
        110 + 15 * Math.sin((i / 31) * 2 * Math.PI) + (i % 2 === 0 ? 5 : -5)
      ),
    })),
    "puthussery-kalady-canal": Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      value: Math.round(
        340 + 30 * Math.sin((i / 31) * 2 * Math.PI) + (i % 2 === 0 ? 10 : -10)
      ),
    })),
    unknown: Array.from({ length: 31 }, (_, i) => ({ day: i + 1, value: 0 })),
  };

  if (resolvedCanalId === "peechi-canal") {
    baseDischarge = 520;
    battery = 87;
    signal = 73;
    lastUpdated = "2026-01-13 14:32";
    systemStatus = "Online";
  } else if (resolvedCanalId === "canoli-canal") {
    baseDischarge = 110;
    battery = 62;
    signal = 55;
    lastUpdated = "2026-01-13 13:50";
    systemStatus = "Online";
  } else if (resolvedCanalId === "puthussery-kalady-canal") {
    baseDischarge = 340;
    battery = 78;
    signal = 68;
    lastUpdated = "2026-01-13 14:10";
    systemStatus = "Online";
  } else {
    // fallback for unknown canal
    baseDischarge = 0;
    battery = 0;
    signal = 0;
    lastUpdated = "2026-01-13 00:00";
    systemStatus = "Offline";
  }

  // Memoize and sync graph data for each trend range
  const [trendRange, setTrendRange] = useState("30d");
  // For 24h, map to { day: string, value } with hour labels for X axis
  const getTrendData = () => {
    if (trendRange === "24h") {
      const hourly =
        hourlyDataMap[resolvedCanalId as keyof typeof hourlyDataMap] ||
        hourlyDataMap.unknown;
      return hourly.map(({ hour, value }) => ({ day: `${hour}:00`, value }));
    }
    const data =
      monthlyDataMap[resolvedCanalId as keyof typeof monthlyDataMap] ||
      monthlyDataMap.unknown;
    if (trendRange === "7d") return data.slice(-7);
    return data;
  };
  const trendData = getTrendData();

  // Calculate daily and monthly averages from the trend data
  const hourlyRaw =
    hourlyDataMap[resolvedCanalId as keyof typeof hourlyDataMap] ||
    hourlyDataMap.unknown;
  const monthlyRaw =
    monthlyDataMap[resolvedCanalId as keyof typeof monthlyDataMap] ||
    monthlyDataMap.unknown;
  const dailyAvg = Math.round(
    hourlyRaw.reduce((sum, d) => sum + d.value, 0) / hourlyRaw.length
  );
  const monthlyAvg = Math.round(
    monthlyRaw.reduce((sum, d) => sum + d.value, 0) / monthlyRaw.length
  );
  // Flow variability: coefficient of variation (stddev/mean) for 24h data
  const mean = dailyAvg;
  const stddev = Math.sqrt(
    hourlyRaw.reduce((sum, d) => sum + Math.pow(d.value - mean, 2), 0) /
      hourlyRaw.length
  );
  const flowVariability = mean > 0 ? Math.round((stddev / mean) * 100) : 0;

  // Fluctuate liveDischarge every 5 seconds
  React.useEffect(() => {
    setLiveDischarge(baseDischarge);
    if (baseDischarge === 0) return;
    const interval = setInterval(() => {
      // Fluctuate by ±2% of base value
      const fluctuation = (Math.random() - 0.5) * 0.04 * baseDischarge;
      setLiveDischarge((prev) => {
        let next = baseDischarge + fluctuation;
        // Clamp to 95%-105% of base
        next = Math.max(
          baseDischarge * 0.95,
          Math.min(baseDischarge * 1.05, next)
        );
        return Math.round(next);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [baseDischarge]);
  const canalLocation = canalFeature?.geometry?.coordinates
    ? `Lat: ${canalFeature.geometry.coordinates[1].toFixed(
        4
      )}, Lon: ${canalFeature.geometry.coordinates[0].toFixed(4)}`
    : "Unknown";
  // Flow health logic
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

  // Determine canal status (FLOWING/STOPPED)
  let canalStatus: "FLOWING" | "STOPPED" = "FLOWING";
  if (resolvedCanalId === "peechi-canal") canalStatus = "FLOWING";
  else if (resolvedCanalId === "canoli-canal") canalStatus = "STOPPED";
  else if (resolvedCanalId === "puthussery-kalady-canal")
    canalStatus = "FLOWING";

  // Helper: should show live flowrate KPI and flow health?
  const showLiveFlow = canalStatus === "FLOWING";

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
                        (liveDischarge / optimal_threshold) * 100
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
          {/* Trend Analysis */}
          <div className="w-full flex flex-col items-center justify-center mt-4">
            <div className="flex flex-row items-center gap-4 mb-2 w-full justify-start">
              <span className="text-lg font-semibold text-primary">
                Flow Rate Trend
              </span>
              <div className="flex gap-2">
                <button
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    trendRange === "24h"
                      ? "bg-primary text-white"
                      : "bg-secondary text-primary"
                  }`}
                  onClick={() => setTrendRange("24h")}
                >
                  Last 24 Hours
                </button>
                <button
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    trendRange === "7d"
                      ? "bg-primary text-white"
                      : "bg-secondary text-primary"
                  }`}
                  onClick={() => setTrendRange("7d")}
                >
                  Last 7 Days
                </button>
                <button
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    trendRange === "30d"
                      ? "bg-primary text-white"
                      : "bg-secondary text-primary"
                  }`}
                  onClick={() => setTrendRange("30d")}
                >
                  Last 30 Days
                </button>
              </div>
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
                 label="Daily Avg Flow"
                 color="#00E5FF"
                 unit=" m³/s"
               />
            </div>
            <div className="flex-1 bg-card rounded-xl shadow border border-primary pt-6 mb-0 pb-15 flex flex-col items-center justify-center min-w-45">
              <CircularGauge
                value={monthlyAvg}
                label="Monthly Avg Flow"
                color="#1E6CFF"
                unit=" m³/s"
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
