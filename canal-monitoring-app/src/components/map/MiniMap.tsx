"use client";

import { useMemo } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const STATUS_COLOR: Record<string, string> = {
  FLOWING: "#22c55e",
  LOW_FLOW: "#f59e0b",
  HIGH_FLOW: "#ef4444",
  STOPPED: "#94a3b8",
  BLOCKED: "#dc2626",
  ERROR: "#dc2626",
};

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

interface MiniMapCanal {
  canalId: string;
  name: string;
  coordinates: [number, number]; // [lon, lat]
  status: string;
  flowRate: number | null;
}

interface Props {
  canals: MiniMapCanal[];
}

export default function MiniMap({ canals }: Props) {
  const center = useMemo(() => {
    if (canals.length === 0) return { longitude: 76.28, latitude: 10.53 };
    const avgLon =
      canals.reduce((s, c) => s + c.coordinates[0], 0) / canals.length;
    const avgLat =
      canals.reduce((s, c) => s + c.coordinates[1], 0) / canals.length;
    return { longitude: avgLon, latitude: avgLat };
  }, [canals]);

  return (
    <Map
      initialViewState={{
        longitude: center.longitude,
        latitude: center.latitude,
        zoom: canals.length === 1 ? 13 : 8,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLE}
      attributionControl={false}
      interactive={true}
    >
      <NavigationControl position="top-right" showCompass={false} />

      {canals.map((c) => {
        const [lon, lat] = c.coordinates;
        if (!lon || !lat) return null;
        return (
          <Marker
            key={c.canalId}
            longitude={lon}
            latitude={lat}
            anchor="center"
          >
            <div
              title={`${c.name}${c.flowRate != null ? ` — ${c.flowRate.toFixed(2)} m³/s` : ""}`}
              className="w-4 h-4 rounded-full border-2 border-white shadow-md"
              style={{ backgroundColor: STATUS_COLOR[c.status] ?? "#94a3b8" }}
            />
          </Marker>
        );
      })}
    </Map>
  );
}
