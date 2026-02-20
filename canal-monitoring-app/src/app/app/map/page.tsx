"use client";

import { useEffect, useState } from "react";
import Map, { Marker, Popup, NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatDistanceToNow } from "date-fns";
import { X, Filter, Layers, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { CanalInfo, CanalReading } from "@/types/canal";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useAllCanalsSSE } from "@/hooks/useAllCanalsSSE";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

const STATUS_COLOR: Record<string, string> = {
  FLOWING: "#22c55e",
  LOW_FLOW: "#f59e0b",
  HIGH_FLOW: "#f97316",
  BLOCKED: "#ef4444",
  STOPPED: "#94a3b8",
  ERROR: "#ef4444",
};

const MAP_STYLES: Record<string, { label: string; url: string }> = {
  street: { label: "Street", url: "https://tiles.openfreemap.org/styles/liberty" },
  positron: { label: "Light", url: "https://tiles.openfreemap.org/styles/positron" },
  dark: { label: "Dark", url: "https://tiles.openfreemap.org/styles/dark" },
};

const ALL_STATUSES = ["FLOWING", "LOW_FLOW", "HIGH_FLOW", "BLOCKED", "STOPPED", "ERROR"];

interface CanalPin {
  canal: CanalInfo;
  reading: CanalReading | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  FLOWING: { label: "Active", variant: "default" },
  LOW_FLOW: { label: "Low Flow", variant: "secondary" },
  HIGH_FLOW: { label: "High Flow", variant: "destructive" },
  BLOCKED: { label: "Blocked", variant: "destructive" },
  STOPPED: { label: "Offline", variant: "outline" },
  ERROR: { label: "Error", variant: "destructive" },
};

export default function MapPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [canalList, setCanalList] = useState<CanalInfo[]>([]);
  const [selected, setSelected] = useState<CanalPin | null>(null);
  const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>("street");
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [showFilters, setShowFilters] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const { readings: liveReadings, connected: sseConnected } = useAllCanalsSSE();

  // Fetch canal list once on mount (static info)
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/canals?limit=200`)
      .then((r) => r.json())
      .then((json) => setCanalList(json.canals ?? []))
      .catch(console.error);
  }, []);

  // Update lastRefreshed whenever SSE delivers new readings
  useEffect(() => {
    if (liveReadings.size > 0) setLastRefreshed(new Date());
  }, [liveReadings]);

  // Derive pins by merging static canal list with live SSE readings
  const pins: CanalPin[] = canalList.map((c) => ({
    canal: c,
    reading: liveReadings.get(c.canalId) ?? null,
  }));

  const visiblePins = pins.filter((p) =>
    filterStatuses.has(p.reading?.status ?? "STOPPED")
  );

  const toggleStatus = (s: string) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] rounded-lg overflow-hidden">
      <Map
        initialViewState={{ longitude: 0, latitude: 20, zoom: 2 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLES[mapStyle].url}
        onClick={() => setSelected(null)}
      >
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-left" />

        {visiblePins.map(({ canal, reading }) => {
          const status = reading?.status ?? "STOPPED";
          const [lon, lat] = canal.location.coordinates;
          if (!lon || !lat) return null;
          return (
            <Marker
              key={canal.canalId}
              longitude={lon}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelected({ canal, reading });
              }}
            >
              <div
                title={canal.name}
                className="w-4 h-4 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-125 transition-transform"
                style={{ backgroundColor: STATUS_COLOR[status] ?? "#94a3b8" }}
              />
            </Marker>
          );
        })}

        {selected && (
          <Popup
            longitude={selected.canal.location.coordinates[0]}
            latitude={selected.canal.location.coordinates[1]}
            anchor="bottom"
            onClose={() => setSelected(null)}
            closeButton={false}
            maxWidth="280px"
          >
            <div className="p-2 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground text-sm">{selected.canal.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{selected.canal.canalId}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {selected.reading && (
                <>
                  <Badge variant={STATUS_CONFIG[selected.reading.status]?.variant ?? "outline"}>
                    {STATUS_CONFIG[selected.reading.status]?.label ?? selected.reading.status}
                  </Badge>
                  <div className="text-xs space-y-1">
                    {selected.reading.flowRate != null && (
                      <p>Flow: <span className="font-medium">{selected.reading.flowRate.toFixed(2)} m³/s</span></p>
                    )}
                    {selected.reading.depth != null && (
                      <p>Depth: <span className="font-medium">{selected.reading.depth.toFixed(2)} m</span></p>
                    )}
                    {selected.reading.temperature != null && (
                      <p>Temp: <span className="font-medium">{selected.reading.temperature.toFixed(1)} °C</span></p>
                    )}
                    <p className="text-muted-foreground">
                      {formatDistanceToNow(new Date(selected.reading.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                  <Separator />
                </>
              )}

              <Link
                href={isAdmin ? `/app/admin/canal/${selected.canal.canalId}` : `/app/canal/${selected.canal.canalId}`}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                View Dashboard →
              </Link>
            </div>
          </Popup>
        )}
      </Map>

      {/* Top-left controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {/* Map style switcher */}
        <div className="flex gap-1 bg-background/90 backdrop-blur p-1 rounded-lg shadow">
          <Layers className="w-4 h-4 self-center text-muted-foreground mx-1" />
          {Object.entries(MAP_STYLES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setMapStyle(key as keyof typeof MAP_STYLES)}
              className={[
                "px-2 py-0.5 text-xs rounded",
                mapStyle === key
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-foreground hover:bg-muted",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <div className="bg-background/90 backdrop-blur rounded-lg shadow">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium w-full rounded-lg hover:bg-muted"
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {filterStatuses.size < ALL_STATUSES.length && (
              <span className="ml-auto bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                {ALL_STATUSES.length - filterStatuses.size}
              </span>
            )}
          </button>
          {showFilters && (
            <div className="px-2 pb-2 space-y-1">
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterStatuses.has(s)}
                    onChange={() => toggleStatus(s)}
                    className="rounded"
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[s] }}
                  />
                  <span className="text-xs">{STATUS_CONFIG[s]?.label ?? s}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom stats bar */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-background/90 backdrop-blur px-3 py-1.5 rounded-lg shadow text-xs text-muted-foreground">
        <span>{visiblePins.length} canals shown</span>
        <Separator orientation="vertical" className="h-4" />
        <span>Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}</span>
        <Separator orientation="vertical" className="h-4" />
        <span
          className={`w-2 h-2 rounded-full ${sseConnected ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`}
        />
        <Radio className="w-3 h-3" />
        <span>{sseConnected ? "Live" : "Connecting…"}</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-background/90 backdrop-blur px-3 py-2 rounded-lg shadow">
        <p className="text-xs font-medium text-foreground mb-1">Status</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {ALL_STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[s] }} />
              <span className="text-[11px] text-muted-foreground">{STATUS_CONFIG[s]?.label ?? s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
