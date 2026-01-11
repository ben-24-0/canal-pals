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
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import { canalMetrics } from "../../data/canalMetrics";
import { osmStyle } from "../../lib/mapConfig";

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

    setSelectedCanal({
      id: feature.properties?.id,
      name: feature.properties?.name,
      longitude: e.lngLat.lng,
      latitude: e.lngLat.lat,
    });
  };

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

              {(() => {
                const metrics = canalMetrics[selectedCanal.id];
                return (
                  <>
                    <p>
                      Status:{" "}
                      <span
                        className={
                          metrics.status === "FLOWING"
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {metrics.status}
                      </span>
                    </p>
                    <p>Flow rate: {metrics.flowRate} m³/s</p>
                    <p>Speed: {metrics.speed} m/s</p>
                    <p>Discharge: {metrics.discharge} L/s</p>
                  </>
                );
              })()}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
