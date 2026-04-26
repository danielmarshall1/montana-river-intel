"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FishabilityRow, BiteTier } from "@/lib/types";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import { MRI_COLORS } from "@/lib/theme";
import { createDefaultLayerState, type BasemapId, type LayerId } from "@/src/map/layers/registry";
import { MapControls } from "./MapControls";
import { type Waypoint, WAYPOINT_COLORS } from "@/lib/waypoints";

const MONTANA_CENTER: [number, number] = [-109.75, 47.05];
const MONTANA_BOUNDS: [[number, number], [number, number]] = [
  [-116.15, 44.25],
  [-103.85, 49.2],
];
const DEFAULT_ZOOM = 6.15;
const FLY_ZOOM = 9.5;
const FLY_DURATION = 300;
const FLY_CURVE = 1.5;

const BITE_TIER_COLORS: Record<BiteTier, string> = {
  HOT:   "#4ade80", // green-400 — visible on satellite
  GOOD:  "#4ade80",
  FAIR:  "#fbbf24", // amber-400
  TOUGH: "#f87171", // red-400
};

interface MapViewProps {
  rivers: FishabilityRow[];
  selectedRiver: FishabilityRow | null;
  selectedRiverName?: string | null;
  selectedRiverId: string | null;
  selectedRiverGeojson: GeoJSON.GeoJSON | null;
  riverLinesGeojson?: GeoJSON.FeatureCollection | null;
  activeStationsGeojson?: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> | null;
  basemap?: BasemapId;
  layerState?: Record<LayerId, boolean>;
  rightPanelOpen?: boolean;
  drawerState?: "collapsed" | "mid" | "expanded";
  selectionSeq?: number;
  onSelectRiver: (river: FishabilityRow) => void;
  className?: string;
  initialStyleUrl?: string;
  onMapReady?: (map: mapboxgl.Map) => void;
  highlightedStationSiteNo?: string | null;
  waypoints?: Waypoint[];
  onWaypointSave?: (wp: Omit<Waypoint, "id" | "created_at">) => void;
  onWaypointRemove?: (id: string) => void;
}

const RIVERS_SOURCE = "rivers-source";
const UNCLUSTERED_LAYER = "rivers-unclustered";
const SELECTED_HALO_LAYER = "rivers-selected-halo";
const SELECTED_CORE_LAYER = "rivers-selected-core";

const ALL_RIVERS_SOURCE = "all-rivers-source";
const RIVER_LABELS_SOURCE = "river-labels-source";
const RIVER_HIT_LAYER = "rivers-hit";
const RIVER_CASING_LAYER = "rivers-casing";
const RIVER_BASE_LAYER = "rivers-base";
const RIVER_SELECTED_LAYER = "rivers-selected";
const RIVER_NAMES_LAYER = "river-labels";

const STATEWIDE_HYDRO_SOURCE = "statewide-hydrology-source";
const STATEWIDE_HYDRO_LAYER = "statewide-hydrology-line";

// Federal BLM layer consolidated into SMA (padus_public_lands).
const STATE_LANDS_SOURCE = "public-lands-state-source";
const STATE_LANDS_LAYER = "public-lands-state-layer";

const ACCESS_SOURCE = "access-fishing-sites-source";
const ACCESS_LAYER = "access-fishing-sites-layer";
const ACTIVE_STATIONS_SOURCE = "active-usgs-stations-source";
const ACTIVE_STATIONS_LAYER = "active-usgs-stations-layer";
const HYDRO_FLOW_LAYER = "hydro-flow-magnitude-layer";
const HYDRO_CHANGE_LAYER = "hydro-change-indicator-layer";
const HYDRO_TEMP_LAYER = "hydro-temp-stress-layer";

const PADUS_SOURCE = "padus-public-lands-source";
const PADUS_LAYER = "padus-public-lands-layer";
// BLM Surface Management Agency cached tiles — verified 200/34KB for Montana.
// Renders colored polygons: green=NFS, yellow=BLM, purple=NPS, teal=FWS.
// USGS PAD-US v3 endpoint is dead; USFS WMS export renders opaque white mask.
const PADUS_TILES =
  "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}";
const STATE_LANDS_GEOJSON =
  "https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/5/query?where=1%3D1&outFields=NAME&returnGeometry=true&f=geojson";
// FWP_ACCESS_GEOJSON removed — we now serve from /api/fishing-access-geojson
// which includes river_id on every feature (the raw FWP endpoint does not).
const RIVER_ID_PROP = "river_id";
const CLICK_PRIORITY_LAYERS = [UNCLUSTERED_LAYER, ACCESS_LAYER, ACTIVE_STATIONS_LAYER] as const;
const MAPBOX_STYLES: Record<BasemapId, string> = {
  hybrid: "mapbox://styles/mapbox/satellite-streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-v9",
  topo: "mapbox://styles/mapbox/outdoors-v12",
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
};
const BASE_STYLE = MAPBOX_STYLES.hybrid;
const MAPBOX_DEM_SOURCE = "mapbox-dem";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

mapboxgl.accessToken = MAPBOX_TOKEN;

function riverIdExpr() {
  return [
    "to-string",
    [
      "coalesce",
      ["get", RIVER_ID_PROP],
      ["get", "river_uuid"],
      ["get", "riverId"],
      ["get", "id"],
      "",
    ],
  ] as any;
}

function selectedRiverFilter(selectedRiverId: string | null | undefined) {
  const sid = selectedRiverId ? String(selectedRiverId) : "";
  if (!sid) return ["==", ["literal", 1], ["literal", 0]] as any;
  return ["==", riverIdExpr(), sid] as any;
}

function extractRiverId(properties?: Record<string, unknown> | null): string | null {
  if (!properties) return null;
  const value =
    properties[RIVER_ID_PROP] ??
    properties.river_uuid ??
    properties.riverId ??
    properties.id ??
    null;
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeGeojson(g: GeoJSON.GeoJSON | null): GeoJSON.GeoJSON | null {
  if (!g) return null;
  if (g.type === "FeatureCollection") return g;
  if (g.type === "Feature") return g;
  if (g.type === "LineString" || g.type === "MultiLineString") {
    return { type: "Feature", properties: {}, geometry: g } as GeoJSON.Feature;
  }
  return g;
}

function getStationTooltipHtml(properties: Record<string, unknown>) {
  const stationName = String(properties.station_name ?? properties.site_no ?? "USGS Station");
  const siteNo = String(properties.site_no ?? "").trim();
  const sourceRoles = String(properties.selected_source_roles ?? "").trim();
  const selectedName = String(properties.selected_river_name ?? "").trim();
  const sourceLabel =
    sourceRoles && selectedName
      ? `Source station for ${selectedName}: ${sourceRoles}`
      : sourceRoles
        ? `Source station: ${sourceRoles}`
        : "USGS monitoring station";

  return `<div style="min-width:168px;font-size:11px;line-height:1.35;color:#0f172a;">
    <div style="font-weight:700;">${escapeHtml(stationName)}</div>
    <div style="margin-top:2px;font-size:10px;color:#475569;">${escapeHtml(siteNo || "USGS site")}</div>
    <div style="margin-top:5px;font-size:10px;color:#1e293b;">${escapeHtml(sourceLabel)}</div>
  </div>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withSelectedRiverMetadata(
  g: GeoJSON.GeoJSON,
  selectedRiverId?: string | null,
  selectedRiverName?: string | null
): GeoJSON.GeoJSON {
  if (!selectedRiverName && !selectedRiverId) return g;
  if (g.type === "Feature") {
    const props = { ...(g.properties ?? {}) } as Record<string, unknown>;
    const hasRiverId =
      props.river_id != null || props.river_uuid != null || props.riverId != null || props.id != null;
    return {
      ...g,
      properties: {
        ...props,
        ...(!hasRiverId && selectedRiverId ? { river_id: selectedRiverId } : {}),
        ...(selectedRiverName ? { name: selectedRiverName, river_name: selectedRiverName } : {}),
      },
    };
  }
  if (g.type === "FeatureCollection") {
    return {
      ...g,
      features: g.features.map((f) => ({
        ...f,
        properties: (() => {
          const props = { ...(f.properties ?? {}) } as Record<string, unknown>;
          const hasRiverId =
            props.river_id != null || props.river_uuid != null || props.riverId != null || props.id != null;
          return {
            ...props,
            ...(!hasRiverId && selectedRiverId ? { river_id: selectedRiverId } : {}),
            ...(selectedRiverName ? { name: selectedRiverName, river_name: selectedRiverName } : {}),
          };
        })(),
      })),
    };
  }
  return {
    type: "Feature",
    properties: {
      ...(selectedRiverId ? { river_id: selectedRiverId } : {}),
      ...(selectedRiverName ? { name: selectedRiverName, river_name: selectedRiverName } : {}),
    },
    geometry: g as GeoJSON.Geometry,
  } as GeoJSON.Feature;
}

function toneRasterBasemap(map: mapboxgl.Map) {
  const style = map.getStyle();
  const rasterLayers = (style.layers ?? []).filter((layer) => layer.type === "raster");
  let tonedCount = 0;

  for (const layer of rasterLayers) {
    const id = layer.id ?? "";
    const lid = id.toLowerCase();
    const isImagery =
      !lid.includes("label") &&
      !lid.includes("reference") &&
      !lid.includes("boundaries") &&
      id !== PADUS_LAYER;
    if (!isImagery) continue;

    try {
      map.setPaintProperty(id, "raster-saturation", -0.15);
      map.setPaintProperty(id, "raster-brightness-min", 0.05);
      map.setPaintProperty(id, "raster-brightness-max", 0.95);
      tonedCount += 1;
    } catch {
      /* ignore per-layer paint failures */
    }
  }

  if (tonedCount === 0 && rasterLayers.length > 0) {
    // Useful when style ids change across providers.
    console.log(
      "MAP RASTER LAYERS",
      rasterLayers.map((layer) => ({ id: layer.id, type: layer.type }))
    );
  }
}

function geojsonBbox(geojson: GeoJSON.GeoJSON): [number, number, number, number] | null {
  const coords: [number, number][] = [];
  const collect = (g: GeoJSON.Geometry) => {
    if (g.type === "Point") coords.push(g.coordinates as [number, number]);
    else if (g.type === "LineString") {
      for (const c of g.coordinates) coords.push(c as [number, number]);
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates) for (const c of line) coords.push(c as [number, number]);
    } else if (g.type === "Polygon") {
      for (const ring of g.coordinates) for (const c of ring) coords.push(c as [number, number]);
    } else if (g.type === "MultiPoint") {
      for (const c of g.coordinates) coords.push(c as [number, number]);
    }
  };

  if ("geometry" in geojson && geojson.geometry) collect(geojson.geometry);
  else if ("coordinates" in geojson) collect(geojson as GeoJSON.Geometry);
  else if ("features" in geojson) {
    for (const f of geojson.features) if (f.geometry) collect(f.geometry);
  }

  if (!coords.length) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function computeBboxFromGeoJSON(
  features: Array<GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>>
): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let hasAny = false;

  const pushCoord = (coord: number[]) => {
    const lng = coord[0];
    const lat = coord[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
    hasAny = true;
  };

  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === "LineString") {
      for (const c of geom.coordinates) pushCoord(c as number[]);
      continue;
    }
    if (geom.type === "MultiLineString") {
      for (const seg of geom.coordinates) {
        for (const c of seg) pushCoord(c as number[]);
      }
    }
  }

  if (!hasAny) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function selectedRiverBoundsFromGeojson(
  geojson: GeoJSON.GeoJSON | null | undefined,
  selectedId: string | null | undefined
): [number, number, number, number] | null {
  if (!geojson || !selectedId) return null;
  const sid = String(selectedId);

  const collectFeatures = (): Array<GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>> => {
    if (geojson.type === "FeatureCollection") {
      return geojson.features
        .filter((f): f is GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => Boolean(f?.geometry))
        .filter((f) => extractRiverId((f.properties as Record<string, unknown> | undefined) ?? null) === sid);
    }
    if (geojson.type === "Feature") {
      if (!geojson.geometry) return [];
      const rid = extractRiverId((geojson.properties as Record<string, unknown> | undefined) ?? null);
      return rid === sid ? [geojson as GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>] : [];
    }
    if (geojson.type === "LineString" || geojson.type === "MultiLineString") {
      return [{ type: "Feature", geometry: geojson, properties: { river_id: sid } }];
    }
    return [];
  };

  const selectedFeatures = collectFeatures();
  return computeBboxFromGeoJSON(selectedFeatures);
}

function riversToFeatureCollection(
  rivers: FishabilityRow[]
): GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> {
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
        flow_ratio_calc: river.flow_ratio_calc ?? null,
        change_48h_pct_calc: river.change_48h_pct_calc ?? null,
        water_temp_f: river.water_temp_f ?? null,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

function ensureRiversSource(map: mapboxgl.Map, rivers: FishabilityRow[]) {
  const fc = riversToFeatureCollection(rivers);
  const src = map.getSource(RIVERS_SOURCE) as
    | { setData?: (d: GeoJSON.FeatureCollection) => void }
    | undefined;

  if (!src) {
    map.addSource(RIVERS_SOURCE, {
      type: "geojson",
      data: fc,
      cluster: false,
      generateId: true,
    });
    return;
  }
  src.setData?.(fc);
}

function ensureRiverPointLayers(map: mapboxgl.Map) {
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
          MRI_COLORS.tough,
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
      paint: { "circle-color": MRI_COLORS.riverHalo, "circle-radius": 15 },
    });
  }

  if (!map.getLayer(SELECTED_CORE_LAYER)) {
    map.addLayer({
      id: SELECTED_CORE_LAYER,
      type: "circle",
      source: RIVERS_SOURCE,
      filter: ["==", ["get", "river_id"], "__none__"],
      paint: {
        "circle-color": "rgba(233,240,247,0.98)",
        "circle-radius": 6,
        "circle-stroke-color": MRI_COLORS.riverSelected,
        "circle-stroke-width": 2,
      },
    });
  }
}

function syncRiverPointPresentation(
  map: mapboxgl.Map,
  selectedRiverId: string | null,
  showMarkers: boolean,
  scoreColoring: boolean
) {
  const rid = selectedRiverId ?? "__none__";
  const visibility = showMarkers ? "visible" : "none";

  for (const layerId of [UNCLUSTERED_LAYER, SELECTED_HALO_LAYER, SELECTED_CORE_LAYER]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }

  if (map.getLayer(SELECTED_HALO_LAYER)) {
    map.setFilter(SELECTED_HALO_LAYER, ["==", ["get", "river_id"], rid]);
  }
  if (map.getLayer(SELECTED_CORE_LAYER)) {
    map.setFilter(SELECTED_CORE_LAYER, ["==", ["get", "river_id"], rid]);
  }

  if (!map.getLayer(UNCLUSTERED_LAYER)) return;

  const circleColor = scoreColoring
    ? [
        "case",
        ["==", ["get", "bite_tier"], "HOT"], BITE_TIER_COLORS.HOT,
        ["==", ["get", "bite_tier"], "GOOD"], BITE_TIER_COLORS.GOOD,
        ["==", ["get", "bite_tier"], "FAIR"], BITE_TIER_COLORS.FAIR,
        ["==", ["get", "bite_tier"], "TOUGH"], BITE_TIER_COLORS.TOUGH,
        MRI_COLORS.tough,
      ]
    : MRI_COLORS.tough;
  map.setPaintProperty(UNCLUSTERED_LAYER, "circle-color", circleColor as any);

  const circleOpacity = selectedRiverId
    ? ["case", ["==", ["get", "river_id"], selectedRiverId], 0.95, 0.38]
    : 0.95;
  map.setPaintProperty(UNCLUSTERED_LAYER, "circle-opacity", circleOpacity as any);
}

function clearSelectedRiverLine(map: mapboxgl.Map) {
  if (map.getLayer(RIVER_NAMES_LAYER)) map.removeLayer(RIVER_NAMES_LAYER);
  if (map.getLayer(RIVER_HIT_LAYER)) map.removeLayer(RIVER_HIT_LAYER);
  if (map.getLayer(RIVER_SELECTED_LAYER)) map.removeLayer(RIVER_SELECTED_LAYER);
  if (map.getLayer(RIVER_BASE_LAYER)) map.removeLayer(RIVER_BASE_LAYER);
  if (map.getLayer(RIVER_CASING_LAYER)) map.removeLayer(RIVER_CASING_LAYER);
  if (map.getSource(RIVER_LABELS_SOURCE)) map.removeSource(RIVER_LABELS_SOURCE);
  if (map.getSource(ALL_RIVERS_SOURCE)) map.removeSource(ALL_RIVERS_SOURCE);
}

function toLineLabelFeatures(
  geojson: GeoJSON.GeoJSON
): GeoJSON.FeatureCollection<GeoJSON.LineString, Record<string, unknown>> {
  const bestByRiver = new Map<string, GeoJSON.Feature<GeoJSON.LineString, Record<string, unknown>>>();
  const scoreLine = (coords: number[][]) => coords.length;
  const pushCandidate = (props: Record<string, unknown>, coords: number[][]) => {
    const riverId =
      String(props.river_id ?? props.river_uuid ?? props.riverId ?? props.id ?? "").trim();
    if (!riverId || !coords?.length) return;
    const candidate: GeoJSON.Feature<GeoJSON.LineString, Record<string, unknown>> = {
      type: "Feature",
      properties: props,
      geometry: { type: "LineString", coordinates: coords as [number, number][] },
    };
    const existing = bestByRiver.get(riverId);
    if (!existing || scoreLine(existing.geometry.coordinates as number[][]) < scoreLine(coords)) {
      bestByRiver.set(riverId, candidate);
    }
  };

  const handleFeature = (f: GeoJSON.Feature) => {
    if (!f.geometry) return;
    const props = { ...(f.properties ?? {}) } as Record<string, unknown>;
    if (f.geometry.type === "LineString") {
      pushCandidate(props, f.geometry.coordinates as number[][]);
      return;
    }
    if (f.geometry.type === "MultiLineString") {
      for (const seg of f.geometry.coordinates) pushCandidate(props, seg as number[][]);
    }
  };

  if (geojson.type === "FeatureCollection") {
    for (const f of geojson.features) handleFeature(f);
  } else if (geojson.type === "Feature") {
    handleFeature(geojson);
  } else if (geojson.type === "LineString") {
    handleFeature({ type: "Feature", properties: {}, geometry: geojson });
  } else if (geojson.type === "MultiLineString") {
    handleFeature({ type: "Feature", properties: {}, geometry: geojson });
  }

  return { type: "FeatureCollection", features: Array.from(bestByRiver.values()) };
}

function syncSelectedRiverLine(
  map: mapboxgl.Map,
  geojson: GeoJSON.GeoJSON | null,
  selectedRiverId: string | null | undefined,
  selectedRiverName: string | null | undefined,
  showRiverLines: boolean,
  showSelectedHighlight: boolean,
  showLabels: boolean
) {
  const highlightEnabled = showRiverLines && showSelectedHighlight;
  if (!geojson || (!showRiverLines && !highlightEnabled)) {
    clearSelectedRiverLine(map);
    return;
  }

  const data = normalizeGeojson(geojson);
  if (!data) return;
  const namedData = withSelectedRiverMetadata(data, selectedRiverId, selectedRiverName);
  const rid = selectedRiverId ? String(selectedRiverId) : "";
  const selectedFilter = selectedRiverFilter(rid);

  const src = map.getSource(ALL_RIVERS_SOURCE) as
    | { setData?: (d: GeoJSON.GeoJSON) => void }
    | undefined;

  if (!src) {
    map.addSource(ALL_RIVERS_SOURCE, { type: "geojson", data: namedData });
  } else {
    src.setData?.(namedData);
  }

  // Anchor river line layers just before the unclustered point markers so they
  // are explicitly above the base-style raster (satellite) layers.  Without a
  // beforeId, Mapbox GL appends to the style's layer array, but freshly-loaded
  // satellite tiles can composite over un-anchored custom layers before the
  // style fully settles.  UNCLUSTERED_LAYER is added by ensureRiverPointLayers
  // before this function is called from syncRuntimeLayers; fall back to
  // undefined (append-to-top) when called from the selection effect.
  const lineAnchorId = map.getLayer(UNCLUSTERED_LAYER) ? UNCLUSTERED_LAYER : undefined;

  if (showRiverLines && !map.getLayer(RIVER_CASING_LAYER)) {
    map.addLayer({
      id: RIVER_CASING_LAYER,
      type: "line",
      source: ALL_RIVERS_SOURCE,
      minzoom: 4,
      maxzoom: 24,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#0b1e28",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 2.2,
          6, 3.2,
          8, 4.7,
          10, 6.2,
          12, 8.4,
        ],
        "line-opacity": 0.82,
      },
    }, lineAnchorId);
  } else if (!showRiverLines && map.getLayer(RIVER_CASING_LAYER)) {
    map.removeLayer(RIVER_CASING_LAYER);
  }

  if (showRiverLines && !map.getLayer(RIVER_BASE_LAYER)) {
    map.addLayer({
      id: RIVER_BASE_LAYER,
      type: "line",
      source: ALL_RIVERS_SOURCE,
      minzoom: 4,
      maxzoom: 24,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#4aa3ff",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 1.15,
          6, 1.9,
          8, 2.9,
          10, 4.15,
          12, 5.5,
        ],
        "line-opacity": 0.8,
      },
    }, lineAnchorId);
  } else if (!showRiverLines && map.getLayer(RIVER_BASE_LAYER)) {
    map.removeLayer(RIVER_BASE_LAYER);
  }

  if (showRiverLines && !map.getLayer(RIVER_HIT_LAYER)) {
    map.addLayer({
      id: RIVER_HIT_LAYER,
      type: "line",
      source: ALL_RIVERS_SOURCE,
      minzoom: 4,
      maxzoom: 24,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "rgba(0,0,0,0)",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 12,
          6, 16,
          8, 20,
          10, 24,
          12, 28,
        ],
        "line-opacity": 0,
      },
    }, lineAnchorId);
  } else if (!showRiverLines && map.getLayer(RIVER_HIT_LAYER)) {
    map.removeLayer(RIVER_HIT_LAYER);
  }

  if (highlightEnabled && !map.getLayer(RIVER_SELECTED_LAYER)) {
    map.addLayer({
      id: RIVER_SELECTED_LAYER,
      type: "line",
      source: ALL_RIVERS_SOURCE,
      filter: selectedFilter,
      minzoom: 4,
      maxzoom: 24,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#8fd0ff",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4, 4.8,
          6, 6.8,
          8, 9.2,
          10, 12,
          12, 15.2,
        ],
        "line-opacity": 1,
        "line-blur": 0.2,
      },
    }, lineAnchorId);
  } else if (!highlightEnabled && map.getLayer(RIVER_SELECTED_LAYER)) {
    map.removeLayer(RIVER_SELECTED_LAYER);
  }

  if (map.getLayer(RIVER_CASING_LAYER)) {
    map.setPaintProperty(RIVER_CASING_LAYER, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      4, 2.2,
      6, 3.2,
      8, 4.7,
      10, 6.2,
      12, 8.4,
    ] as any);
    map.setPaintProperty(RIVER_CASING_LAYER, "line-opacity", 0.82 as any);
  }
  if (map.getLayer(RIVER_BASE_LAYER)) {
    map.setPaintProperty(RIVER_BASE_LAYER, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      4, 1.15,
      6, 1.9,
      8, 2.9,
      10, 4.15,
      12, 5.5,
    ] as any);
    map.setPaintProperty(RIVER_BASE_LAYER, "line-opacity", 0.8 as any);
  }
  if (map.getLayer(RIVER_HIT_LAYER)) {
    map.setPaintProperty(RIVER_HIT_LAYER, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      4, 12,
      6, 16,
      8, 20,
      10, 24,
      12, 28,
    ] as any);
    map.setPaintProperty(RIVER_HIT_LAYER, "line-opacity", 0 as any);
  }
  if (map.getLayer(RIVER_SELECTED_LAYER)) {
    map.setFilter(RIVER_SELECTED_LAYER, selectedFilter);
    map.setPaintProperty(RIVER_SELECTED_LAYER, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      4, 4.8,
      6, 6.8,
      8, 9.2,
      10, 12,
      12, 15.2,
    ] as any);
    map.setPaintProperty(RIVER_SELECTED_LAYER, "line-blur", 0.2 as any);
  }

  if (showLabels && !map.getLayer(RIVER_NAMES_LAYER)) {
    const labels = toLineLabelFeatures(namedData);
    const labelSrc = map.getSource(RIVER_LABELS_SOURCE) as
      | { setData?: (d: GeoJSON.FeatureCollection) => void }
      | undefined;
    if (!labelSrc) {
      map.addSource(RIVER_LABELS_SOURCE, { type: "geojson", data: labels });
    } else {
      labelSrc.setData?.(labels);
    }

    map.addLayer({
      id: RIVER_NAMES_LAYER,
      type: "symbol",
      source: RIVER_LABELS_SOURCE,
      minzoom: 7,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 500,
        "text-field": ["coalesce", ["get", "river_name"], ["get", "name"], ""],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 10, 13, 12, 15],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-padding": 2,
        "text-max-angle": 30,
        "text-letter-spacing": 0.02,
      },
      paint: {
        "text-color": "rgba(188,204,219,0.9)",
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8, 0.6, 10, 0.82],
        "text-halo-color": "rgba(14,22,32,0.88)",
        "text-halo-width": 1,
        "text-halo-blur": 0.5,
      },
    }, lineAnchorId);
  } else if (showLabels && map.getLayer(RIVER_NAMES_LAYER)) {
    const labels = toLineLabelFeatures(namedData);
    const labelSrc = map.getSource(RIVER_LABELS_SOURCE) as
      | { setData?: (d: GeoJSON.FeatureCollection) => void }
      | undefined;
    labelSrc?.setData?.(labels);
  } else if (!showLabels && map.getLayer(RIVER_NAMES_LAYER)) {
    map.removeLayer(RIVER_NAMES_LAYER);
    if (map.getSource(RIVER_LABELS_SOURCE)) map.removeSource(RIVER_LABELS_SOURCE);
  }

  try {
    if (map.getLayer(STATEWIDE_HYDRO_LAYER) && map.getLayer(RIVER_SELECTED_LAYER)) {
      map.moveLayer(RIVER_SELECTED_LAYER);
    }
    if (map.getLayer(RIVER_CASING_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(RIVER_CASING_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(RIVER_BASE_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(RIVER_BASE_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(RIVER_SELECTED_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(RIVER_SELECTED_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(RIVER_HIT_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(RIVER_HIT_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(RIVER_NAMES_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(RIVER_NAMES_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(UNCLUSTERED_LAYER);
    }
    if (map.getLayer(SELECTED_HALO_LAYER)) {
      map.moveLayer(SELECTED_HALO_LAYER);
    }
    if (map.getLayer(SELECTED_CORE_LAYER)) {
      map.moveLayer(SELECTED_CORE_LAYER);
    }
  } catch {
    /* ignore */
  }
}

function syncStatewideHydrologyLayer(map: mapboxgl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource(STATEWIDE_HYDRO_SOURCE)) {
      map.addSource(STATEWIDE_HYDRO_SOURCE, {
        type: "geojson",
        data: "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/2/query?where=1%3D1&geometry=-116.2,44.2,-104,49.2&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelContains&outFields=GNIS_NAME&returnGeometry=true&geometryPrecision=4&maxAllowableOffset=0.005&f=geojson" as any,
      } as any);
    }
    if (!map.getLayer(STATEWIDE_HYDRO_LAYER)) {
      map.addLayer({
        id: STATEWIDE_HYDRO_LAYER,
        type: "line",
        source: STATEWIDE_HYDRO_SOURCE,
        paint: {
          "line-color": MRI_COLORS.riverCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 8, 0.55, 11, 0.9],
          "line-opacity": 0.7,
        },
      });
    }
    try {
      if (map.getLayer(RIVER_CASING_LAYER)) {
        map.moveLayer(STATEWIDE_HYDRO_LAYER, RIVER_CASING_LAYER);
      } else if (map.getLayer(UNCLUSTERED_LAYER)) {
        map.moveLayer(STATEWIDE_HYDRO_LAYER, UNCLUSTERED_LAYER);
      }
    } catch {
      /* ignore */
    }
    return;
  }
  if (map.getLayer(STATEWIDE_HYDRO_LAYER)) map.removeLayer(STATEWIDE_HYDRO_LAYER);
}

// Federal BLM layer consolidated into SMA (padus_public_lands).
// This stub removes any previously cached federal layer on map load.
function syncFederalLandsLayer(map: mapboxgl.Map, _enabled: boolean) {
  const legacyLayer = "public-lands-federal-layer";
  const legacySource = "public-lands-federal-source";
  if (map.getLayer(legacyLayer)) map.removeLayer(legacyLayer);
  if (map.getSource(legacySource)) map.removeSource(legacySource);
}

function syncPadusLayer(map: mapboxgl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource(PADUS_SOURCE)) {
      map.addSource(PADUS_SOURCE, {
        type: "raster",
        tiles: [PADUS_TILES],
        tileSize: 256,
        attribution: "BLM Surface Management Agency",
      });
    }
    if (!map.getLayer(PADUS_LAYER)) {
      map.addLayer({
        id: PADUS_LAYER,
        type: "raster",
        source: PADUS_SOURCE,
        minzoom: 6,
        paint: {
          "raster-opacity": 0.35,
        },
      });
    }
    // Sit below hydrology and river lines so they stay readable
    try {
      if (map.getLayer(STATEWIDE_HYDRO_LAYER)) {
        map.moveLayer(PADUS_LAYER, STATEWIDE_HYDRO_LAYER);
      } else if (map.getLayer(RIVER_CASING_LAYER)) {
        map.moveLayer(PADUS_LAYER, RIVER_CASING_LAYER);
      } else if (map.getLayer(UNCLUSTERED_LAYER)) {
        map.moveLayer(PADUS_LAYER, UNCLUSTERED_LAYER);
      }
    } catch {
      /* ignore ordering failures */
    }
    return;
  }
  if (map.getLayer(PADUS_LAYER)) map.removeLayer(PADUS_LAYER);
  if (map.getSource(PADUS_SOURCE)) map.removeSource(PADUS_SOURCE);
}

function syncStateLandsLayer(map: mapboxgl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource(STATE_LANDS_SOURCE)) {
      map.addSource(STATE_LANDS_SOURCE, {
        type: "geojson",
        data: STATE_LANDS_GEOJSON as any,
      } as any);
    }
    if (!map.getLayer(STATE_LANDS_LAYER)) {
      map.addLayer({
        id: STATE_LANDS_LAYER,
        type: "fill",
        source: STATE_LANDS_SOURCE,
        minzoom: 8,
        paint: {
          "fill-color": "#4a7c3f",
          "fill-opacity": 0.22,
          "fill-outline-color": "rgba(74,124,63,0.6)",
        },
      });
    }
    try {
      if (map.getLayer(STATEWIDE_HYDRO_LAYER)) {
        map.moveLayer(STATE_LANDS_LAYER, STATEWIDE_HYDRO_LAYER);
      } else if (map.getLayer(RIVER_CASING_LAYER)) {
        map.moveLayer(STATE_LANDS_LAYER, RIVER_CASING_LAYER);
      }
    } catch {
      /* ignore */
    }
    return;
  }
  if (map.getLayer(STATE_LANDS_LAYER)) {
    map.removeLayer(STATE_LANDS_LAYER);
  }
}

// URL for our own API endpoint that returns fishing_access_sites as GeoJSON
// with river_id on every feature (the raw FWP endpoint does not include river_id).
const ACCESS_GEOJSON_URL = "/api/fishing-access-geojson";

function syncFishingAccessLayer(
  map: mapboxgl.Map,
  enabled: boolean,
  selectedRiverUuid: string | null,
  riverTier: string | null,
  cachedGeojson?: GeoJSON.FeatureCollection | null
) {
  console.log('[access-fn] called, uuid:', selectedRiverUuid, 'enabled:', enabled, 'cachedFeatures:', cachedGeojson?.features?.length ?? 'null');

  // Always tear down layer and source first — guarantees a clean slate
  if (map.getLayer(ACCESS_LAYER)) map.removeLayer(ACCESS_LAYER);
  if (map.getSource(ACCESS_SOURCE)) map.removeSource(ACCESS_SOURCE);
  console.log('[access-fn] removed old layer/source');

  if (!enabled || !selectedRiverUuid || !cachedGeojson) return;

  // Pre-filter in JS so the source only contains this river's points — no layer filter needed
  const filteredFeatures = cachedGeojson.features.filter(
    (f) => f.properties?.river_id === selectedRiverUuid
  );
  console.log('[access-fn] filtered features for uuid:', filteredFeatures.length);

  const filteredGeojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: filteredFeatures,
  };

  map.addSource(ACCESS_SOURCE, { type: "geojson", data: filteredGeojson });
  console.log('[access-fn] source added');

  const pinColor = riverTier === "TOUGH" ? "#dc2626"
    : riverTier === "FAIR" ? "#d4900a"
    : "#2d5a1b";

  map.addLayer({
    id: ACCESS_LAYER,
    type: "circle",
    source: ACCESS_SOURCE,
    minzoom: 7,
    paint: {
      "circle-color": pinColor,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 5, 10, 8, 13, 10],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
      "circle-opacity": 0.95,
    },
  });
  console.log('[access-fn] layer added');

  try {
    if (map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(ACCESS_LAYER, UNCLUSTERED_LAYER);
    }
  } catch {
    /* ignore */
  }
}

function syncActiveStationsLayer(
  map: mapboxgl.Map,
  enabled: boolean,
  stationsGeojson: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> | null | undefined,
  selectedRiver: FishabilityRow | null | undefined,
  highlightedStationSiteNo?: string | null
) {
  const hasFeatures = Boolean(stationsGeojson?.features?.length);
  if (!enabled || !hasFeatures) {
    if (map.getLayer(ACTIVE_STATIONS_LAYER)) {
      map.removeLayer(ACTIVE_STATIONS_LAYER);
    }
    if (map.getSource(ACTIVE_STATIONS_SOURCE)) {
      map.removeSource(ACTIVE_STATIONS_SOURCE);
    }
    return;
  }

  const selectedFlowSiteNo = selectedRiver?.flow_source_site_no ? String(selectedRiver.flow_source_site_no) : "";
  const selectedTempSiteNo = selectedRiver?.temp_source_site_no ? String(selectedRiver.temp_source_site_no) : "";
  const selectedRiverName = selectedRiver?.river_name ?? null;
  const selectedRiverId = selectedRiver?.river_id ? String(selectedRiver.river_id) : null;
  console.log('[render] selectedRiverId:', selectedRiverId);

  const annotatedStations: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> = {
    type: "FeatureCollection",
    features: (stationsGeojson?.features ?? []).map((feature) => {
      const props = { ...(feature.properties ?? {}) } as Record<string, unknown>;
      const siteNo = props.site_no != null ? String(props.site_no) : "";
      const isFlowSource = Boolean(selectedFlowSiteNo && siteNo === selectedFlowSiteNo);
      const isTempSource = Boolean(selectedTempSiteNo && siteNo === selectedTempSiteNo);
      const isHighlighted = Boolean(highlightedStationSiteNo && siteNo === highlightedStationSiteNo);
      return {
        ...feature,
        properties: {
          ...props,
          is_selected_source: isFlowSource || isTempSource,
          is_selected_flow_source: isFlowSource,
          is_selected_temp_source: isTempSource,
          is_highlighted: isHighlighted,
          selected_source_roles: [isFlowSource ? "flow" : null, isTempSource ? "temp" : null]
            .filter(Boolean)
            .join(" + "),
          selected_river_name: selectedRiverName,
          selected_river_id: selectedRiverId,
        },
      };
    }),
  };

  const src = map.getSource(ACTIVE_STATIONS_SOURCE) as
    | { setData?: (d: GeoJSON.FeatureCollection) => void }
    | undefined;

  if (!src) {
    map.addSource(ACTIVE_STATIONS_SOURCE, {
      type: "geojson",
      data: annotatedStations,
    });
  } else {
    src.setData?.(annotatedStations);
  }

  if (!map.getLayer(ACTIVE_STATIONS_LAYER)) {
    map.addLayer({
      id: ACTIVE_STATIONS_LAYER,
      type: "circle",
      source: ACTIVE_STATIONS_SOURCE,
      minzoom: 5,
      paint: {
        // Navy fill — visually distinct from green fishing access circles
        // Highlighted (strip-clicked) station: white fill with green stroke
        "circle-color": [
          "case",
          ["==", ["get", "is_highlighted"], true],
          "#ffffff",
          ["==", ["get", "is_selected_source"], true],
          "#ffffff",
          "#1a3a5c",
        ],
        "circle-radius": [
          "case",
          ["==", ["get", "is_highlighted"], true],
          10,
          ["==", ["get", "is_selected_source"], true],
          7,
          5,
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "is_highlighted"], true],
          "#2d5a1b",
          ["==", ["get", "is_selected_source"], true],
          "#5b9bd5",
          "#7eb8d4",
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "is_highlighted"], true],
          3,
          1.5,
        ],
        "circle-opacity": 0.96,
      },
    });
  }

  try {
    if (map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(ACTIVE_STATIONS_LAYER, UNCLUSTERED_LAYER);
    }
  } catch {
    /* ignore */
  }
}

function syncHydrologyOverlays(
  map: mapboxgl.Map,
  showFlowMagnitude: boolean,
  showChangeIndicator: boolean,
  showTempStress: boolean
) {
  if (showFlowMagnitude) {
    if (!map.getLayer(HYDRO_FLOW_LAYER)) {
      map.addLayer({
        id: HYDRO_FLOW_LAYER,
        type: "circle",
        source: RIVERS_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "flow_ratio_calc"], 1],
            0.4, MRI_COLORS.riverSelected,
            0.8, MRI_COLORS.good,
            1.0, MRI_COLORS.fair,
            1.5, MRI_COLORS.warning,
            2.0, MRI_COLORS.warning,
          ],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 9, 4.2, 12, 5.2],
          "circle-opacity": 0.8,
        },
      });
    }
  } else if (map.getLayer(HYDRO_FLOW_LAYER)) {
    map.removeLayer(HYDRO_FLOW_LAYER);
  }

  if (showChangeIndicator) {
    if (!map.getLayer(HYDRO_CHANGE_LAYER)) {
      map.addLayer({
        id: HYDRO_CHANGE_LAYER,
        type: "symbol",
        source: RIVERS_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "text-field": [
            "case",
            [">", ["coalesce", ["get", "change_48h_pct_calc"], 0], 12], "▲",
            ["<", ["coalesce", ["get", "change_48h_pct_calc"], 0], -12], "▼",
            "•",
          ],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 10, 12],
          "text-offset": [0, 1.3],
        },
        paint: {
          "text-color": [
            "case",
            [">", ["coalesce", ["get", "change_48h_pct_calc"], 0], 12], MRI_COLORS.good,
            ["<", ["coalesce", ["get", "change_48h_pct_calc"], 0], -12], MRI_COLORS.warning,
            "#94a3b8",
          ],
          "text-halo-color": "rgba(15,23,42,0.9)",
          "text-halo-width": 1,
        },
      });
    }
  } else if (map.getLayer(HYDRO_CHANGE_LAYER)) {
    map.removeLayer(HYDRO_CHANGE_LAYER);
  }

  if (showTempStress) {
    if (!map.getLayer(HYDRO_TEMP_LAYER)) {
      map.addLayer({
        id: HYDRO_TEMP_LAYER,
        type: "circle",
        source: RIVERS_SOURCE,
        filter: [
          "all",
          ["==", ["geometry-type"], "Point"],
          [">=", ["coalesce", ["get", "water_temp_f"], 0], 67],
        ],
        paint: {
          "circle-color": MRI_COLORS.warning,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 10, 7.5],
          "circle-stroke-color": "rgba(255,255,255,0.95)",
          "circle-stroke-width": 1.2,
          "circle-opacity": 0.8,
        },
      });
    }
  } else if (map.getLayer(HYDRO_TEMP_LAYER)) {
    map.removeLayer(HYDRO_TEMP_LAYER);
  }

  try {
    if (map.getLayer(HYDRO_FLOW_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(HYDRO_FLOW_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(HYDRO_CHANGE_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(HYDRO_CHANGE_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(HYDRO_TEMP_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(HYDRO_TEMP_LAYER, UNCLUSTERED_LAYER);
    }
  } catch {
    /* ignore */
  }
}

function syncLabels(map: mapboxgl.Map, visible: boolean) {
  const style = map.getStyle();
  const visibility = visible ? "visible" : "none";
  for (const layer of style.layers ?? []) {
    if (!layer.id) continue;
    const id = layer.id.toLowerCase();
    if (layer.id === RIVER_NAMES_LAYER || (layer as any).source === RIVER_LABELS_SOURCE) continue;
    const hasTextField = layer.type === "symbol" && Boolean((layer as any).layout?.["text-field"]);
    if (hasTextField || id.includes("road-label") || id.includes("place-label") || id.includes("poi-label")) {
      try {
        map.setLayoutProperty(layer.id, "visibility", visibility);
      } catch {
        /* ignore */
      }
    }
  }
}

// ─── Waypoint helpers ─────────────────────────────────────────────────────────

function createWaypointEl(wp: Waypoint): HTMLElement {
  const fill = WAYPOINT_COLORS[wp.color] ?? "#16a34a";
  const shortLabel = wp.label.slice(0, 3);
  const el = document.createElement("div");
  el.style.cssText = "width:30px;height:40px;position:relative;cursor:pointer;";
  el.innerHTML = `
    <div style="width:28px;height:28px;background:${fill};border-radius:50%;border:2.5px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center;
      position:absolute;top:0;left:0;overflow:hidden;">
      <span style="color:white;font-size:8px;font-weight:700;white-space:nowrap;overflow:hidden;
        max-width:22px;text-overflow:ellipsis;">${escapeHtml(shortLabel)}</span>
    </div>
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;
      border-top:12px solid ${fill};position:absolute;bottom:0;left:50%;transform:translateX(-50%);"></div>
  `;
  return el;
}

function openAddWaypointPopup(
  map: mapboxgl.Map,
  lngLat: mapboxgl.LngLat,
  onSave: (wp: Omit<Waypoint, "id" | "created_at">) => void
) {
  const colors: Array<{ key: Waypoint["color"]; hex: string }> = [
    { key: "green", hex: WAYPOINT_COLORS.green },
    { key: "red", hex: WAYPOINT_COLORS.red },
    { key: "blue", hex: WAYPOINT_COLORS.blue },
    { key: "yellow", hex: WAYPOINT_COLORS.yellow },
  ];
  const colorSwatches = colors.map((c) =>
    `<label style="cursor:pointer;" title="${c.key}">
      <input type="radio" name="wp-color" value="${c.key}" ${c.key === "green" ? "checked" : ""}
        style="position:absolute;opacity:0;width:0;height:0;">
      <span class="wp-swatch" data-color="${c.key}"
        style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${c.hex};
          border:2px solid transparent;box-sizing:border-box;transition:border-color 0.1s;">
      </span>
    </label>`
  ).join("");

  const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 12, maxWidth: "220px" })
    .setLngLat(lngLat)
    .setHTML(`
      <div style="font-family:system-ui,sans-serif;padding:2px 0;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#555;margin-bottom:6px;">Add Waypoint</div>
        <input id="wp-label-input" placeholder="My spot" maxlength="32"
          style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:5px;
            padding:5px 8px;font-size:13px;outline:none;margin-bottom:8px;"/>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;">
          ${colorSwatches}
        </div>
        <div style="display:flex;gap:6px;">
          <button id="wp-save-btn"
            style="flex:1;background:#2d5a1b;color:white;border:none;border-radius:5px;
              padding:6px 0;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
          <button id="wp-cancel-btn"
            style="flex:1;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;
              border-radius:5px;padding:6px 0;font-size:12px;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `)
    .addTo(map);

  const container = popup.getElement();

  // Update swatch border when color radio changes
  container.querySelectorAll("input[name='wp-color']").forEach((input) => {
    input.addEventListener("change", () => {
      container.querySelectorAll(".wp-swatch").forEach((s) => {
        (s as HTMLElement).style.border = "2px solid transparent";
      });
      const swatch = container.querySelector(`.wp-swatch[data-color="${(input as HTMLInputElement).value}"]`);
      if (swatch) (swatch as HTMLElement).style.border = "2.5px solid #1a1a1a";
    });
  });
  // Set initial border on green
  const defaultSwatch = container.querySelector(".wp-swatch[data-color='green']");
  if (defaultSwatch) (defaultSwatch as HTMLElement).style.border = "2.5px solid #1a1a1a";

  container.querySelector("#wp-cancel-btn")?.addEventListener("click", () => popup.remove());

  container.querySelector("#wp-save-btn")?.addEventListener("click", () => {
    const labelInput = container.querySelector("#wp-label-input") as HTMLInputElement | null;
    const colorInput = container.querySelector("input[name='wp-color']:checked") as HTMLInputElement | null;
    const label = labelInput?.value?.trim() || "My spot";
    const color = (colorInput?.value ?? "green") as Waypoint["color"];
    onSave({ lat: lngLat.lat, lng: lngLat.lng, label, note: "", color });
    popup.remove();
  });
}

function openWaypointInfoPopup(
  map: mapboxgl.Map,
  wp: Waypoint,
  markerLngLat: mapboxgl.LngLat,
  onRemove: (id: string) => void
) {
  const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: "200px" })
    .setLngLat(markerLngLat)
    .setHTML(`
      <div style="font-family:system-ui,sans-serif;padding:2px 0;">
        <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${escapeHtml(wp.label)}</div>
        ${wp.note ? `<div style="font-size:11px;color:#555;margin-bottom:6px;">${escapeHtml(wp.note)}</div>` : ""}
        <div style="font-size:10px;color:#999;margin-bottom:8px;">${new Date(wp.created_at).toLocaleDateString()}</div>
        <button id="wp-delete-btn"
          style="width:100%;background:#dc2626;color:white;border:none;border-radius:5px;
            padding:5px 0;font-size:12px;font-weight:600;cursor:pointer;">Delete waypoint</button>
      </div>
    `)
    .addTo(map);

  popup.getElement().querySelector("#wp-delete-btn")?.addEventListener("click", () => {
    onRemove(wp.id);
    popup.remove();
  });
}

export function MapView({
  rivers,
  selectedRiver,
  selectedRiverName,
  selectedRiverId,
  selectedRiverGeojson,
  riverLinesGeojson,
  activeStationsGeojson,
  basemap = "hybrid",
  layerState,
  rightPanelOpen = false,
  drawerState = "mid",
  selectionSeq = 0,
  onSelectRiver,
  className,
  initialStyleUrl,
  onMapReady,
  highlightedStationSiteNo,
  waypoints = [],
  onWaypointSave,
  onWaypointRemove,
}: MapViewProps) {
  const effectiveLayerState = layerState ?? createDefaultLayerState();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const riversRef = useRef(rivers);
  const onSelectRiverRef = useRef(onSelectRiver);
  const selectedRiverRef = useRef(selectedRiver);
  const selectedRiverNameRef = useRef(selectedRiverName);
  const selectedRiverIdRef = useRef(selectedRiverId);
  const selectedRiverGeojsonRef = useRef(selectedRiverGeojson);
  const riverLinesGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(riverLinesGeojson ?? null);
  const activeStationsGeojsonRef = useRef<
    GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> | null
  >(activeStationsGeojson ?? null);
  // Pre-fetched access sites GeoJSON — fetched once on mount so the data is
  // always present when syncFishingAccessLayer runs (no async gap on first select)
  const accessGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const currentStyleRef = useRef<string>(MAPBOX_STYLES[basemap] ?? BASE_STYLE);
  const layerStateRef = useRef<Record<LayerId, boolean>>(effectiveLayerState);
  const onMapReadyRef = useRef(onMapReady);
  const hoverIdRef = useRef<number | string | null>(null);
  const lastFlownRef = useRef<string | null>(null);
  const lastFitSignatureRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapInitError, setMapInitError] = useState<string | null>(null);
  // Incremented each time the access GeoJSON fetch completes — gives the fishing
  // access effect a reactive dependency to re-run on mobile where style.load fires
  // before the fetch returns, making the subsequent setMapReady(true) a no-op.
  const [accessGeojsonVersion, setAccessGeojsonVersion] = useState(0);

  riversRef.current = rivers;
  onSelectRiverRef.current = onSelectRiver;
  selectedRiverRef.current = selectedRiver;
  selectedRiverNameRef.current = selectedRiverName;
  selectedRiverIdRef.current = selectedRiverId;
  selectedRiverGeojsonRef.current = selectedRiverGeojson;
  riverLinesGeojsonRef.current = riverLinesGeojson ?? null;
  activeStationsGeojsonRef.current = activeStationsGeojson ?? null;
  layerStateRef.current = effectiveLayerState;
  onMapReadyRef.current = onMapReady;
  const highlightedStationSiteNoRef = useRef<string | null | undefined>(highlightedStationSiteNo);
  highlightedStationSiteNoRef.current = highlightedStationSiteNo;

  // ── Waypoint state
  const waypointMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const onWaypointSaveRef = useRef(onWaypointSave);
  onWaypointSaveRef.current = onWaypointSave;
  const onWaypointRemoveRef = useRef(onWaypointRemove);
  onWaypointRemoveRef.current = onWaypointRemove;
  // Long-press state (not React state — avoids re-renders)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressDraggedRef = useRef(false);

  const syncRuntimeLayers = useCallback((map: mapboxgl.Map) => {
    toneRasterBasemap(map);
    ensureRiversSource(map, riversRef.current);
    ensureRiverPointLayers(map);
    syncRiverPointPresentation(
      map,
      selectedRiverIdRef.current,
      true,
      layerStateRef.current.mri_score_coloring
    );
    syncSelectedRiverLine(
      map,
      riverLinesGeojsonRef.current ?? selectedRiverGeojsonRef.current,
      selectedRiverIdRef.current,
      selectedRiverNameRef.current,
      layerStateRef.current.mri_river_lines,
      layerStateRef.current.mri_selected_highlight,
      layerStateRef.current.mri_labels
    );
    syncStatewideHydrologyLayer(map, layerStateRef.current.statewide_hydrology);
    syncPadusLayer(map, layerStateRef.current.padus_public_lands);
    syncFederalLandsLayer(map, false); // one-time cleanup of legacy layer
    syncStateLandsLayer(map, layerStateRef.current.public_state);
    // Fishing access is handled exclusively by the dedicated useEffect which has
    // reliable access to the current selectedRiverId via props — not refs.
    syncActiveStationsLayer(
      map,
      layerStateRef.current.mri_active_stations,
      activeStationsGeojsonRef.current,
      selectedRiverRef.current,
      highlightedStationSiteNoRef.current
    );
    syncHydrologyOverlays(
      map,
      layerStateRef.current.hydro_flow_magnitude,
      layerStateRef.current.hydro_change_indicator,
      layerStateRef.current.hydro_temp_stress
    );
    syncLabels(map, layerStateRef.current.mri_labels);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    setMapInitError(null);

    if (!MAPBOX_TOKEN) {
      setMapInitError("Missing NEXT_PUBLIC_MAPBOX_TOKEN.");
      return;
    }
    const initialStyle = initialStyleUrl ?? MAPBOX_STYLES[basemap] ?? BASE_STYLE;
    currentStyleRef.current = initialStyle;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: MONTANA_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 14,
        bearing: 0,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to initialize map";
      setMapInitError(msg);
      return;
    }

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;
    const stationHoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      className: "mri-station-tooltip",
    });

    map.on("load", () => {
      try {
        if (!map.getSource(MAPBOX_DEM_SOURCE)) {
          map.addSource(MAPBOX_DEM_SOURCE, {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          } as any);
        }
        map.setTerrain({ source: MAPBOX_DEM_SOURCE, exaggeration: 1.1 });
      } catch {
        // Terrain is optional; keep the map usable even when DEM/WebGL2 is unavailable.
      }

      // Fetch access GeoJSON before calling syncRuntimeLayers so the data is
      // always present when syncFishingAccessLayer first runs (no async race).
      console.log("[access-load] fetching access GeoJSON before syncRuntimeLayers");
      fetch(ACCESS_GEOJSON_URL)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((geojson: GeoJSON.FeatureCollection) => {
          console.log("[access-load] access GeoJSON loaded, features:", geojson.features?.length ?? 0);
          accessGeojsonRef.current = geojson;
          // Increment version so the fishing access effect re-runs even if
          // mapReady is already true (style.load fires before this fetch returns
          // on mobile, making the setMapReady(true) below a no-op).
          setAccessGeojsonVersion((v) => v + 1);
        })
        .catch((err) => console.warn("[access-load] fetch failed:", err))
        .finally(() => {
          setMapReady(true);
          onMapReadyRef.current?.(map);
          syncRuntimeLayers(map);
          map.resize();
        });
    });

    map.on("error", (event) => {
      const msg = (event as any)?.error?.message;
      if (typeof msg === "string" && /Failed to initialize WebGL/i.test(msg)) {
        setMapInitError(msg);
      }
    });

    if (!(map as any).__mriHandlers) {
      (map as any).__mriHandlers = true;
      map.on("click", UNCLUSTERED_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
        if (e.originalEvent && "cancelBubble" in e.originalEvent) {
          (e.originalEvent as MouseEvent).cancelBubble = true;
        }
        const f = e.features?.[0];
        const rid = f?.properties?.river_id as string | undefined;
        if (!rid) return;
        const river = riversRef.current.find((r) => r.river_id === rid);
        if (river) onSelectRiverRef.current(river);
      });

      const handleRiverLineClick = (e: mapboxgl.MapLayerMouseEvent) => {
        if (!layerStateRef.current.mri_river_lines) return;
        const stationFeatures = map.queryRenderedFeatures(e.point, {
          layers: [...CLICK_PRIORITY_LAYERS],
        });
        if (stationFeatures.length > 0) return;
        const f = e.features?.[0];
        const rid = extractRiverId((f?.properties as Record<string, unknown> | undefined) ?? null)
          ?? selectedRiverIdRef.current
          ?? undefined;
        if (!rid) return;
        const river = riversRef.current.find((r) => r.river_id === rid || r.slug === rid);
        if (!river) return;
        // Force refit even if the same river is clicked again.
        lastFlownRef.current = null;
        onSelectRiverRef.current(river);
      };

      map.on("click", RIVER_HIT_LAYER, handleRiverLineClick);

      map.on("mouseenter", RIVER_HIT_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", RIVER_HIT_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mousemove", UNCLUSTERED_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        const id = f?.id;
        if (id == null) return;
        if (hoverIdRef.current != null && hoverIdRef.current !== id) {
          try {
            map.setFeatureState({ source: RIVERS_SOURCE, id: hoverIdRef.current as number }, { hover: false });
          } catch {
            /* ignore */
          }
        }
        hoverIdRef.current = id;
        try {
          map.setFeatureState({ source: RIVERS_SOURCE, id: id as number }, { hover: true });
        } catch {
          /* ignore */
        }
      });

      map.on("mouseleave", UNCLUSTERED_LAYER, () => {
        map.getCanvas().style.cursor = "";
        if (hoverIdRef.current != null) {
          try {
            map.setFeatureState({ source: RIVERS_SOURCE, id: hoverIdRef.current as number }, { hover: false });
          } catch {
            /* ignore */
          }
        }
        hoverIdRef.current = null;
      });

      map.on("mouseenter", ACCESS_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ACCESS_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", ACCESS_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || !feature.geometry || feature.geometry.type !== "Point") return;
        const coords = [...feature.geometry.coordinates] as [number, number];
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const name =
          String(props.NAME ?? props.Name ?? props.name ?? "Fishing Access Site");
        const [lng, lat] = coords;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isMobile = isIOS || /Android/.test(navigator.userAgent);
        const appleUrl = `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
        const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        const navHtml = isMobile
          ? `<a href="${isIOS ? appleUrl : googleUrl}" target="_blank" rel="noopener noreferrer"
               style="display:block;background:#2d5a1b;color:white;text-decoration:none;
                      text-align:center;padding:10px 16px;min-height:44px;border-radius:6px;
                      font-size:14px;font-weight:600;line-height:24px;">
               Get Directions →
             </a>`
          : `<div style="display:flex;gap:8px;margin-top:6px;">
               <a href="${appleUrl}" target="_blank" rel="noopener noreferrer"
                  style="flex:1;text-align:center;padding:6px 8px;border:1px solid #d1d5db;
                         border-radius:4px;font-size:12px;color:#374151;text-decoration:none;">
                 Apple Maps ↗
               </a>
               <a href="${googleUrl}" target="_blank" rel="noopener noreferrer"
                  style="flex:1;text-align:center;padding:6px 8px;border:1px solid #d1d5db;
                         border-radius:4px;font-size:12px;color:#374151;text-decoration:none;">
                 Google Maps ↗
               </a>
             </div>`;
        new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 10, maxWidth: "240px" })
          .setLngLat(coords)
          .setHTML(`
            <div style="padding:4px 2px;">
              <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:8px;">${name}</div>
              ${navHtml}
            </div>`)
          .addTo(map);
      });

      map.on("mouseenter", ACTIVE_STATIONS_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ACTIVE_STATIONS_LAYER, () => {
        map.getCanvas().style.cursor = "";
        stationHoverPopup.remove();
      });
      map.on("mousemove", ACTIVE_STATIONS_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || !feature.geometry || feature.geometry.type !== "Point") return;
        const coords = [...feature.geometry.coordinates] as [number, number];
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        stationHoverPopup
          .setLngLat(coords)
          .setHTML(getStationTooltipHtml(props))
          .addTo(map);
      });
      map.on("click", ACTIVE_STATIONS_LAYER, (e: mapboxgl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || !feature.geometry || feature.geometry.type !== "Point") return;
        const coords = [...feature.geometry.coordinates] as [number, number];
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const stationName = String(props.station_name ?? props.site_no ?? "USGS Station");
        const siteNo = String(props.site_no ?? "").trim();
        const rolesText = String(props.roles_csv ?? "").trim();
        const relatedRiverNames = String(props.related_river_names_csv ?? "").trim();
        const sourceRoles = String(props.selected_source_roles ?? "").trim();
        const selectedName = String(props.selected_river_name ?? "").trim();
        const sourceText =
          sourceRoles && selectedName
            ? `Used for ${selectedName}: ${sourceRoles}`
            : sourceRoles
              ? `Used as: ${sourceRoles}`
              : "";

        stationHoverPopup.remove();

        new mapboxgl.Popup({ closeButton: false, closeOnClick: true, offset: 10 })
          .setLngLat(coords)
          .setHTML(
            `<div style="min-width:184px;font-size:12px;color:#0f172a;line-height:1.4;">
              <div style="font-weight:700;">${escapeHtml(stationName)}</div>
              <div style="font-size:11px;color:#334155;">${escapeHtml(siteNo || "USGS station")}</div>
              <div style="margin-top:4px;font-size:11px;color:#334155;">${escapeHtml(rolesText || "role metadata pending")}</div>
              ${relatedRiverNames ? `<div style="margin-top:2px;font-size:11px;color:#475569;">${escapeHtml(relatedRiverNames)}</div>` : ""}
              ${sourceText ? `<div style="margin-top:5px;font-size:11px;color:#1e293b;font-weight:600;">${escapeHtml(sourceText)}</div>` : ""}
            </div>`
          )
          .addTo(map);
      });

      // ── Long-press to add waypoint ─────────────────────────────────────────
      const cancelLongPress = () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
      };

      const startLongPress = (clientX: number, clientY: number, lngLat: mapboxgl.LngLat) => {
        longPressDraggedRef.current = false;
        longPressStartRef.current = { x: clientX, y: clientY };
        longPressTimerRef.current = setTimeout(() => {
          if (longPressDraggedRef.current) return;
          if (!layerStateRef.current.my_waypoints) return;
          openAddWaypointPopup(map, lngLat, (wp) => {
            onWaypointSaveRef.current?.(wp);
          });
        }, 500);
      };

      map.on("mousedown", (e) => {
        startLongPress(e.originalEvent.clientX, e.originalEvent.clientY, e.lngLat);
      });
      map.on("mouseup", cancelLongPress);
      map.on("drag", cancelLongPress);
      map.on("mousemove", (e) => {
        if (!longPressStartRef.current) return;
        const dx = e.originalEvent.clientX - longPressStartRef.current.x;
        const dy = e.originalEvent.clientY - longPressStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          longPressDraggedRef.current = true;
          cancelLongPress();
        }
      });

      map.getCanvas().addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { cancelLongPress(); return; }
        const t = e.touches[0];
        const rect = map.getContainer().getBoundingClientRect();
        const lngLat = map.unproject([t.clientX - rect.left, t.clientY - rect.top]);
        startLongPress(t.clientX, t.clientY, lngLat as unknown as mapboxgl.LngLat);
      }, { passive: true });

      map.getCanvas().addEventListener("touchend", cancelLongPress, { passive: true });
      map.getCanvas().addEventListener("touchcancel", cancelLongPress, { passive: true });

      map.getCanvas().addEventListener("touchmove", (e) => {
        if (!longPressStartRef.current || e.touches.length !== 1) { cancelLongPress(); return; }
        const t = e.touches[0];
        const dx = t.clientX - longPressStartRef.current.x;
        const dy = t.clientY - longPressStartRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          longPressDraggedRef.current = true;
          cancelLongPress();
        }
      }, { passive: true });
    }

    return () => {
      stationHoverPopup.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
      lastFlownRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapContainerRef.current) return;

    const safeResize = () => {
      if (mapRef.current !== map) return;
      if ((map as any)?._removed) return;
      const container = map.getContainer?.();
      if (!container || !container.isConnected) return;
      try {
        map.resize();
      } catch {
        // Ignore resize calls during map teardown.
      }
    };

    const handleResize = () => safeResize();
    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => safeResize());
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

    ensureRiversSource(map, rivers);
    ensureRiverPointLayers(map);
    syncRiverPointPresentation(map, selectedRiverId, true, effectiveLayerState.mri_score_coloring);

    if (!selectedRiverId) {
      const fc = riversToFeatureCollection(rivers);
      if (fc.features.length) {
        map.fitBounds(MONTANA_BOUNDS, {
          padding: { top: 112, right: rightPanelOpen ? 420 : 72, bottom: 118, left: 86 },
          duration: 0,
          pitch: 14,
          bearing: 0,
          maxZoom: 6.35,
        });
      }
    }
  }, [
    riversKey,
    mapReady,
    rivers,
    selectedRiverId,
    effectiveLayerState.mri_score_coloring,
    rightPanelOpen,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
    syncRiverPointPresentation(
      map,
      selectedRiverId,
      true,
      effectiveLayerState.mri_score_coloring
    );
    syncSelectedRiverLine(
      map,
      riverLinesGeojson ?? selectedRiverGeojson,
      selectedRiverId,
      selectedRiverName,
      effectiveLayerState.mri_river_lines,
      effectiveLayerState.mri_selected_highlight,
      effectiveLayerState.mri_labels
    );

    if (!selectedRiverId) {
      lastFlownRef.current = null;
      lastFitSignatureRef.current = null;
      return;
    }

    const fitSignature = `${selectedRiverId}|${selectionSeq}|${rightPanelOpen ? 1 : 0}|${drawerState}`;
    if (lastFitSignatureRef.current === fitSignature) return;
    lastFitSignatureRef.current = fitSignature;
    lastFlownRef.current = selectedRiverId;

    const paddingBottom =
      drawerState === "expanded" ? 360 : drawerState === "mid" ? 220 : 120;
    const padding: mapboxgl.PaddingOptions = {
      top: 80,
      left: 40,
      right: rightPanelOpen ? 420 : 40,
      bottom: paddingBottom,
    };

    const focus: [number, number] | undefined =
      selectedRiver?.lat != null && selectedRiver?.lng != null
        ? [selectedRiver.lng, selectedRiver.lat]
        : RIVER_FOCUS_POINTS[selectedRiverId];

    const fullRiverBbox =
      selectedRiverBoundsFromGeojson(riverLinesGeojson, selectedRiverId) ??
      selectedRiverBoundsFromGeojson(selectedRiverGeojson, selectedRiverId) ??
      (selectedRiverGeojson ? geojsonBbox(selectedRiverGeojson) : null);

    if (fullRiverBbox && map.fitBounds) {
      map.fitBounds(
        [
          [fullRiverBbox[0], fullRiverBbox[1]],
          [fullRiverBbox[2], fullRiverBbox[3]],
        ],
        { padding, duration: 450, maxZoom: 11, essential: true }
      );
      return;
    }

    if (focus) {
      map.flyTo({
        center: focus,
        zoom: FLY_ZOOM,
        duration: 450,
        curve: FLY_CURVE,
        essential: true,
      });
    }
  }, [
    selectedRiverId,
    selectedRiverGeojson,
    riverLinesGeojson,
    selectedRiver,
    effectiveLayerState.mri_river_lines,
    effectiveLayerState.mri_selected_highlight,
    effectiveLayerState.mri_labels,
    effectiveLayerState.mri_score_coloring,
    rightPanelOpen,
    drawerState,
    selectionSeq,
    mapReady,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const nextStyle = MAPBOX_STYLES[basemap] ?? MAPBOX_STYLES.hybrid;
    if (currentStyleRef.current === nextStyle) return;
    currentStyleRef.current = nextStyle;
    // Reset mapReady so that when style.load fires and setMapReady(true) is
    // called it is an actual state transition — triggering all layer-sync
    // effects to re-run with isStyleLoaded() === true.
    setMapReady(false);
    map.setStyle(nextStyle);
  }, [basemap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;

    syncStatewideHydrologyLayer(map, effectiveLayerState.statewide_hydrology);
    syncPadusLayer(map, effectiveLayerState.padus_public_lands);
    syncStateLandsLayer(map, effectiveLayerState.public_state);
    syncActiveStationsLayer(map, effectiveLayerState.mri_active_stations, activeStationsGeojson, selectedRiver, highlightedStationSiteNo);
    syncHydrologyOverlays(
      map,
      effectiveLayerState.hydro_flow_magnitude,
      effectiveLayerState.hydro_change_indicator,
      effectiveLayerState.hydro_temp_stress
    );
    syncLabels(map, effectiveLayerState.mri_labels);
  }, [
    mapReady,
    effectiveLayerState.statewide_hydrology,
    effectiveLayerState.padus_public_lands,
    effectiveLayerState.public_state,
    effectiveLayerState.mri_active_stations,
    effectiveLayerState.hydro_flow_magnitude,
    effectiveLayerState.hydro_change_indicator,
    effectiveLayerState.hydro_temp_stress,
    effectiveLayerState.mri_labels,
    activeStationsGeojson,
    selectedRiver,
    highlightedStationSiteNo,
  ]);

  // Dedicated fishing access effect — completely isolated so river switches are
  // guaranteed to rebuild the layer with the correct UUID.
  useEffect(() => {
    const map = mapRef.current;

    // ── DIAGNOSIS BLOCK ──────────────────────────────────────────────────────
    console.log('[ACCESS] effect fired');
    console.log('[ACCESS]   selectedRiverId:', selectedRiverId);
    console.log('[ACCESS]   map exists:', !!map);
    console.log('[ACCESS]   mapReady:', mapReady);
    console.log('[ACCESS]   isStyleLoaded:', map?.isStyleLoaded());
    console.log('[ACCESS]   access_fishing_sites enabled:', effectiveLayerState.access_fishing_sites);
    console.log('[ACCESS]   GeoJSON cache:', accessGeojsonRef.current
      ? accessGeojsonRef.current.features.length + ' features'
      : 'NULL — fetch not complete or failed');
    // ────────────────────────────────────────────────────────────────────────

    if (!map || !mapReady) {
      console.log('[ACCESS] BAIL: map=' + !!map + ' mapReady=' + mapReady);
      return;
    }

    const enabled = effectiveLayerState.access_fishing_sites;
    const uuid = selectedRiverId;
    const cached = accessGeojsonRef.current;

    if (map.getLayer(ACCESS_LAYER)) map.removeLayer(ACCESS_LAYER);
    if (map.getSource(ACCESS_SOURCE)) map.removeSource(ACCESS_SOURCE);

    if (!enabled) { console.log('[ACCESS] BAIL: layer toggle disabled'); return; }
    if (!uuid)    { console.log('[ACCESS] BAIL: no river selected (selectedRiverId is null)'); return; }
    if (!cached)  { console.log('[ACCESS] BAIL: GeoJSON not loaded yet'); return; }

    // Diagnose feature matching — mismatched types are the silent killer here
    const sampleIds = cached.features.slice(0, 5).map((f) => ({
      river_id: f.properties?.river_id,
      type: typeof f.properties?.river_id,
    }));
    console.log('[ACCESS] river_id being matched:', uuid, '(type:', typeof uuid + ')');
    console.log('[ACCESS] sample feature river_ids:', JSON.stringify(sampleIds));

    const features = cached.features.filter(
      (f) => String(f.properties?.river_id) === String(uuid)
    );

    console.log('[ACCESS] features matching river:', features.length, '(of', cached.features.length, 'total)');
    if (!features.length) {
      console.log('[ACCESS] BAIL: 0 features for this river — check river_id match above');
      return;
    }

    // Purely adds the source and layer — no guard inside so there's no re-entry.
    // Guards live outside so stale listeners can be cleaned up correctly.
    const addAccessLayer = () => {
      console.log('[ACCESS] addAccessLayer called, isStyleLoaded=', map.isStyleLoaded());
      // Clear any remnants (should already be gone from the top-of-effect cleanup,
      // but guard against the styledata-callback path arriving after a re-render).
      if (map.getLayer(ACCESS_LAYER)) map.removeLayer(ACCESS_LAYER);
      if (map.getSource(ACCESS_SOURCE)) map.removeSource(ACCESS_SOURCE);
      try {
        map.addSource(ACCESS_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features },
        });
        map.addLayer({
          id: ACCESS_LAYER,
          type: "circle",
          source: ACCESS_SOURCE,
          paint: {
            "circle-color": "#2d5a1b",
            // All features in this source are for the selected river, so use the
            // "selected" radius of 8 to give a subtle pulse vs the base 6 used when
            // the access layer is shown without a selection context.
            "circle-radius": 8,
            "circle-stroke-color": "white",
            "circle-stroke-width": 2,
            "circle-opacity": 0.95,
          },
        });
        console.log('[ACCESS] layer added successfully ✓');
      } catch (err) {
        console.error('[ACCESS] ERROR adding source/layer:', err);
      }
    };

    // isStyleLoaded() checks tile loading, not just style JSON. It can return
    // false even after the `load` event if viewport tiles are still downloading.
    // The guard: if the style is ready go immediately; otherwise wait once.
    // map.once("styledata") is de-registered in the cleanup so a stale callback
    // never fires after React has torn down this effect.
    console.log('[ACCESS] isStyleLoaded at dispatch time:', map.isStyleLoaded());
    if (map.isStyleLoaded()) {
      addAccessLayer();
    } else {
      console.log('[ACCESS] style not loaded — waiting for styledata event');
      map.once("styledata", addAccessLayer);
    }

    return () => {
      const m = mapRef.current;
      if (!m) return;
      // De-register the styledata listener before removing source/layer so the
      // callback can't fire on a map that's already been cleaned up.
      m.off("styledata", addAccessLayer);
      if (m.getLayer(ACCESS_LAYER)) m.removeLayer(ACCESS_LAYER);
      if (m.getSource(ACCESS_SOURCE)) m.removeSource(ACCESS_SOURCE);
    };
  }, [mapReady, accessGeojsonVersion, selectedRiverId, effectiveLayerState.access_fishing_sites]);

  // Re-apply custom sources/layers after every Mapbox style change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleStyleLoad = () => {
      // Re-add terrain DEM source — setStyle wipes all sources.
      try {
        if (!map.getSource(MAPBOX_DEM_SOURCE)) {
          map.addSource(MAPBOX_DEM_SOURCE, {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          } as any);
        }
        map.setTerrain({ source: MAPBOX_DEM_SOURCE, exaggeration: 1.1 });
      } catch {
        /* terrain is optional */
      }
      syncRuntimeLayers(map);
      // setMapReady(true) is called last so that React re-renders with a real
      // state transition after all custom layers have been re-added on top of
      // the new base style — the layer-sync effects will then re-run with
      // isStyleLoaded() === true.
      setMapReady(true);
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    };

    map.on("style.load", handleStyleLoad);
    return () => {
      map.off("style.load", handleStyleLoad);
    };
  }, [syncRuntimeLayers]);

  // ── Sync waypoints → Mapbox markers ─────────────────────────────────────────
  const waypointsKey = waypoints.map((w) => w.id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const existing = waypointMarkersRef.current;
    const incomingIds = new Set(waypoints.map((w) => w.id));

    // Remove markers no longer in waypoints
    Array.from(existing.entries()).forEach(([id, marker]) => {
      if (!incomingIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });

    // Add new markers
    for (const wp of waypoints) {
      if (existing.has(wp.id)) continue;
      const el = createWaypointEl(wp);
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openWaypointInfoPopup(map, wp, marker.getLngLat(), (id) => {
          onWaypointRemoveRef.current?.(id);
        });
      });
      existing.set(wp.id, marker);
    }

    // Show/hide based on layer toggle
    const visible = effectiveLayerState.my_waypoints;
    Array.from(existing.values()).forEach((marker) => {
      marker.getElement().style.display = visible ? "" : "none";
    });
  }, [waypointsKey, mapReady, effectiveLayerState.my_waypoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync waypoint visibility when toggle changes (without re-creating markers)
  useEffect(() => {
    const visible = effectiveLayerState.my_waypoints;
    Array.from(waypointMarkersRef.current.values()).forEach((marker) => {
      marker.getElement().style.display = visible ? "" : "none";
    });
  }, [effectiveLayerState.my_waypoints]);

  return (
    <div
      id="map"
      ref={mapContainerRef}
      className={`absolute inset-0 h-full w-full min-h-0 [&_.mapboxgl-marker]:cursor-pointer ${className ?? ""}`.trim()}
      style={{ position: "absolute", inset: 0, height: "100%", width: "100%", minHeight: 320 }}
      aria-label="Montana river map"
    >
      {mapInitError && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-slate-100/85">
          <div className="pointer-events-auto rounded-xl bg-white px-6 py-5 text-center shadow-md">
            <div className="text-xl font-bold text-slate-900">Map unavailable</div>
            <div className="mt-1 text-sm text-slate-600">{mapInitError}</div>
          </div>
        </div>
      )}
      {mapReady && mapRef.current && <MapControls map={mapRef.current} />}
      {/* Legend stack — bottom-left, grows upward */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 10,
          zIndex: 10,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* Fishing access legend — only when a river is selected */}
        {selectedRiver && effectiveLayerState.access_fishing_sites && (
          <div
            style={{
              background: "white",
              border: "0.5px solid rgba(0,0,0,0.18)",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 10,
              lineHeight: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="4.5" fill="#2d5a1b" stroke="white" strokeWidth="1.5" />
              </svg>
              <span style={{ color: "#333" }}>Fishing access</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect x="3" y="3" width="6" height="6" rx="0.5" fill="#1a3a5c" stroke="#7eb8d4" strokeWidth="1.5" transform="rotate(45 6 6)" />
              </svg>
              <span style={{ color: "#333" }}>USGS gauge</span>
            </div>
          </div>
        )}

        {/* PAD-US legend — shown whenever the layer is active */}
        {effectiveLayerState.padus_public_lands && (
          <div
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "0.5px solid rgba(0,0,0,0.18)",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 10,
              lineHeight: "16px",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ fontWeight: 600, color: "#333", marginBottom: 1, fontSize: 10 }}>Public Lands (SMA)</div>
            {([
              { color: "#2d6a2d", label: "National Forest" },
              { color: "#c8a84b", label: "BLM" },
              { color: "#1a4d1a", label: "National Park" },
              { color: "#4a90a4", label: "Fish & Wildlife" },
            ] as const).map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ color: "#333" }}>{label}</span>
              </div>
            ))}
            <div style={{ marginTop: 2, fontSize: 9, color: "#888" }}>BLM Surface Management Agency</div>
          </div>
        )}
      </div>
    </div>
  );
}
