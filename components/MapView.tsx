"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FishabilityRow, BiteTier } from "@/lib/types";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import { createDefaultLayerState, type LayerId } from "@/src/map/layers/registry";
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
  selectedRiverName?: string | null;
  selectedRiverId: string | null;
  selectedRiverGeojson: GeoJSON.GeoJSON | null;
  riverLinesGeojson?: GeoJSON.FeatureCollection | null;
  layerState?: Record<LayerId, boolean>;
  onSelectRiver: (river: FishabilityRow) => void;
  className?: string;
  initialStyleUrl?: string;
  onMapReady?: (map: maplibregl.Map) => void;
}

const RIVERS_SOURCE = "rivers-source";
const UNCLUSTERED_LAYER = "rivers-unclustered";
const SELECTED_HALO_LAYER = "rivers-selected-halo";
const SELECTED_CORE_LAYER = "rivers-selected-core";

const SELECTED_RIVER_SOURCE = "selected-river-source";
const SELECTED_RIVER_HIT_LAYER = "rivers-hit";
const SELECTED_RIVER_HALO_LAYER = "rivers-halo";
const SELECTED_RIVER_CASING_LAYER = "rivers-casing";
const SELECTED_RIVER_MAIN_LAYER = "rivers-main";
const SELECTED_RIVER_LABEL_LAYER = "selected-river-label";

const STATEWIDE_HYDRO_SOURCE = "statewide-hydrology-source";
const STATEWIDE_HYDRO_LAYER = "statewide-hydrology-line";

const FEDERAL_LANDS_SOURCE = "public-lands-federal-source";
const FEDERAL_LANDS_LAYER = "public-lands-federal-layer";

const ACCESS_SOURCE = "access-fishing-sites-source";
const ACCESS_LAYER = "access-fishing-sites-layer";
const HYDRO_FLOW_LAYER = "hydro-flow-magnitude-layer";
const HYDRO_CHANGE_LAYER = "hydro-change-indicator-layer";
const HYDRO_TEMP_LAYER = "hydro-temp-stress-layer";

const BLM_TILES =
  "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}";
const FWP_ACCESS_GEOJSON =
  "https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/1/query?where=1%3D1&outFields=NAME&returnGeometry=true&f=geojson";
const RIVER_ID_PROP = "river_id";

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

function toneRasterBasemap(map: maplibregl.Map) {
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
      id !== FEDERAL_LANDS_LAYER;
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

function ensureRiversSource(map: maplibregl.Map, rivers: FishabilityRow[]) {
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

function ensureRiverPointLayers(map: maplibregl.Map) {
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
      paint: { "circle-color": "rgba(56, 189, 248, 0.30)", "circle-radius": 15 },
    });
  }

  if (!map.getLayer(SELECTED_CORE_LAYER)) {
    map.addLayer({
      id: SELECTED_CORE_LAYER,
      type: "circle",
      source: RIVERS_SOURCE,
      filter: ["==", ["get", "river_id"], "__none__"],
      paint: {
        "circle-color": "rgba(255,255,255,0.98)",
        "circle-radius": 6,
        "circle-stroke-color": "rgba(56, 189, 248, 0.98)",
        "circle-stroke-width": 2,
      },
    });
  }
}

function syncRiverPointPresentation(
  map: maplibregl.Map,
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
        "#94a3b8",
      ]
    : "#94a3b8";
  map.setPaintProperty(UNCLUSTERED_LAYER, "circle-color", circleColor as any);

  const circleOpacity = selectedRiverId
    ? ["case", ["==", ["get", "river_id"], selectedRiverId], 0.95, 0.38]
    : 0.95;
  map.setPaintProperty(UNCLUSTERED_LAYER, "circle-opacity", circleOpacity as any);
}

function clearSelectedRiverLine(map: maplibregl.Map) {
  if (map.getLayer(SELECTED_RIVER_LABEL_LAYER)) map.removeLayer(SELECTED_RIVER_LABEL_LAYER);
  if (map.getLayer(SELECTED_RIVER_HIT_LAYER)) map.removeLayer(SELECTED_RIVER_HIT_LAYER);
  if (map.getLayer(SELECTED_RIVER_MAIN_LAYER)) map.removeLayer(SELECTED_RIVER_MAIN_LAYER);
  if (map.getLayer(SELECTED_RIVER_CASING_LAYER)) map.removeLayer(SELECTED_RIVER_CASING_LAYER);
  if (map.getLayer(SELECTED_RIVER_HALO_LAYER)) map.removeLayer(SELECTED_RIVER_HALO_LAYER);
  if (map.getSource(SELECTED_RIVER_SOURCE)) map.removeSource(SELECTED_RIVER_SOURCE);
}

function syncSelectedRiverLine(
  map: maplibregl.Map,
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
  const noSelectionExpr = ["==", ["literal", rid], ""] as any;
  const selectedMatchExpr = ["==", riverIdExpr(), rid] as any;

  const src = map.getSource(SELECTED_RIVER_SOURCE) as
    | { setData?: (d: GeoJSON.GeoJSON) => void }
    | undefined;

  if (!src) {
    map.addSource(SELECTED_RIVER_SOURCE, { type: "geojson", data: namedData });
  } else {
    src.setData?.(namedData);
  }

  if (highlightEnabled && !map.getLayer(SELECTED_RIVER_HALO_LAYER)) {
    map.addLayer({
      id: SELECTED_RIVER_HALO_LAYER,
      type: "line",
      source: SELECTED_RIVER_SOURCE,
      filter: selectedFilter,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "rgba(255,255,255,0.25)",
        "line-width": 7,
        "line-blur": 0.5,
        "line-opacity": 1,
      },
    });
  } else if (!highlightEnabled && map.getLayer(SELECTED_RIVER_HALO_LAYER)) {
    map.removeLayer(SELECTED_RIVER_HALO_LAYER);
  }

  if (highlightEnabled && !map.getLayer(SELECTED_RIVER_CASING_LAYER)) {
    map.addLayer({
      id: SELECTED_RIVER_CASING_LAYER,
      type: "line",
      source: SELECTED_RIVER_SOURCE,
      filter: selectedFilter,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "rgba(0,0,0,0.35)",
        "line-width": 5,
        "line-opacity": 1,
      },
    });
  } else if (!highlightEnabled && map.getLayer(SELECTED_RIVER_CASING_LAYER)) {
    map.removeLayer(SELECTED_RIVER_CASING_LAYER);
  }

  if (showRiverLines && !map.getLayer(SELECTED_RIVER_MAIN_LAYER)) {
    map.addLayer({
      id: SELECTED_RIVER_MAIN_LAYER,
      type: "line",
      source: SELECTED_RIVER_SOURCE,
      minzoom: 4,
      maxzoom: 24,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": [
          "case",
          selectedMatchExpr,
          "#2c6e8f",
          "#4a6a78",
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          ["case", selectedMatchExpr, 3.1, 2.6],
          7,
          ["case", selectedMatchExpr, 3.9, 3.2],
          9,
          ["case", selectedMatchExpr, 5.0, 4.2],
          11,
          ["case", selectedMatchExpr, 6.3, 5.4],
        ],
        "line-opacity": [
          "case",
          noSelectionExpr,
          0.75,
          selectedMatchExpr,
          0.95,
          0.35,
        ],
      },
    });
  } else if (!showRiverLines && map.getLayer(SELECTED_RIVER_MAIN_LAYER)) {
    map.removeLayer(SELECTED_RIVER_MAIN_LAYER);
  }

  if (showRiverLines && !map.getLayer(SELECTED_RIVER_HIT_LAYER)) {
    map.addLayer({
      id: SELECTED_RIVER_HIT_LAYER,
      type: "line",
      source: SELECTED_RIVER_SOURCE,
      minzoom: 4,
      maxzoom: 24,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "rgba(0,0,0,0)",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 16,
          7, 18,
          9, 22,
          11, 26,
        ],
        "line-opacity": 0,
      },
    });
  } else if (!showRiverLines && map.getLayer(SELECTED_RIVER_HIT_LAYER)) {
    map.removeLayer(SELECTED_RIVER_HIT_LAYER);
  }

  if (map.getLayer(SELECTED_RIVER_HALO_LAYER)) {
    map.setFilter(SELECTED_RIVER_HALO_LAYER, selectedFilter);
  }
  if (map.getLayer(SELECTED_RIVER_CASING_LAYER)) {
    map.setFilter(SELECTED_RIVER_CASING_LAYER, selectedFilter);
  }
  if (map.getLayer(SELECTED_RIVER_MAIN_LAYER)) {
    map.setPaintProperty(SELECTED_RIVER_MAIN_LAYER, "line-color", [
      "case",
      selectedMatchExpr,
      "#2c6e8f",
      "#4a6a78",
    ] as any);
    map.setPaintProperty(SELECTED_RIVER_MAIN_LAYER, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      ["case", selectedMatchExpr, 3.1, 2.6],
      7,
      ["case", selectedMatchExpr, 3.9, 3.2],
      9,
      ["case", selectedMatchExpr, 5.0, 4.2],
      11,
      ["case", selectedMatchExpr, 6.3, 5.4],
    ] as any);
    map.setPaintProperty(SELECTED_RIVER_MAIN_LAYER, "line-opacity", [
      "case",
      noSelectionExpr,
      0.75,
      selectedMatchExpr,
      0.95,
      0.35,
    ] as any);
  }

  if (showLabels && !map.getLayer(SELECTED_RIVER_LABEL_LAYER)) {
    map.addLayer({
      id: SELECTED_RIVER_LABEL_LAYER,
      type: "symbol",
      source: SELECTED_RIVER_SOURCE,
      minzoom: 8,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name"], ["get", "river_name"], ""],
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 11, 12, 13, 13],
      },
      paint: {
        "text-color": "rgba(236, 242, 247, 0.85)",
        "text-halo-color": "rgba(30, 46, 51, 0.85)",
        "text-halo-width": 1,
      },
    });
  } else if (!showLabels && map.getLayer(SELECTED_RIVER_LABEL_LAYER)) {
    map.removeLayer(SELECTED_RIVER_LABEL_LAYER);
  }

  try {
    if (map.getLayer(STATEWIDE_HYDRO_LAYER) && map.getLayer(SELECTED_RIVER_HALO_LAYER)) {
      map.moveLayer(SELECTED_RIVER_HALO_LAYER);
    }
    if (map.getLayer(SELECTED_RIVER_HALO_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(SELECTED_RIVER_HALO_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(SELECTED_RIVER_CASING_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(SELECTED_RIVER_CASING_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(SELECTED_RIVER_MAIN_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(SELECTED_RIVER_MAIN_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(SELECTED_RIVER_HIT_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(SELECTED_RIVER_HIT_LAYER, UNCLUSTERED_LAYER);
    }
    if (map.getLayer(SELECTED_RIVER_LABEL_LAYER) && map.getLayer(UNCLUSTERED_LAYER)) {
      map.moveLayer(SELECTED_RIVER_LABEL_LAYER, UNCLUSTERED_LAYER);
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

function syncStatewideHydrologyLayer(map: maplibregl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource(STATEWIDE_HYDRO_SOURCE)) {
      map.addSource(STATEWIDE_HYDRO_SOURCE, {
        type: "geojson",
        data: "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/2/query?where=1%3D1&geometry=-116.2,44.2,-104,49.2&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=GNIS_NAME&returnGeometry=true&geometryPrecision=4&maxAllowableOffset=0.005&f=geojson" as any,
      } as any);
    }
    if (!map.getLayer(STATEWIDE_HYDRO_LAYER)) {
      map.addLayer({
        id: STATEWIDE_HYDRO_LAYER,
        type: "line",
        source: STATEWIDE_HYDRO_SOURCE,
        paint: {
          "line-color": "#2C3E44",
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 8, 0.55, 11, 0.9],
          "line-opacity": 0.7,
        },
      });
    }
    try {
      if (map.getLayer(SELECTED_RIVER_HALO_LAYER)) {
        map.moveLayer(STATEWIDE_HYDRO_LAYER, SELECTED_RIVER_HALO_LAYER);
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

function syncFederalLandsLayer(map: maplibregl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource(FEDERAL_LANDS_SOURCE)) {
      map.addSource(FEDERAL_LANDS_SOURCE, {
        type: "raster",
        tiles: [BLM_TILES],
        tileSize: 256,
        attribution: "BLM Surface Management Agency",
      });
    }
    if (!map.getLayer(FEDERAL_LANDS_LAYER)) {
      map.addLayer({
        id: FEDERAL_LANDS_LAYER,
        type: "raster",
        source: FEDERAL_LANDS_SOURCE,
        minzoom: 7,
        paint: {
          "raster-opacity": 0.24,
          "raster-saturation": -0.55,
          "raster-contrast": -0.2,
          "raster-brightness-min": 0.15,
          "raster-brightness-max": 0.82,
        },
      });
    }
    return;
  }

  if (map.getLayer(FEDERAL_LANDS_LAYER)) {
    map.removeLayer(FEDERAL_LANDS_LAYER);
  }
}

function syncFishingAccessLayer(map: maplibregl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource(ACCESS_SOURCE)) {
      map.addSource(ACCESS_SOURCE, {
        type: "geojson",
        data: FWP_ACCESS_GEOJSON as any,
      } as any);
    }
    if (!map.getLayer(ACCESS_LAYER)) {
      map.addLayer({
        id: ACCESS_LAYER,
        type: "circle",
        source: ACCESS_SOURCE,
        paint: {
          "circle-color": "#38bdf8",
          "circle-radius": 4,
          "circle-stroke-color": "#e2e8f0",
          "circle-stroke-width": 1.25,
          "circle-opacity": 0.95,
        },
      });
    }
    return;
  }

  if (map.getLayer(ACCESS_LAYER)) {
    map.removeLayer(ACCESS_LAYER);
  }
}

function syncHydrologyOverlays(
  map: maplibregl.Map,
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
            0.4, "#60a5fa",
            0.8, "#34d399",
            1.0, "#fbbf24",
            1.5, "#f97316",
            2.0, "#ef4444",
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
            [">", ["coalesce", ["get", "change_48h_pct_calc"], 0], 12], "#22c55e",
            ["<", ["coalesce", ["get", "change_48h_pct_calc"], 0], -12], "#ef4444",
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
          "circle-color": "#ef4444",
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

function syncLabels(map: maplibregl.Map, visible: boolean) {
  const style = map.getStyle();
  const visibility = visible ? "visible" : "none";
  for (const layer of style.layers ?? []) {
    if (!layer.id) continue;
    const id = layer.id.toLowerCase();
    if (id.includes("label") || id.includes("place") || id.includes("poi")) {
      try {
        map.setLayoutProperty(layer.id, "visibility", visibility);
      } catch {
        /* ignore */
      }
    }
  }
}

export function MapView({
  rivers,
  selectedRiver,
  selectedRiverName,
  selectedRiverId,
  selectedRiverGeojson,
  riverLinesGeojson,
  layerState,
  onSelectRiver,
  className,
  initialStyleUrl,
  onMapReady,
}: MapViewProps) {
  const effectiveLayerState = layerState ?? createDefaultLayerState();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const riversRef = useRef(rivers);
  const onSelectRiverRef = useRef(onSelectRiver);
  const selectedRiverNameRef = useRef(selectedRiverName);
  const selectedRiverIdRef = useRef(selectedRiverId);
  const selectedRiverGeojsonRef = useRef(selectedRiverGeojson);
  const riverLinesGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(riverLinesGeojson ?? null);
  const layerStateRef = useRef<Record<LayerId, boolean>>(effectiveLayerState);
  const hoverIdRef = useRef<number | string | null>(null);
  const lastFlownRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  riversRef.current = rivers;
  onSelectRiverRef.current = onSelectRiver;
  selectedRiverNameRef.current = selectedRiverName;
  selectedRiverIdRef.current = selectedRiverId;
  selectedRiverGeojsonRef.current = selectedRiverGeojson;
  riverLinesGeojsonRef.current = riverLinesGeojson ?? null;
  layerStateRef.current = effectiveLayerState;

  const syncRuntimeLayers = useCallback((map: maplibregl.Map) => {
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
    syncFederalLandsLayer(map, layerStateRef.current.public_federal);
    syncFishingAccessLayer(map, layerStateRef.current.access_fishing_sites);
    syncHydrologyOverlays(
      map,
      layerStateRef.current.hydro_flow_magnitude,
      layerStateRef.current.hydro_change_indicator,
      layerStateRef.current.hydro_temp_stress
    );
    syncLabels(map, layerStateRef.current.mri_labels);
  }, []);

  const initMap = useCallback(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyleUrl ?? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: MONTANA_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 22,
      bearing: -5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      setMapReady(true);
      onMapReady?.(map);
      syncRuntimeLayers(map);
      const styleLayers = (map.getStyle().layers ?? []).map((layer) => ({
        id: layer.id,
        type: layer.type,
      }));
      console.log("MAP STYLE LAYERS", styleLayers);
      console.log("RIVER/STATION LAYERS", {
        riverHit: SELECTED_RIVER_HIT_LAYER,
        riverMain: SELECTED_RIVER_MAIN_LAYER,
        riverCasing: SELECTED_RIVER_CASING_LAYER,
        riverHalo: SELECTED_RIVER_HALO_LAYER,
        stationLayers: [UNCLUSTERED_LAYER, SELECTED_HALO_LAYER, SELECTED_CORE_LAYER],
      });
      map.resize();
    });

    if (!(map as any).__mriHandlers) {
      (map as any).__mriHandlers = true;
      map.on("click", UNCLUSTERED_LAYER, (e: maplibregl.MapLayerMouseEvent) => {
        if (e.originalEvent && "cancelBubble" in e.originalEvent) {
          (e.originalEvent as MouseEvent).cancelBubble = true;
        }
        const f = e.features?.[0];
        const rid = f?.properties?.river_id as string | undefined;
        if (!rid) return;
        const river = riversRef.current.find((r) => r.river_id === rid);
        if (river) onSelectRiverRef.current(river);
      });

      const handleRiverLineClick = (e: maplibregl.MapLayerMouseEvent) => {
        if (!layerStateRef.current.mri_river_lines) return;
        const stationFeatures = map.queryRenderedFeatures(e.point, {
          layers: [UNCLUSTERED_LAYER, SELECTED_HALO_LAYER, SELECTED_CORE_LAYER],
        });
        if (stationFeatures.length > 0) return;
        const f = e.features?.[0];
        console.log("river click props", f?.properties);
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

      map.on("click", SELECTED_RIVER_HIT_LAYER, handleRiverLineClick);

      map.on("mouseenter", SELECTED_RIVER_HIT_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", SELECTED_RIVER_HIT_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mousemove", UNCLUSTERED_LAYER, (e: maplibregl.MapLayerMouseEvent) => {
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
    }
  }, [initialStyleUrl, onMapReady, syncRuntimeLayers]);

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

    ensureRiversSource(map, rivers);
    ensureRiverPointLayers(map);
    syncRiverPointPresentation(map, selectedRiverId, true, effectiveLayerState.mri_score_coloring);

    if (!selectedRiverId) {
      const fc = riversToFeatureCollection(rivers);
      if (fc.features.length) {
        const bounds = new maplibregl.LngLatBounds(
          fc.features[0].geometry.coordinates as [number, number],
          fc.features[0].geometry.coordinates as [number, number]
        );
        for (const f of fc.features) {
          bounds.extend(f.geometry.coordinates as [number, number]);
        }
        map.fitBounds(bounds, { padding: 60, duration: 450 });
      }
    }
  }, [
    riversKey,
    mapReady,
    rivers,
    selectedRiverId,
    effectiveLayerState.mri_score_coloring,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;
    console.log("SELECTED RIVER STYLE UPDATE", selectedRiverId);

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
      return;
    }

    if (lastFlownRef.current === selectedRiverId) return;
    lastFlownRef.current = selectedRiverId;

    const focus: [number, number] | undefined =
      selectedRiver?.lat != null && selectedRiver?.lng != null
        ? [selectedRiver.lng, selectedRiver.lat]
        : RIVER_FOCUS_POINTS[selectedRiverId];

    if (selectedRiverGeojson) {
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
  }, [
    selectedRiverId,
    selectedRiverGeojson,
    riverLinesGeojson,
    selectedRiver,
    effectiveLayerState.mri_river_lines,
    effectiveLayerState.mri_selected_highlight,
    effectiveLayerState.mri_labels,
    effectiveLayerState.mri_score_coloring,
    mapReady,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) return;

    syncStatewideHydrologyLayer(map, effectiveLayerState.statewide_hydrology);
    syncFederalLandsLayer(map, effectiveLayerState.public_federal);
    syncFishingAccessLayer(map, effectiveLayerState.access_fishing_sites);
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
    effectiveLayerState.public_federal,
    effectiveLayerState.access_fishing_sites,
    effectiveLayerState.hydro_flow_magnitude,
    effectiveLayerState.hydro_change_indicator,
    effectiveLayerState.hydro_temp_stress,
    effectiveLayerState.mri_labels,
  ]);

  // Re-apply overlays after style switches.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handleLoad = () => {
      syncRuntimeLayers(map);
    };

    map.on("load", handleLoad);
    return () => {
      map.off("load", handleLoad);
    };
  }, [mapReady, syncRuntimeLayers]);

  return (
    <div
      id="map"
      ref={mapContainerRef}
      className={`absolute inset-0 h-full w-full min-h-0 [&_.maplibregl-marker]:cursor-pointer ${className ?? ""}`.trim()}
      style={{ position: "absolute", inset: 0, height: "100%", width: "100%", minHeight: 320 }}
      aria-label="Montana river map"
    >
      {mapReady && mapRef.current && <MapControls map={mapRef.current} />}
    </div>
  );
}
