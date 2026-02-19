"use client";

import { useState, useEffect } from "react";
import {
  Map,
  Source,
  Layer,
  Popup,
  MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import canals from "../../data/canals";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import { osmStyle } from "../../lib/mapConfig";

type HoverInfo = {
  longitude: number;
  latitude: number;
  name: string;
};

export default function HomeCanalMap() {
  // Ernakulam district center coordinates
  const ernakulamFocus = {
    longitude: 76.3,
    latitude: 10.05,
    zoom: 10,
  };
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [viewState, setViewState] = useState(ernakulamFocus);
  const [selectedCanal, setSelectedCanal] = useState<any>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<any>(null);
  const handleHover = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) {
      setHoverInfo(null);
      return;
    }

    setHoverInfo({
      longitude: e.lngLat.lng,
      latitude: e.lngLat.lat,
      name: feature.properties?.name,
    });
  };

  const handleClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) return;

    setSelectedCanal({
      id: feature.properties?.id,
      name: feature.properties?.name,
      longitude: e.lngLat.lng,
      latitude: e.lngLat.lat,
    });
  };

  useEffect(() => {
    if (!selectedCanal) return;
    let cancelled = false;
    async function fetchMetrics() {
      try {
        const res = await fetch(
          `${API_BASE}/api/esp32/latest/${selectedCanal.id}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setSelectedMetrics(json.reading);
      } catch (err) {
        // ignore
      }
    }

    fetchMetrics();
    const id = setInterval(fetchMetrics, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedCanal]);

  return (
    <div className="relative h-full">
      <Map
        mapStyle={osmStyle}
        initialViewState={{
          longitude: 76.3,
          latitude: 10.33,
          zoom: 9,
        }}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["canal-points"]}
        onMouseMove={handleHover}
        onClick={handleClick}
      >
        <Source
          id="canals"
          type="geojson"
          data={canals as FeatureCollection<Geometry, GeoJsonProperties>}
        >
          <Layer
            id="canal-points"
            type="circle"
            paint={{
              "circle-radius": 8,
              "circle-color": "#2563eb",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </Source>
        {hoverInfo && (
          <Popup
            longitude={hoverInfo.longitude}
            latitude={hoverInfo.latitude}
            closeButton={false}
            closeOnClick={false}
            offset={12}
          >
            <div className="text-sm font-medium">{hoverInfo.name}</div>
          </Popup>
        )}
        {/* Detail Popup */}
        {selectedCanal && (
          <Popup
            longitude={selectedCanal.longitude}
            latitude={selectedCanal.latitude}
            onClose={() => setSelectedCanal(null)}
            offset={16}
          >
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{selectedCanal.name}</p>

              {selectedMetrics ? (
                <>
                  <p>
                    Status:{" "}
                    <span
                      className={
                        selectedMetrics.status === "FLOWING"
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {selectedMetrics.status}
                    </span>
                  </p>
                  <p>Flow rate: {selectedMetrics.flowRate} m³/s</p>
                  <p>Speed: {selectedMetrics.speed} m/s</p>
                  <p>Discharge: {selectedMetrics.discharge} L/s</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Loading live metrics…</p>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
