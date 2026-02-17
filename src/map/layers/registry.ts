export type BasemapId = "dark" | "light" | "satellite" | "hybrid";

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
  | "mri_labels";

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

export const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: "dark",
    label: "Dark",
    styleUrl: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    defaultOn: true,
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
      : undefined,
    enabled: hasMaptiler,
    comingSoon: !hasMaptiler,
  },
  {
    id: "hybrid",
    label: "Hybrid",
    styleUrl: hasMaptiler
      ? `https://api.maptiler.com/maps/hybrid/style.json?key=${maptilerKey}`
      : undefined,
    enabled: hasMaptiler,
    comingSoon: !hasMaptiler,
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
    source: { id: "public-lands-state-source", type: "none" },
    layers: [],
    comingSoon: true,
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
    label: "River lines",
    group: "MRI Overlays",
    defaultOn: true,
    source: { id: "selected-river-source", type: "geojson" },
    layers: ["selected-river-base"],
  },
  {
    id: "mri_selected_highlight",
    label: "Selected river highlight",
    group: "MRI Overlays",
    defaultOn: true,
    source: { id: "selected-river-source", type: "geojson" },
    layers: ["selected-river-casing", "selected-river-main"],
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
    layers: ["selected-river-label"],
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

export const LAYER_GROUP_ORDER: LayerGroup[] = ["Public Lands", "Access", "MRI Overlays"];
