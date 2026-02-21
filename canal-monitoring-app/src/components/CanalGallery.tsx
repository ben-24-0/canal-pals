"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Zap, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface CanalPreview {
  canalId: string;
  name: string;
  type: string;
  location: { coordinates: [number, number] };
  sensorType?: string;
}

const STATUS_CFG: Record<string, string> = {
  irrigation: "bg-blue-100 text-blue-700",
  drainage: "bg-amber-100 text-amber-700",
  "water-supply": "bg-green-100 text-green-700",
};

export default function CanalGallery() {
  const [canals, setCanals] = useState<CanalPreview[]>([]);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/canals`)
      .then((r) => r.json())
      .then((json) => setCanals(json.canals ?? []))
      .catch(() => {});
  }, []);

  if (canals.length === 0) return null;

  return (
    <section id="canals" className="py-20 px-6 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900">Monitored Canals</h2>
          <p className="mt-2 text-gray-600 max-w-xl mx-auto">
            Our system monitors key irrigation infrastructure in real time using
            ESP32 sensors and Manning&apos;s equation for accurate flow
            measurement.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {canals.map((c) => (
            <div
              key={c.canalId}
              className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  <p className="text-xs text-gray-500 font-mono">{c.canalId}</p>
                </div>
                <Badge
                  className={`text-[10px] ${STATUS_CFG[c.type] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {c.type}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {c.location.coordinates[1].toFixed(4)},{" "}
                  {c.location.coordinates[0].toFixed(4)}
                </span>
                <span className="flex items-center gap-1 capitalize">
                  <Zap className="w-3 h-3" />
                  {c.sensorType ?? "radar"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#2323FF] text-white text-sm font-medium hover:bg-[#1a1aee] transition-colors"
          >
            View All on Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
