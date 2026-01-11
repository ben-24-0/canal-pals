"use client";

import { useState } from "react";
import {
  Map,
  Source,
  Layer,
  Popup,
  MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { canalMetrics } from "../../data/canalMetrics";
import canals from "../../data/canals";
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
