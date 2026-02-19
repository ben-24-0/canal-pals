"use client";

import React, { useState, useEffect } from "react";
import {
  Map,
  Source,
  Layer,
  Popup,
  MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import canals from "../../data/canals";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";

import { osmStyle } from "../../lib/mapConfig";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type HoverInfo = {
  longitude: number;
  latitude: number;
  name: string;
};

type Focus = {
  longitude: number;
  latitude: number;
  zoom?: number;
};

type CanalMapProps = {
  focus?: Focus;
  enableMoveTracking?: boolean;
};

export default function CanalMap({
  focus,
  enableMoveTracking = false,
}: CanalMapProps) {
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [selectedCanal, setSelectedCanal] = useState<any>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<any>(null);

  // Use initialViewState for react-map-gl
  const [mapView, setMapView] = useState({
    longitude: focus?.longitude ?? 76.3,
    latitude: focus?.latitude ?? 10.33,
    zoom: focus?.zoom ?? 9,
    bearing: 0,
    pitch: 0,
  });

  // Programmatic focus (dashboard)
  useEffect(() => {
    if (focus) {
      setMapView((prev) => ({
        ...prev,
        longitude: focus.longitude,
        latitude: focus.latitude,
        zoom: focus.zoom ?? 14,
      }));
    }
  }, [focus]);

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

    const sel = {
      id: feature.properties?.id,
      name: feature.properties?.name,
      longitude: e.lngLat.lng,
      latitude: e.lngLat.lat,
    };
    setSelectedCanal(sel);
    setSelectedMetrics(null);
  };

  // Poll live metrics for selected canal while popup open
  useEffect(() => {
    if (!selectedCanal) return;
    let cancelled = false;
    async function fetchMetrics() {
      try {
        const res = await fetch(`${API_BASE}/api/esp32/latest/${selectedCanal.id}`);
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
        initialViewState={mapView}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["canal-points"]}
        onMouseMove={handleHover}
        onClick={handleClick}
        {...(enableMoveTracking && {
          onMove: (evt) => {
            const newState = evt.viewState;
            setMapView(newState);
          },
        })}
      >
        <Source id="canals" type="geojson" data={canals as FeatureCollection<Geometry, GeoJsonProperties>}>
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

        {/* Tooltip */}
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
                    Status: {" "}
                    <span className={selectedMetrics.status === "FLOWING" ? "text-green-600" : "text-red-600"}>
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
