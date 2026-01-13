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

import Navbar from "../../../components/Navbar";

import canals from "../../../data/canals";
import { canalTimeSeries } from "../../../data/canalTimeSeries";
import CanalMap from "../../../components/map/CanalMap";
import CircularGauge from "../../../components/dashboard/CircularGauge";
import MonthlyAreaChart from "../../../components/dashboard/MonthlyAreaChart";
import React, { useState } from "react";

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
  let discharge = 0, battery = 0, signal = 0, lastUpdated = "2026-01-13 14:32", systemStatus = "Online", monthlyData: {day: number, value: number}[] = [];
  if (resolvedCanalId === "peechi-canal") {
    discharge = 520;
    battery = 87;
    signal = 73;
    lastUpdated = "2026-01-13 14:32";
    systemStatus = "Online";
    monthlyData = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      value: Math.round(60 + 30 * Math.sin((i / 31) * 2 * Math.PI) + Math.random() * 15)
    }));
  } else if (resolvedCanalId === "canoli-canal") {
    discharge = 110;
    battery = 62;
    signal = 55;
    lastUpdated = "2026-01-13 13:50";
    systemStatus = "Online";
    monthlyData = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      value: Math.round(20 + 10 * Math.sin((i / 31) * 2 * Math.PI) + Math.random() * 10)
    }));
  } else if (resolvedCanalId === "puthussery-kalady-canal") {
    discharge = 340;
    battery = 78;
    signal = 68;
    lastUpdated = "2026-01-13 14:10";
    systemStatus = "Online";
    monthlyData = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      value: Math.round(40 + 20 * Math.sin((i / 31) * 2 * Math.PI) + Math.random() * 12)
    }));
  } else {
    // fallback for unknown canal
    discharge = 0;
    battery = 0;
    signal = 0;
    lastUpdated = "2026-01-13 00:00";
    systemStatus = "Offline";
    monthlyData = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, value: 0 }));
  }
  const canalLocation = canalFeature?.geometry?.coordinates
    ? `Lat: ${canalFeature.geometry.coordinates[1].toFixed(4)}, Lon: ${canalFeature.geometry.coordinates[0].toFixed(4)}`
    : "Unknown";
  // Flow health logic
  const optimal_threshold = 500;
  const minimum_threshold = 200;
  let flowHealth = "Good";
  let flowHealthColor = "#22C55E";
  if (discharge < minimum_threshold) {
    flowHealth = "Low";
    flowHealthColor = "#FF4D4F";
  } else if (discharge < optimal_threshold) {
    flowHealth = "Moderate";
    flowHealthColor = "#FFB020";
  }
  // Time range selector for trend chart
  const [trendRange, setTrendRange] = useState("30d");

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
  else if (resolvedCanalId === "puthussery-kalady-canal") canalStatus = "FLOWING";

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
      <main className="w-full flex flex-col items-center justify-center">
        <div className="w-full max-w-5xl px-2 md:px-6 flex flex-col gap-8">
          {/* Map + KPI Row */}
          <div className="w-full flex flex-col md:flex-row items-center justify-center gap-8 mt-8">
            <div className="flex-shrink-0">
              <div className="w-[320px] h-[220px] md:w-[400px] md:h-[260px] rounded-xl shadow border border-primary overflow-hidden mx-auto">
                <CanalMap
                  focus={{
                    longitude: canalFeature.geometry.coordinates[0],
                    latitude: canalFeature.geometry.coordinates[1],
                    zoom: 15,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-4 flex-1">
              <div className="flex flex-row items-center gap-8 justify-center w-full">
                {showLiveFlow ? (
                  <>
                    {/* Hero Flow Rate KPI */}
                    <div className="flex-1 bg-card rounded-xl shadow border border-primary pb-7 flex flex-col items-center justify-center min-w-[180px]">
                      <span
                        className="text-[72px] font-bold"
                        style={{
                          color: "#1E6CFF",
                          fontFamily: "Inter, SF Pro, Roboto, sans-serif",
                        }}
                      >
                        {discharge}
                      </span>
                      <span className="text-lg text-gray-500 font-medium">
                        m³/s
                      </span>
                      <span className="text-sm text-primary mt-2">
                        Live canal discharge
                      </span>
                    </div>
                    {/* Flow Health Donut */}
                    <div className="flex flex-col items-center justify-center">
                      <CircularGauge value={Math.round((discharge/optimal_threshold)*100)} label={flowHealth} color={flowHealthColor} unit="%" />
                      <span className="text-xs text-gray-500 mt-2">Flow Health</span>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 bg-card rounded-xl shadow border border-primary p-8 flex flex-col items-center justify-center min-w-[180px]">
                    <span className="text-2xl font-bold text-red-600 mb-2">Canal Stopped</span>
                    <span className="text-base text-gray-700">No live flow data available.</span>
                  </div>
                )}
              </div>
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
              <MonthlyAreaChart data={monthlyData} color="#1E6CFF" />
            </div>
          </div>
          {/* Secondary Metrics */}
          <div className="w-full flex flex-row gap-6 mt-4  pb-5 items-stretch">
            <div className="flex-1 bg-card rounded-xl shadow border border-primary pb-7 flex flex-col items-center justify-center min-w-[180px]">
              <CircularGauge
                className="p-2"
                value={Math.round(discharge / 5)}
                label="Daily Avg Flow"
                color="#00E5FF"
                unit=" m³/s"
              />
            </div>
            <div className="flex-1 bg-card rounded-xl shadow border border-primary pt-1 pb-15 flex flex-col items-center justify-center min-w-[180px]">
              <CircularGauge
                value={Math.round(discharge / 4)}
                label="Monthly Avg Flow"
                color="#1E6CFF"
                unit=" m³/s"
              />
            </div>
            <div className="flex-1 bg-card rounded-xl shadow border border-primary p-4 flex flex-col items-center justify-center min-w-[180px]">
              <span className="text-sm font-semibold text-primary">
                Flow Variability
              </span>
              <div className="w-full h-4 bg-secondary rounded mt-2">
                <div
                  className="h-4 rounded"
                  style={{ width: "60%", background: "#1E6CFF" }}
                ></div>
              </div>
              <span className="text-xs text-gray-500 mt-2">60%</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
