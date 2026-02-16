"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FishabilityRow, BiteTier } from "@/lib/types";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import { MapControls } from "./MapControls";

const MONTANA_CENTER: [number, number] = [-110.9, 46.9];
const DEFAULT_ZOOM = 5.2;
const FLY_ZOOM = 9.5;
const FLY_DURATION = 667;
const FLY_CURVE = 1.5;

const BITE_TIER_COLORS: Record<BiteTier, string> = {
  HOT: "#dc2626",
  GOOD: "#16a34a",
  FAIR: "#ca8a04",
  TOUGH: "#64748b",
};

interface MapViewProps {
  rivers: FishabilityRow[];
  selectedRiver: FishabilityRow | null;
  selectedRiverId: string | null;
  selectedRiverGeojson: GeoJSON.GeoJSON | null;
  onSelectRiver: (river: FishabilityRow) => void;
  className?: string;
  initialStyleUrl?: string;
  onMapReady?: (map: maplibregl.Map) => void;
}

const RIVER_LINE_SOURCE = "selected-river-source";
const RIVER_LINE_LAYER = "selected-river-line";

const RIVERS_SOURCE = "rivers-source";
const UNCLUSTERED_LAYER = "rivers-unclustered";
const SELECTED_HALO_LAYER = "rivers-selected-halo";
const SELECTED_CORE_LAYER = "rivers-selected-core";

function normalizeGeojson(g: any): any {
  if (!g) return null;
  if (g.type === "FeatureCollection") return g;
  if (g.type === "Feature") return g;
  if (g.type === "LineString" || g.type === "MultiLineString") {
    return { type: "Feature", properties: {}, geometry: g };
  }
  return g;
}

export function addSelectedRiverLine(map: any, geojson: any): void {
  const data = normalizeGeojson(geojson);
  if (!data) return;

  if (map.getLayer(RIVER_LINE_LAYER)) map.removeLayer(RIVER_LINE_LAYER);
  if (map.getSource(RIVER_LINE_SOURCE)) map.removeSource(RIVER_LINE_SOURCE);

  map.addSource(RIVER_LINE_SOURCE, { type: "geojson", data });

  map.addLayer({
    id: RIVER_LINE_LAYER,
    type: "line",
    source: RIVER_LINE_SOURCE,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#00ffff",
      "line-width": 10,
      "line-opacity": 0.9,
    },
  });

  try {
    const layers = map.getStyle()?.layers;
    if (layers?.length) map.moveLayer(RIVER_LINE_LAYER, layers[layers.length - 1].id);
  } catch {}
}

export function clearSelectedRiverLine(map: any): void {
  if (map.getLayer(RIVER_LINE_LAYER)) {
    map.removeLayer(RIVER_LINE_LAYER);
  }
  if (map.getSource(RIVER_LINE_SOURCE)) {
    map.removeSource(RIVER_LINE_SOURCE);
  }
}

function geojsonBbox(geojson: GeoJSON.GeoJSON): [number, number, number, number] | null {
  const coords: [number, number][] = [];
  const collect = (g: GeoJSON.Geometry) => {
    if (g.type === "Point") coords.push(g.coordinates as [number, number]);
    else if (g.type === "LineString") for (const c of g.coordinates) coords.push(c as [number, number]);
    else if (g.type === "MultiLineString") for (const line of g.coordinates) for (const c of line) coords.push(c as [number, number]);
    else if (g.type === "Polygon") for (const ring of g.coordinates) for (const c of ring) coords.push(c as [number, number]);
    else if (g.type === "MultiPoint") for (const c of g.coordinates) coords.push(c as [number, number]);
  };
  if ("geometry" in geojson && geojson.geometry) collect(geojson.geometry);
  else if ("coordinates" in geojson) collect(geojson as GeoJSON.Geometry);
  else if ("features" in geojson) for (const f of geojson.features) if (f.geometry) collect(f.geometry);
  if (!coords.length) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function riversToFeatureCollection(rivers: FishabilityRow[]) {
  const features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[] = [];

  for (const river of rivers) {
    const lat = river.lat ?? (river as { latitude?: number }).latitude;
    const lng = river.lng ?? (river as { longitude?: number }).longitude;
    const coords: [number, number] | undefined =
      lat != null && lng != null ? [lng, lat] : RIVER_FOCUS_POINTS[river.river_id];

    if (!coords) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: {
        river_id: river.river_id,
        river_name: river.river_name,
        bite_tier: river.bite_tier ?? null,
        fishability_score: river.fishability_score_calc ?? null,
      },
    });
  }

  return { type: "FeatureCollection" as const, features };
}

function ensureRiverLayers(
  map: maplibregl.Map,
  riversRef: React.MutableRefObject<FishabilityRow[]>,
  onSelectRiverRef: React.MutableRefObject<(river: FishabilityRow) => void>,
  hoverIdRef: React.MutableRefObject<number | string | null>,
  selectedRiverIdRef: React.MutableRefObject<string | null>
) {
  const rivers = riversRef.current;
  const fc = riversToFeatureCollection(rivers);

  const src = map.getSource(RIVERS_SOURCE) as { setData?: (d: GeoJSON.FeatureCollection) => void } | undefined;
  if (!src) {
    map.addSource(RIVERS_SOURCE, {
      type: "geojson",
      data: fc,
      cluster: false,
      generateId: true,
    });
  } else {
    try {
      src.setData?.(fc);
    } catch {
      /* ignore */
    }
  }

  if (!map.getLayer(UNCLUSTERED_LAYER)) {
    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: "circle",
      source: RIVERS_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "bite_tier"], "HOT"], BITE_TIER_COLORS.HOT,
          ["==", ["get", "bite_tier"], "GOOD"], BITE_TIER_COLORS.GOOD,
          ["==", ["get", "bite_tier"], "FAIR"], BITE_TIER_COLORS.FAIR,
          ["==", ["get", "bite_tier"], "TOUGH"], BITE_TIER_COLORS.TOUGH,
          "#94a3b8",
        ],
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 8, 6],
        "circle-stroke-color": "rgba(255,255,255,0.92)",
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 2],
        "circle-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer(SELECTED_HALO_LAYER)) {
    map.addLayer({
      id: SELECTED_HALO_LAYER,
      type: "circle",
      source: RIVERS_SOURCE,
      filter: ["==", ["get", "river_id"], "__none__"],
      paint: { "circle-color": "rgba(59, 130, 246, 0.35)", "circle-radius": 14 },
    });
  }
  if (!map.getLayer(SELECTED_CORE_LAYER)) {
    map.addLayer({
      id: SELECTED_CORE_LAYER,
      type: "circle",
      source: RIVERS_SOURCE,
      filter: ["==", ["get", "river_id"], "__none__"],
      paint: {
        "circle-color": "rgba(255,255,255,0.95)",
        "circle-radius": 6,
        "circle-stroke-color": "rgba(59, 130, 246, 0.95)",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!(map as any).__mriHandlers) {
    (map as any).__mriHandlers = true;
    map.on("click", UNCLUSTERED_LAYER, (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const rid = f?.properties?.river_id as string | undefined;
      if (!rid) return;
      const river = riversRef.current.find((r) => r.river_id === rid);
      if (river) onSelectRiverRef.current(river);
    });
    map.on("mousemove", UNCLUSTERED_LAYER, (e: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      const id = f?.id;
      if (id == null) return;
      if (hoverIdRef.current != null && hoverIdRef.current !== id) {
        try {
          map.setFeatureState({ source: RIVERS_SOURCE, id: hoverIdRef.current as number }, { hover: false });
        } catch { /* ignore */ }
      }
      hoverIdRef.current = id;
      try {
        map.setFeatureState({ source: RIVERS_SOURCE, id: id as number }, { hover: true });
      } catch { /* ignore */ }
    });
    map.on("mouseleave", UNCLUSTERED_LAYER, () => {
      map.getCanvas().style.cursor = "";
      if (hoverIdRef.current != null) {
        try {
          map.setFeatureState({ source: RIVERS_SOURCE, id: hoverIdRef.current as number }, { hover: false });
        } catch { /* ignore */ }
      }
      hoverIdRef.current = null;
    });
  }

  const rid = selectedRiverIdRef.current ?? "__none__";
  if (map.getLayer(SELECTED_HALO_LAYER) && map.getLayer(SELECTED_CORE_LAYER)) {
    try {
      map.setFilter(SELECTED_HALO_LAYER, ["==", ["get", "river_id"], rid]);
      map.setFilter(SELECTED_CORE_LAYER, ["==", ["get", "river_id"], rid]);
    } catch { /* ignore */ }
  }
}

export function MapView({
  rivers,
  selectedRiver,
  selectedRiverId,
  selectedRiverGeojson,
  onSelectRiver,
  className,
  initialStyleUrl,
  onMapReady,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastFlownRef = useRef<string | null>(null);
  const hoverIdRef = useRef<number | string | null>(null);
  const riversRef = useRef(rivers);
  const onSelectRiverRef = useRef(onSelectRiver);
  const selectedRiverIdRef = useRef(selectedRiverId);
  riversRef.current = rivers;
  onSelectRiverRef.current = onSelectRiver;
  selectedRiverIdRef.current = selectedRiverId;
  const [mapReady, setMapReady] = useState(false);

  const initMap = useCallback(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyleUrl ?? "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
      center: MONTANA_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 22,
      bearing: -5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.resize();
      setMapReady(true);
      onMapReady?.(map);
      requestAnimationFrame(() => map.resize());
      setTimeout(() => map.resize(), 100);
      try {
        ensureRiverLayers(map, riversRef, onSelectRiverRef, hoverIdRef, selectedRiverIdRef);
      } catch { /* ignore */ }
    });
  }, [onMapReady]);

  useEffect(() => {
    initMap();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      lastFlownRef.current = null;
    };
  }, [initMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapContainerRef.current) return;

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [mapReady]);

  const riversKey = rivers.map((r) => r.river_id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;

    try {
      ensureRiverLayers(map, riversRef, onSelectRiverRef, hoverIdRef, selectedRiverIdRef);
    } catch { /* ignore */ }

    const fc = riversToFeatureCollection(rivers);
    if (fc.features.length) {
      const bounds = new maplibregl.LngLatBounds(
        fc.features[0].geometry.coordinates as [number, number],
        fc.features[0].geometry.coordinates as [number, number]
      );
      for (const f of fc.features) bounds.extend(f.geometry.coordinates as [number, number]);
      map.fitBounds(bounds, { padding: 60, duration: 450 });
    }
  }, [riversKey, mapReady, rivers, onSelectRiver]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getLayer(SELECTED_HALO_LAYER) || !map.getLayer(SELECTED_CORE_LAYER)) return;

    const rid = selectedRiverId ?? "__none__";
    try {
      map.setFilter(SELECTED_HALO_LAYER, ["==", ["get", "river_id"], rid]);
      map.setFilter(SELECTED_CORE_LAYER, ["==", ["get", "river_id"], rid]);
    } catch {
      /* ignore */
    }
  }, [selectedRiverId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;

    clearSelectedRiverLine(map);

    console.log("[selectedRiverGeojson]", selectedRiverGeojson);

    if (!selectedRiverId) {
      lastFlownRef.current = null;
      return;
    }
    if (lastFlownRef.current === selectedRiverId) return;
    lastFlownRef.current = selectedRiverId;

    const focus: [number, number] | undefined =
      selectedRiver?.lat != null && selectedRiver?.lng != null
        ? [selectedRiver.lng!, selectedRiver.lat!]
        : RIVER_FOCUS_POINTS[selectedRiverId];

    if (selectedRiverGeojson) {
      addSelectedRiverLine(map, selectedRiverGeojson);
      const bbox = geojsonBbox(selectedRiverGeojson);
      if (bbox && map.fitBounds) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 60, duration: 700, essential: true }
        );
        return;
      }
    }

    if (focus) {
      map.flyTo({
        center: focus,
        zoom: FLY_ZOOM,
        duration: FLY_DURATION,
        curve: FLY_CURVE,
        essential: true,
      });
    }
  }, [selectedRiverId, selectedRiverGeojson, selectedRiver, mapReady]);

  // Re-apply selected river line when basemap changes (map.setStyle wipes custom layers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const reapply = () => {
      try {
        clearSelectedRiverLine(map);
        if (selectedRiverGeojson) addSelectedRiverLine(map, selectedRiverGeojson);
      } catch (e) {
        console.warn("[MapView] reapply selected river line failed", e);
      }
    };

    map.on("load", reapply);
    return () => {
      map.off("load", reapply);
    };
  }, [mapReady, selectedRiverGeojson]);

  return (
    <div
      id="map"
      ref={mapContainerRef}
      className={`absolute inset-0 w-full h-full min-h-0 [&_.maplibregl-marker]:cursor-pointer ${className ?? ""}`.trim()}
      aria-label="Montana river map"
    >
      {mapReady && mapRef.current && <MapControls map={mapRef.current} />}
    </div>
  );
}
