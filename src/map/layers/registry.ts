export type BasemapId = "dark" | "light" | "satellite" | "hybrid" | "topo";

export type LayerGroup = "Public Lands" | "Access" | "MRI Overlays";

export type LayerId =
  | "statewide_hydrology"
  | "public_federal"
  | "public_state"
  | "access_fishing_sites"
  | "mri_river_lines"
  | "mri_selected_highlight"
  | "mri_river_markers"
  | "mri_score_coloring"
  | "mri_labels"
  | "hydro_flow_magnitude"
  | "hydro_change_indicator"
  | "hydro_temp_stress";

export type SourceType = "raster" | "geojson" | "none";

export interface BasemapOption {
  id: BasemapId;
  label: string;
  styleUrl?: string;
  defaultOn?: boolean;
  enabled: boolean;
  comingSoon?: boolean;
}

export interface LayerDefinition {
  id: LayerId;
  label: string;
  group: LayerGroup;
  defaultOn: boolean;
  source: {
    id: string;
    type: SourceType;
    data?: string;
    tiles?: string[];
    tileSize?: number;
    attribution?: string;
  };
  layers: string[];
  minZoomNote?: string;
  comingSoon?: boolean;
  locked?: boolean;
  requiresBasemap?: BasemapId[];
}

const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const hasMaptiler = Boolean(maptilerKey);

function esriRasterStyle(withLabels: boolean): string {
  const satellite = {
    id: "esri_satellite",
    type: "raster",
    tiles: [
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    attribution: "Esri, Maxar, Earthstar Geographics",
  };
  const labels = {
    id: "esri_labels",
    type: "raster",
    tiles: [
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    attribution: "Esri",
  };
  const layers = withLabels
    ? [
        { id: "esri_satellite", type: "raster", source: "esri_satellite" },
        { id: "esri_labels", type: "raster", source: "esri_labels", paint: { "raster-opacity": 0.92 } },
      ]
    : [{ id: "esri_satellite", type: "raster", source: "esri_satellite" }];

  return JSON.stringify({
    version: 8,
    sources: withLabels ? { esri_satellite: satellite, esri_labels: labels } : { esri_satellite: satellite },
    layers,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  });
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: "hybrid",
    label: "Hybrid",
    styleUrl: hasMaptiler
      ? `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKey}`
      : `data:application/json,${encodeURIComponent(esriRasterStyle(true))}`,
    defaultOn: true,
    enabled: true,
  },
  {
    id: "dark",
    label: "Dark",
    styleUrl: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    enabled: true,
  },
  {
    id: "light",
    label: "Light",
    styleUrl: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    enabled: true,
  },
  {
    id: "satellite",
    label: "Satellite",
    styleUrl: hasMaptiler
      ? `https://api.maptiler.com/maps/satellite/style.json?key=${maptilerKey}`
      : `data:application/json,${encodeURIComponent(esriRasterStyle(false))}`,
    enabled: true,
  },
  {
    id: "topo",
    label: "Topo",
    styleUrl: hasMaptiler
      ? `https://api.maptiler.com/maps/topo-v2/style.json?key=${maptilerKey}`
      : "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    enabled: true,
  },
];

export const LAYER_REGISTRY: LayerDefinition[] = [
  {
    id: "statewide_hydrology",
    label: "Statewide hydrology",
    group: "MRI Overlays",
    defaultOn: true,
    source: {
      id: "statewide-hydrology-source",
      type: "geojson",
      data: "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/2/query?where=1%3D1&geometry=-116.2,44.2,-104,49.2&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=GNIS_NAME&returnGeometry=true&geometryPrecision=4&maxAllowableOffset=0.005&f=geojson",
    },
    layers: ["statewide-hydrology-line"],
    locked: true,
  },
  {
    id: "public_federal",
    label: "Federal",
    group: "Public Lands",
    defaultOn: false,
    source: {
      id: "public-lands-federal-source",
      type: "raster",
      tiles: [
        "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_without_PriUnk/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "BLM Surface Management Agency",
    },
    layers: ["public-lands-federal-layer"],
    minZoomNote: "Visible at zoom 7+",
  },
  {
    id: "public_state",
    label: "State",
    group: "Public Lands",
    defaultOn: false,
    source: {
      id: "public-lands-state-source",
      type: "geojson",
      data: "https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/5/query?where=1%3D1&outFields=NAME&returnGeometry=true&f=geojson",
    },
    layers: ["public-lands-state-layer"],
    minZoomNote: "Visible at zoom 7+",
  },
  {
    id: "access_fishing_sites",
    label: "Fishing Access Sites (MT FWP)",
    group: "Access",
    defaultOn: false,
    source: {
      id: "access-fishing-sites-source",
      type: "geojson",
      data: "https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer/1/query?where=1%3D1&outFields=NAME&returnGeometry=true&f=geojson",
    },
    layers: ["access-fishing-sites-layer"],
  },
  {
    id: "mri_river_lines",
    label: "Rivers",
    group: "MRI Overlays",
    defaultOn: true,
    source: { id: "selected-river-source", type: "geojson" },
    layers: ["rivers-main", "rivers-hit"],
  },
  {
    id: "mri_selected_highlight",
    label: "Selected river highlight",
    group: "MRI Overlays",
    defaultOn: true,
    source: { id: "selected-river-source", type: "geojson" },
    layers: ["rivers-halo", "rivers-casing"],
  },
  {
    id: "mri_river_markers",
    label: "River markers",
    group: "MRI Overlays",
    defaultOn: true,
    source: { id: "rivers-source", type: "geojson" },
    layers: ["rivers-unclustered", "rivers-selected-halo", "rivers-selected-core"],
    locked: true,
  },
  {
    id: "mri_score_coloring",
    label: "Score coloring",
    group: "MRI Overlays",
    defaultOn: false,
    source: { id: "rivers-source", type: "geojson" },
    layers: ["rivers-unclustered"],
  },
  {
    id: "mri_labels",
    label: "Labels",
    group: "MRI Overlays",
    defaultOn: true,
    source: { id: "basemap-style", type: "none" },
    layers: ["river-labels"],
  },
  {
    id: "hydro_flow_magnitude",
    label: "Flow magnitude",
    group: "MRI Overlays",
    defaultOn: false,
    source: { id: "rivers-source", type: "geojson" },
    layers: ["hydro-flow-magnitude-layer"],
  },
  {
    id: "hydro_change_indicator",
    label: "48h change indicator",
    group: "MRI Overlays",
    defaultOn: false,
    source: { id: "rivers-source", type: "geojson" },
    layers: ["hydro-change-indicator-layer"],
  },
  {
    id: "hydro_temp_stress",
    label: "Temp stress flag",
    group: "MRI Overlays",
    defaultOn: false,
    source: { id: "rivers-source", type: "geojson" },
    layers: ["hydro-temp-stress-layer"],
  },
];

export const LAYERS_STORAGE_KEY = "mri.layers.v2";

export const DEFAULT_BASEMAP: BasemapId =
  BASEMAP_OPTIONS.find((b) => b.defaultOn)?.id ?? "dark";

export function createDefaultLayerState(): Record<LayerId, boolean> {
  return LAYER_REGISTRY.reduce((acc, layer) => {
    acc[layer.id] = layer.defaultOn;
    return acc;
  }, {} as Record<LayerId, boolean>);
}

export const LAYER_GROUP_ORDER: LayerGroup[] = ["MRI Overlays", "Public Lands", "Access"];
