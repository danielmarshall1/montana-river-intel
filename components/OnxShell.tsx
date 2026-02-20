"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Plus, Minus, Maximize2, Crosshair, Layers, List } from "lucide-react";
import { MapView } from "@/components/MapView";
import { fetchRiverGeom } from "@/lib/supabase";
import { fetchRiverGeojsonBrowser } from "@/lib/supabaseBrowser";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import { deriveScoreBreakdown } from "@/lib/scoreBreakdown";
import { getSeasonalIntel } from "@/lib/seasonalIntel";
import { generateTodaysRead } from "@/lib/todaysRead";
import { MRI_COLORS } from "@/lib/theme";
import { getFlowTrendArrow } from "@/lib/trend";
import { riskFlags } from "@/lib/riskFlags";
import { fetchRiverHistory14d, fetchRiverIntraday24h } from "@/lib/supabase";
import { Sparkline } from "@/components/Sparkline";
import { summarizeThermalWindow } from "@/lib/thermalWindow";
import { generateHatchIntel } from "@/lib/hatchIntel";
import {
  BASEMAP_OPTIONS,
  DEFAULT_BASEMAP,
  LAYER_GROUP_ORDER,
  LAYER_REGISTRY,
  LAYERS_STORAGE_KEY,
  createDefaultLayerState,
  type BasemapId,
  type LayerId,
} from "@/src/map/layers/registry";
import type { FishabilityRow } from "@/lib/types";

type River = FishabilityRow;

function TierPill({ tier }: { tier?: string }) {
  const dotColor =
    tier === "Good" || tier === "HOT" || tier === "GOOD"
      ? MRI_COLORS.good
      : tier === "Fair" || tier === "FAIR"
      ? MRI_COLORS.fair
      : MRI_COLORS.tough;
  const label =
    tier === "HOT" || tier === "GOOD"
      ? "Good"
      : tier === "FAIR"
      ? "Fair"
      : tier === "TOUGH"
      ? "Tough"
      : tier ?? "—";

  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/90">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
      {label}
    </span>
  );
}

function formatNum(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

function formatPullTime(value: string | null | undefined): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Denver",
  });
}

function formatUpdatedAgo(value: string | null | undefined): string {
  if (!value) return "Updated recently";
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return "Updated recently";
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `Updated ${h}h ago`;
  const d = Math.floor(h / 24);
  return `Updated ${d}d ago`;
}

export default function OnxShell({
  rivers,
  dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
}: {
  rivers: River[];
  dateLabel?: string;
}) {
  type TopPanel = "none" | "layers" | "detail";
  type DrawerSnap = "collapsed" | "mid" | "expanded";
  const DRAWER_SNAP_Y: Record<DrawerSnap, number> = {
    collapsed: 0.84,
    mid: 0.42,
    expanded: 0,
  };

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"All" | "Good" | "Fair" | "Tough">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionSeq, setSelectionSeq] = useState(0);
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>("mid");
  const [sheetY, setSheetY] = useState<number>(DRAWER_SNAP_Y.mid);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startSheetY: number } | null>(null);

  const [selectedGeojson, setSelectedGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const [riverLinesGeojson, setRiverLinesGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [openTopPanel, setOpenTopPanel] = useState<TopPanel>("none");
  const [transparencyOpen, setTransparencyOpen] = useState(false);
  const [advancedLayersOpen, setAdvancedLayersOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    Array<{ obs_date: string; flow_cfs: number | null; water_temp_f: number | null; fishability_score: number | null }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [intradayRows, setIntradayRows] = useState<
    Array<{ observed_at: string; flow_cfs: number | null; water_temp_f: number | null; gage_height_ft: number | null }>
  >([]);
  const [intradayLoading, setIntradayLoading] = useState(false);

  const [basemap, setBasemap] = useState<BasemapId>("hybrid");
  const [layerState, setLayerState] = useState<Record<LayerId, boolean>>(
    createDefaultLayerState()
  );

  const basemapById = useMemo(
    () => Object.fromEntries(BASEMAP_OPTIONS.map((b) => [b.id, b])) as Record<BasemapId, (typeof BASEMAP_OPTIONS)[number]>,
    []
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rivers ?? [])
      .filter((r) => {
        const matchesSearch =
          !s ||
          (r.river_name ?? "").toLowerCase().includes(s) ||
          (r.gauge_label ?? "").toLowerCase().includes(s);

        const displayTier =
          r.bite_tier === "HOT" || r.bite_tier === "GOOD"
            ? "Good"
            : r.bite_tier === "FAIR"
            ? "Fair"
            : r.bite_tier === "TOUGH"
            ? "Tough"
            : "";

        return matchesSearch && (tier === "All" || displayTier === tier);
      })
      .sort(
        (a, b) =>
          (b.fishability_score_calc ?? -999) - (a.fishability_score_calc ?? -999)
      );
  }, [rivers, search, tier]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      filtered.find((r) => r.river_id === selectedId) ??
      rivers.find((r) => r.river_id === selectedId) ??
      null
    );
  }, [filtered, rivers, selectedId]);

  const seasonalIntel = useMemo(() => getSeasonalIntel(), []);
  const breakdown = useMemo(() => (selected ? deriveScoreBreakdown(selected) : null), [selected]);
  const todaysRead = useMemo(() => generateTodaysRead(selected), [selected]);
  const flags = useMemo(() => riskFlags(selected), [selected]);
  const thermalSummary = useMemo(
    () => summarizeThermalWindow(selected, intradayRows),
    [selected, intradayRows]
  );
  const hatchIntel = useMemo(
    () => generateHatchIntel(selected, thermalSummary),
    [selected, thermalSummary]
  );
  const topRivers = useMemo(
    () => filtered.filter((r) => (r.fishability_score_calc ?? null) != null).slice(0, 5),
    [filtered]
  );
  const hatchLikelihood = useMemo(() => {
    if (seasonalIntel.season === "Summer") return "High";
    if (seasonalIntel.season === "Spring" || seasonalIntel.season === "Fall") return "Moderate";
    return "Low";
  }, [seasonalIntel.season]);

  const latestPullAt = useMemo(() => {
    let latestMs = 0;
    for (const r of rivers) {
      const candidate =
        r.source_flow_observed_at ?? r.source_temp_observed_at ?? r.updated_at ?? null;
      if (!candidate) continue;
      const ms = new Date(candidate).getTime();
      if (!Number.isNaN(ms) && ms > latestMs) latestMs = ms;
    }
    return latestMs > 0 ? new Date(latestMs).toISOString() : null;
  }, [rivers]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!selectedId) {
        setSelectedGeojson(null);
        return;
      }
      const river =
        filtered.find((r) => r.river_id === selectedId) ??
        rivers.find((r) => r.river_id === selectedId);
      const key = river?.slug ?? river?.river_id ?? selectedId;

      const gj = await fetchRiverGeojsonBrowser(key);
      if (cancelled) return;
      if (gj) {
        setSelectedGeojson(gj);
        return;
      }

      const geom = await fetchRiverGeom(selectedId);
      if (cancelled) return;
      setSelectedGeojson(
        geom
          ? ({
              type: "Feature",
              geometry: geom,
              properties: { river_id: selectedId },
            } as GeoJSON.Feature)
          : null
      );
    }

    run().catch(() => {
      if (!cancelled) setSelectedGeojson(null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, filtered, rivers]);

  useEffect(() => {
    let cancelled = false;

    async function loadRiverLines() {
      const tasks = rivers.map(async (river) => {
        const key = river.slug ?? river.river_id;
        const gj = await fetchRiverGeojsonBrowser(key);
        if (!gj) return null;
        return { river, gj };
      });

      const results = await Promise.all(tasks);
      if (cancelled) return;

      const features: GeoJSON.Feature[] = [];
      for (const item of results) {
        if (!item?.gj) continue;
        const rid = item.river.river_id;
        const rname = item.river.river_name;

        if (item.gj.type === "FeatureCollection") {
          for (const f of item.gj.features ?? []) {
            if (!f?.geometry) continue;
            features.push({
              type: "Feature",
              geometry: f.geometry,
              properties: {
                ...(f.properties ?? {}),
                river_id: rid,
                river_name: rname,
                name: rname,
              },
            });
          }
          continue;
        }

        if (item.gj.type === "Feature") {
          if (item.gj.geometry) {
            features.push({
              type: "Feature",
              geometry: item.gj.geometry,
              properties: {
                ...(item.gj.properties ?? {}),
                river_id: rid,
                river_name: rname,
                name: rname,
              },
            });
          }
          continue;
        }

        if (item.gj.type === "LineString" || item.gj.type === "MultiLineString") {
          features.push({
            type: "Feature",
            geometry: item.gj,
            properties: {
              river_id: rid,
              river_name: rname,
              name: rname,
            },
          });
        }
      }

      setRiverLinesGeojson({ type: "FeatureCollection", features });
    }

    loadRiverLines().catch(() => {
      if (!cancelled) setRiverLinesGeojson({ type: "FeatureCollection", features: [] });
    });

    return () => {
      cancelled = true;
    };
  }, [rivers]);

  useEffect(() => {
    if (selected) {
      setOpenTopPanel((prev) => (prev === "layers" ? prev : "detail"));
      return;
    }
    if (openTopPanel === "detail") {
      setOpenTopPanel("none");
    }
    setTransparencyOpen(false);
  }, [selected, openTopPanel]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!selected?.river_id) {
        setHistoryRows([]);
        return;
      }
      setHistoryLoading(true);
      const data = await fetchRiverHistory14d(selected.river_id);
      if (!cancelled) {
        setHistoryRows(data);
        setHistoryLoading(false);
      }
    }
    loadHistory().catch(() => {
      if (!cancelled) {
        setHistoryRows([]);
        setHistoryLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.river_id]);

  useEffect(() => {
    let cancelled = false;
    async function loadIntraday() {
      if (!selected?.river_id) {
        setIntradayRows([]);
        return;
      }
      setIntradayLoading(true);
      const data = await fetchRiverIntraday24h(selected.river_id);
      if (!cancelled) {
        setIntradayRows(data);
        setIntradayLoading(false);
      }
    }
    loadIntraday().catch(() => {
      if (!cancelled) {
        setIntradayRows([]);
        setIntradayLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.river_id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<{
        basemap: BasemapId;
        layerState: Record<LayerId, boolean>;
      }>;

      if (parsed.basemap && basemapById[parsed.basemap]) {
        setBasemap(parsed.basemap);
      }

      if (parsed.layerState) {
        const defaults = createDefaultLayerState();
        const merged: Record<LayerId, boolean> = { ...defaults };
        for (const layer of LAYER_REGISTRY) {
          if (typeof parsed.layerState[layer.id] === "boolean") {
            merged[layer.id] = parsed.layerState[layer.id];
          }
        }
        setLayerState(merged);
      }
    } catch {
      /* ignore localStorage parse issues */
    }
  }, [basemapById]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LAYERS_STORAGE_KEY,
        JSON.stringify({ basemap, layerState })
      );
    } catch {
      /* ignore write issues */
    }
  }, [basemap, layerState]);

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
  }

  function onSheetPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;

    dragRef.current = { startY: y, startSheetY: sheetY };
    setIsDragging(true);
    document.body.style.userSelect = "none";

    const onMove = (e2: PointerEvent | TouchEvent) => {
      const y2 =
        "touches" in e2
          ? (e2 as TouchEvent).touches[0]?.clientY
          : (e2 as PointerEvent).clientY;
      if (y2 == null || !dragRef.current) return;
      const dy = y2 - dragRef.current.startY;
      setSheetY(clamp(dragRef.current.startSheetY + dy / 320, 0, 1));
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsDragging(false);
      document.body.style.userSelect = "";
      setSheetY((current) => {
        const snaps: DrawerSnap[] = ["expanded", "mid", "collapsed"];
        const nearest = snaps.reduce(
          (best, next) =>
            Math.abs(current - DRAWER_SNAP_Y[next]) < Math.abs(current - DRAWER_SNAP_Y[best])
              ? next
              : best,
          "mid" as DrawerSnap
        );
        setDrawerSnap(nearest);
        return DRAWER_SNAP_Y[nearest];
      });

      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onUp);
  }

  function zoomIn() {
    mapRef.current?.zoomIn?.({ duration: 180 });
  }

  function zoomOut() {
    mapRef.current?.zoomOut?.({ duration: 180 });
  }

  function recenter() {
    mapRef.current?.flyTo?.({
      center: [-110.9, 46.9],
      zoom: 5.2,
      duration: 450,
      essential: true,
    });
  }

  function fitToRivers() {
    const map = mapRef.current;
    if (!map || !filtered.length) return;

    const bounds = new maplibregl.LngLatBounds();
    let hasAny = false;

    for (const r of filtered) {
      const lat = r.lat ?? (r as { latitude?: number }).latitude;
      const lng = r.lng ?? (r as { longitude?: number }).longitude;
      const coords: [number, number] | undefined =
        lat != null && lng != null ? [lng, lat] : RIVER_FOCUS_POINTS[r.river_id];

      if (!coords) continue;
      bounds.extend(coords);
      hasAny = true;
    }

    if (hasAny && !bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, duration: 450, essential: true });
    }
  }

  function setBasemapStyle(next: BasemapId) {
    const option = basemapById[next];
    if (!option?.enabled) return;
    setBasemap(next);
  }

  function setLayerEnabled(layerId: LayerId, enabled: boolean) {
    setLayerState((prev) => ({ ...prev, [layerId]: enabled }));
  }

  function resetLayers() {
    setLayerState(createDefaultLayerState());
    setBasemap(DEFAULT_BASEMAP);
  }

  function toggleTopPanel(panel: TopPanel) {
    setOpenTopPanel((prev) => (prev === panel ? "none" : panel));
  }

  function selectRiver(riverId: string | null) {
    setSelectedId(riverId);
    if (riverId) {
      setSelectionSeq((prev) => prev + 1);
      setOpenTopPanel("detail");
    }
  }

  const layersOpen = openTopPanel === "layers";
  const detailsOpen = openTopPanel === "detail";

  const groupedLayers = useMemo(
    () =>
      LAYER_GROUP_ORDER.map((group) => ({
        group,
        layers: LAYER_REGISTRY.filter((layer) => layer.group === group),
      })),
    []
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapView
          rivers={filtered}
          selectedRiver={selected}
          selectedRiverName={selected?.river_name ?? null}
          selectedRiverId={selectedId}
          selectedRiverGeojson={selectedGeojson}
          riverLinesGeojson={riverLinesGeojson}
          basemap={basemap}
          layerState={layerState}
          rightPanelOpen={detailsOpen}
          drawerState={drawerSnap}
          selectionSeq={selectionSeq}
          onSelectRiver={(r) => selectRiver(r.river_id)}
          className="absolute inset-0"
          onMapReady={(m) => {
            mapRef.current = m;
          }}
        />
      </div>

      <aside className="absolute left-4 top-4 z-20 hidden w-[86px] sm:block">
        <div className="onx-glass overflow-hidden rounded-2xl">
          <div className="border-b border-white/10 px-3 py-3">
            <div className="text-sm font-semibold leading-tight text-white">MRI</div>
            <div className="text-[10px] leading-tight text-white/70">Montana</div>
          </div>
          <div className="flex flex-col gap-2 p-2">
            <button className="onx-iconbtn" title="Layers" onClick={() => toggleTopPanel("layers")}>
              <Layers size={18} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn" title="Zoom in" onClick={zoomIn}>
              <Plus size={18} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn" title="Zoom out" onClick={zoomOut}>
              <Minus size={18} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn" title="Fit to rivers" onClick={fitToRivers}>
              <Maximize2 size={18} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn" title="Recenter Montana" onClick={recenter}>
              <Crosshair size={18} strokeWidth={2.5} />
            </button>
            <button
              className="onx-iconbtn"
              title="Toggle list"
              onClick={() => {
                const next = drawerSnap === "collapsed" ? "mid" : "collapsed";
                setDrawerSnap(next);
                setSheetY(DRAWER_SNAP_Y[next]);
              }}
            >
              <List size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </aside>

      <header className="absolute left-4 right-4 top-4 z-20 sm:left-[108px] sm:right-[340px]">
        <div className="onx-glass rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="hidden shrink-0 text-xs font-semibold text-white/85 sm:block">
              {dateLabel} • {filtered.length} rivers
            </div>
            <div className="hidden shrink-0 text-[11px] text-white/60 lg:block">
              Last pull {formatPullTime(latestPullAt)} MT
            </div>
            <div className="flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rivers..."
                className="mri-topbar-input"
              />
            </div>
            <button
              className="rounded-md px-2 py-1 text-xs text-white/75 hover:text-white"
              onClick={() => {
                setSearch("");
                setTier("All");
                selectRiver(null);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`mri-chip ${tier === t ? "mri-chip-active" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="absolute right-4 top-4 z-30 flex items-start gap-2">
        <button
          className={`onx-iconbtn sm:hidden ${layersOpen ? "ring-2 ring-sky-300/50" : ""}`}
          title="Layers"
          onClick={() => toggleTopPanel("layers")}
        >
          <Layers size={18} strokeWidth={2.5} />
        </button>

        <div
          className={[
            "mri-fade w-[min(360px,calc(100vw-1.5rem))]",
            layersOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        >
          <div className="onx-card rounded-2xl p-4">
            <div className="mri-scroll max-h-[70vh] overflow-auto pr-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Layers</div>
                  <div className="text-[11px] text-slate-500">Map display controls</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
                    onClick={resetLayers}
                  >
                    Reset
                  </button>
                  <button
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
                    onClick={() => setOpenTopPanel("none")}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Basemap
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {BASEMAP_OPTIONS.map((option) => {
                  const selectedBasemap = basemap === option.id;
                  return (
                    <button
                      key={option.id}
                      disabled={!option.enabled}
                      className={[
                        "rounded-lg border px-2 py-1.5 text-xs font-medium",
                        selectedBasemap
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700",
                        !option.enabled ? "cursor-not-allowed opacity-55" : "hover:bg-slate-50",
                      ].join(" ")}
                      onClick={() => setBasemapStyle(option.id)}
                    >
                      <div>{option.label}</div>
                      {!option.enabled && option.comingSoon ? (
                        <div className="text-[10px] text-slate-500">Coming soon</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Core Layers
                </div>
                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs text-slate-700">
                  {groupedLayers
                    .flatMap((g) => g.layers)
                    .filter((layer) => layer.id === "mri_river_lines" || layer.id === "mri_selected_highlight")
                    .map((layer) => (
                      <label key={layer.id} className="flex items-start justify-between gap-3">
                        <span>{layer.label}</span>
                        <input
                          type="checkbox"
                          checked={layerState[layer.id]}
                          onChange={(e) => setLayerEnabled(layer.id, e.target.checked)}
                        />
                      </label>
                    ))}
                </div>
              </div>

              <div className="mt-4">
                <button
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setAdvancedLayersOpen((v) => !v)}
                >
                  {advancedLayersOpen ? "Hide Advanced Layers" : "Advanced Layers"}
                </button>
              </div>

              {advancedLayersOpen
                ? groupedLayers.map(({ group, layers }) => (
                    <div key={group} className="mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {group}
                      </div>
                      <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs text-slate-700">
                        {layers
                          .filter(
                            (layer) =>
                              !layer.locked &&
                              layer.id !== "mri_river_lines" &&
                              layer.id !== "mri_selected_highlight"
                          )
                          .map((layer) => (
                            <label key={layer.id} className="flex items-start justify-between gap-3">
                              <span className="leading-tight">
                                <span className="block">{layer.label}</span>
                                {layer.minZoomNote ? (
                                  <span className="text-[10px] text-slate-500">{layer.minZoomNote}</span>
                                ) : null}
                                {layer.comingSoon ? (
                                  <span className="text-[10px] text-slate-500">Coming soon</span>
                                ) : null}
                              </span>
                              <input
                                type="checkbox"
                                checked={layerState[layer.id]}
                                disabled={Boolean(layer.comingSoon)}
                                onChange={(e) => setLayerEnabled(layer.id, e.target.checked)}
                              />
                            </label>
                          ))}
                      </div>
                    </div>
                  ))
                : null}
            </div>
          </div>
        </div>
      </div>

      <section className="absolute right-4 top-[118px] z-20 hidden w-[314px] sm:block">
        {detailsOpen ? (
          <div className="onx-card rounded-3xl p-7">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                River Detail
              </div>
              <button
                className="text-[11px] text-slate-500 hover:text-slate-700"
                onClick={() => setOpenTopPanel("none")}
              >
                Collapse
              </button>
            </div>

            {selected ? (
              <>
                <div className="mt-2 text-[17px] font-semibold text-slate-900">
                  {selected.river_name}
                </div>
                <div className="text-xs text-slate-600">{selected.gauge_label ?? ""}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {formatUpdatedAgo(selected.source_flow_observed_at ?? selected.source_temp_observed_at ?? selected.updated_at)}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-0.5 text-[11px] text-slate-500">
                  <div>
                    Flow source: {formatPullTime(selected.source_flow_observed_at)} MT
                  </div>
                  <div>
                    Temp source: {formatPullTime(selected.source_temp_observed_at)} MT
                  </div>
                  <div>
                    Weather/score: {formatPullTime(selected.updated_at)} MT
                  </div>
                </div>

                <div
                  className="mt-3 text-[11px] leading-4 text-slate-500"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  <span className="text-slate-600">Today&apos;s Read: </span>
                  {todaysRead}
                </div>
                {flags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {flags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="my-4 h-px bg-slate-300/65" />

                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6 text-xs">
                  <div>
                    <div className="font-semibold leading-none tracking-[-0.02em] text-slate-900 text-[56px]">
                      {selected.fishability_score_calc ?? "—"}
                    </div>
                    <div className="mt-2">
                      <TierPill
                        tier={
                          selected.bite_tier === "HOT" || selected.bite_tier === "GOOD"
                            ? "Good"
                            : selected.bite_tier === "FAIR"
                            ? "Fair"
                            : selected.bite_tier === "TOUGH"
                            ? "Tough"
                            : undefined
                        }
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {selected.fishability_rank != null && filtered.length > 0
                        ? `Rank ${selected.fishability_rank} / ${filtered.length}`
                        : "Rank unavailable"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {selected.fishability_percentile != null
                        ? `Top ${Math.max(1, Math.round(100 - Number(selected.fishability_percentile)))}%`
                        : "Percentile unavailable"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Flow</div>
                    <div className="font-medium text-slate-900">
                      {selected.flow_cfs ?? "—"}
                      <span className="ml-1 text-[11px] font-medium text-slate-500">
                        {getFlowTrendArrow(selected.change_48h_pct_calc)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Temp</div>
                    <div className="font-medium text-slate-900">
                      {selected.water_temp_f != null ? `${Number(selected.water_temp_f).toFixed(1)}°F` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Stability</div>
                    <div className="font-medium text-slate-900">
                      {selected.change_48h_pct_calc == null
                        ? "—"
                        : `${Number(selected.change_48h_pct_calc).toFixed(1)}% 48h`}
                      <span className="ml-1 text-[11px] font-medium text-slate-500">
                        {getFlowTrendArrow(selected.change_48h_pct_calc)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Ratio</div>
                    <div className="font-medium text-slate-900">
                      {selected.flow_ratio_calc != null ? `${Number(selected.flow_ratio_calc).toFixed(2)}x` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Hatch likelihood</div>
                    <div className="font-medium text-slate-900">{hatchLikelihood}</div>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-600">
                  Wind AM {selected.wind_am_mph ?? "—"} • PM {selected.wind_pm_mph ?? "—"}
                </div>

                <div className="my-3 h-px bg-slate-300/65" />

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Water Temp Window (24h)
                  </div>
                  {intradayLoading ? (
                    <div className="mt-2 text-xs text-slate-500">Loading intraday thermal...</div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs text-slate-700">{thermalSummary.windowLabel}</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        <div>Now</div>
                        <div className="text-right font-medium text-slate-900">
                          {thermalSummary.tempNowF != null ? `${thermalSummary.tempNowF.toFixed(1)}°F` : "—"}
                        </div>
                        <div>3h delta</div>
                        <div className="text-right font-medium text-slate-900">
                          {thermalSummary.delta3hF != null ? `${thermalSummary.delta3hF > 0 ? "+" : ""}${thermalSummary.delta3hF.toFixed(1)}°` : "—"}
                        </div>
                        <div>Since morning</div>
                        <div className="text-right font-medium text-slate-900">
                          {thermalSummary.deltaSinceMorningF != null
                            ? `${thermalSummary.deltaSinceMorningF > 0 ? "+" : ""}${thermalSummary.deltaSinceMorningF.toFixed(1)}°`
                            : "—"}
                        </div>
                        <div>24h range</div>
                        <div className="text-right font-medium text-slate-900">
                          {thermalSummary.min24hF != null && thermalSummary.max24hF != null
                            ? `${thermalSummary.min24hF.toFixed(1)}°-${thermalSummary.max24hF.toFixed(1)}°`
                            : "—"}
                        </div>
                      </div>
                      <Sparkline
                        className="h-12 w-full"
                        stroke="#6b7280"
                        values={intradayRows.map((x) => x.water_temp_f)}
                      />
                    </div>
                  )}
                </div>

                <div className="my-3 h-px bg-slate-300/65" />

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Trend (14D)
                  </div>
                  {historyLoading ? (
                    <div className="mt-2 text-xs text-slate-500">Loading trend...</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="mb-0.5 text-[10px] text-slate-500">
                          Flow {historyRows[0]?.flow_cfs != null ? `(${historyRows[0]?.flow_cfs})` : ""}
                        </div>
                        <Sparkline
                          className="h-12 w-full"
                          stroke={MRI_COLORS.riverSelected}
                          values={historyRows.slice().reverse().map((x) => x.flow_cfs)}
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 text-[10px] text-slate-500">
                          Temp {historyRows[0]?.water_temp_f != null ? `(${Number(historyRows[0]?.water_temp_f).toFixed(1)}°F)` : ""}
                        </div>
                        <Sparkline
                          className="h-12 w-full"
                          stroke="#6b7280"
                          values={historyRows.slice().reverse().map((x) => x.water_temp_f)}
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 text-[10px] text-slate-500">
                          Score {historyRows[0]?.fishability_score != null ? `(${historyRows[0]?.fishability_score})` : ""}
                        </div>
                        <Sparkline
                          className="h-12 w-full"
                          stroke={MRI_COLORS.good}
                          values={historyRows.slice().reverse().map((x) => x.fishability_score)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="my-3 h-px bg-slate-300/65" />

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Hatch Intel ({seasonalIntel.season})
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">Likely bugs:</span> {hatchIntel.likelyBugs}
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">Confidence:</span> {hatchIntel.confidence}
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">Best window:</span> {hatchIntel.bestWindow}
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">Recommended approach:</span> {hatchIntel.approach}
                  </div>
                </div>

                <button
                  className="mt-3 w-full rounded-lg border border-slate-200/80 bg-white/70 px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setTransparencyOpen((v) => !v)}
                >
                  How this score is calculated
                </button>

                {transparencyOpen && breakdown ? (
                  <div className="mt-2 rounded-lg bg-slate-50/70 p-2 text-[11px] text-slate-700">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div>Flow Score</div>
                      <div className="text-right font-semibold">{formatNum(breakdown.flowScore)}</div>
                      <div>Stability Score</div>
                      <div className="text-right font-semibold">{formatNum(breakdown.stabilityScore)}</div>
                      <div>Thermal Score</div>
                      <div className="text-right font-semibold">{formatNum(breakdown.thermalScore)}</div>
                      <div>Wind Penalty</div>
                      <div className="text-right font-semibold">{formatNum(breakdown.windPenalty)}</div>
                      <div className="border-t border-slate-200 pt-1 font-semibold">Total Score</div>
                      <div className="border-t border-slate-200 pt-1 text-right font-semibold">
                        {formatNum(breakdown.totalScore)}
                      </div>
                    </div>

                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Raw inputs
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <div>Flow cfs</div>
                        <div className="text-right">{formatNum(selected.flow_cfs)}</div>
                        <div>Median flow</div>
                        <div className="text-right">{formatNum(selected.median_flow_cfs)}</div>
                        <div>Ratio</div>
                        <div className="text-right">{formatNum(selected.flow_ratio_calc, 2)}x</div>
                        <div>48h change</div>
                        <div className="text-right">{formatNum(selected.change_48h_pct_calc, 1)}%</div>
                        <div>Temp</div>
                        <div className="text-right">{formatNum(selected.water_temp_f, 1)}°F</div>
                        <div>Wind AM / PM</div>
                        <div className="text-right">
                          {formatNum(selected.wind_am_mph)} / {formatNum(selected.wind_pm_mph)}
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500">
                        Components are estimated from current telemetry values; total score is the live MRI score.
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="mt-2 text-sm font-semibold text-slate-900">Montana River Intel</div>
                <div className="text-xs text-slate-600">
                  Tap a river in the list to preview details here.
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            className="onx-glass rounded-xl px-3 py-2 text-xs font-medium text-white/90 hover:text-white"
            onClick={() => setOpenTopPanel("detail")}
          >
            Details
          </button>
        )}
      </section>

      <div
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{
          transform: `translateY(${sheetY * 78}%)`,
          transition: isDragging ? "none" : "transform 220ms ease-out",
        }}
      >
        <div className={`mx-auto max-w-6xl px-3 pb-3 ${detailsOpen ? "sm:pr-[340px]" : ""}`}>
          <div className="onx-glass overflow-hidden rounded-3xl shadow-2xl">
            <div
              className={`mx-auto mt-2 h-1.5 w-14 flex-shrink-0 cursor-grab rounded-full bg-white/35 active:cursor-grabbing ${isDragging ? "select-none" : ""}`}
              onPointerDown={onSheetPointerDown}
              onTouchStart={onSheetPointerDown}
              title="Drag to expand/collapse"
            />
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="text-sm font-semibold text-white">Rivers ({filtered.length})</div>
              <button
                className="text-xs text-white/80 hover:text-white"
                onClick={() => {
                  const next = drawerSnap === "collapsed" ? "mid" : "collapsed";
                  setDrawerSnap(next);
                  setSheetY(DRAWER_SNAP_Y[next]);
                }}
              >
                {drawerSnap === "collapsed" ? "Expand" : "Collapse"}
              </button>
            </div>

            {topRivers.length > 0 ? (
              <div className="px-4 pt-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  Top Rivers Today
                </div>
                <div className="flex gap-2 overflow-auto pb-1">
                  {topRivers.map((r) => (
                    <button
                      key={`top-${r.river_id}`}
                      onClick={() => selectRiver(r.river_id)}
                      className={[
                        "whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition",
                        r.river_id === selectedId
                          ? "border-white/50 bg-white/20 text-white"
                          : "border-white/20 bg-white/10 text-white/85 hover:bg-white/15",
                      ].join(" ")}
                    >
                      #{r.fishability_rank ?? "—"} {r.river_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="px-3 pb-3 pt-2">
              <div
                className="mri-scroll overflow-auto pr-1 transition-[max-height] duration-200"
                style={{
                  maxHeight: drawerSnap === "expanded" ? "65vh" : drawerSnap === "mid" ? "40vh" : "80px",
                }}
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((r) => (
                    <button
                      key={r.river_id}
                      onClick={() => selectRiver(r.river_id)}
                      className={`mri-drawer-card text-left ${r.river_id === selectedId ? "mri-drawer-card-selected" : ""}`}
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <div className="text-sm font-semibold text-white">{r.river_name}</div>
                              {r.is_stale ? (
                                <span
                                  className="h-2 w-2 rounded-full"
                                  title={r.stale_reason ?? "Stale"}
                                  style={{ backgroundColor: MRI_COLORS.fair, opacity: 0.9 }}
                                />
                              ) : null}
                            </div>
                            <div className="text-xs text-white/60">{r.gauge_label ?? ""}</div>
                          </div>
                          <TierPill
                            tier={
                              r.bite_tier === "HOT" || r.bite_tier === "GOOD"
                                ? "Good"
                                : r.bite_tier === "FAIR"
                                ? "Fair"
                                : r.bite_tier === "TOUGH"
                                ? "Tough"
                                : undefined
                            }
                          />
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/88">
                          <div>
                            <div className="mri-kv-label">Score</div>
                            <div className="font-semibold">{r.fishability_score_calc ?? "—"}</div>
                          </div>
                          <div>
                            <div className="mri-kv-label">Flow</div>
                            <div className="font-semibold">
                              {r.flow_cfs ?? "—"}
                              <span className="ml-1 text-[11px] font-medium text-white/60">
                                {getFlowTrendArrow(r.change_48h_pct_calc)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="mri-kv-label">Temp</div>
                            <div className="font-semibold">
                              {r.water_temp_f != null ? `${Number(r.water_temp_f).toFixed(1)}°` : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-white/70">
                    No rivers match your search/filter.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
