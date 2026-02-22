"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Plus, Minus, Maximize2, Crosshair, Layers, List, X } from "lucide-react";
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

function getFishabilityIndex(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) {
    return { value: "—", normalized: null as number | null, percent: 0, band: "Unavailable", optimal: false };
  }
  const normalized = Math.max(0, Math.min(10, Number(score) / 10));
  const percent = Math.max(0, Math.min(100, normalized * 10));
  const band = normalized >= 8.5 ? "Excellent" : normalized >= 6.5 ? "Good" : normalized >= 4 ? "Fair" : "Poor";
  return {
    value: normalized.toFixed(1),
    normalized,
    percent,
    band,
    optimal: normalized >= 7.5 && normalized <= 9.2,
  };
}

function getTempStatusLabel(river: River | null | undefined): string {
  if (!river) return "Temp status unavailable";
  if (river.temp_status === "available_stale") {
    const mins = river.temp_age_minutes;
    if (mins != null && Number.isFinite(mins)) {
      const h = Math.floor(mins / 60);
      return h > 0 ? `Temp stale (${h}h old)` : `Temp stale (${mins}m old)`;
    }
    return "Temp stale";
  }
  if (river.temp_status === "unavailable_at_gauge") {
    return "Temp not available at this gauge";
  }
  return "Temp fresh";
}

function getTempSourceLabel(river: River | null | undefined): string {
  if (!river) return "—";
  const kind = river.temp_source_kind ?? "NONE";
  const site = river.temp_source_site_no ?? "—";
  if (kind === "NONE") return "No temp source";
  return `${kind} • Site ${site}`;
}

export default function OnxShell({
  rivers,
  stationGeojson,
  dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
}: {
  rivers: River[];
  stationGeojson?: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> | null;
  dateLabel?: string;
}) {
  type TopPanel = "none" | "layers" | "detail";
  type DrawerSnap = "collapsed" | "mid" | "expanded";
  type MobileSurface = "map" | "list" | "detail" | "tools";
  type MobileListSnap = "peek" | "mid" | "full";
  const DRAWER_SNAP_Y: Record<DrawerSnap, number> = {
    collapsed: 0.84,
    mid: 0.42,
    expanded: 0,
  };
  const MOBILE_LIST_SNAP_Y: Record<MobileListSnap, number> = {
    peek: 0.78,
    mid: 0.46,
    full: 0.08,
  };
  const SNAP_TRANSITION = "transform 260ms ease-in-out";

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"All" | "Good" | "Fair" | "Tough">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionSeq, setSelectionSeq] = useState(0);
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>("mid");
  const [sheetY, setSheetY] = useState<number>(DRAWER_SNAP_Y.mid);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startSheetY: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("map");
  const [mobileListSnap, setMobileListSnap] = useState<MobileListSnap>("peek");
  const [mobileSheetY, setMobileSheetY] = useState<number>(MOBILE_LIST_SNAP_Y.peek);
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const mobileDragRef = useRef<{ startY: number; startSheetY: number } | null>(null);
  const mobileDetailDragRef = useRef<{ startY: number } | null>(null);

  const [selectedGeojson, setSelectedGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const [riverLinesGeojson, setRiverLinesGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [openTopPanel, setOpenTopPanel] = useState<TopPanel>("none");
  const [transparencyOpen, setTransparencyOpen] = useState(false);
  const [detailMetricsOpen, setDetailMetricsOpen] = useState(false);
  const [mobileDetailMetricsOpen, setMobileDetailMetricsOpen] = useState(false);
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
  const selectedFishIndex = useMemo(
    () => getFishabilityIndex(selected?.fishability_score_calc ?? null),
    [selected]
  );
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

  function setMobileSurfaceState(next: MobileSurface, opts?: { listSnap?: MobileListSnap }) {
    setOpenTopPanel("none");
    setTransparencyOpen(false);
    if (next === "list" && opts?.listSnap) {
      setMobileListSnap(opts.listSnap);
      setMobileSheetY(MOBILE_LIST_SNAP_Y[opts.listSnap]);
    }
    setMobileSurface(next);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      if (mobile) {
        setMobileSurface((prev) => {
          if (prev === "map") {
            setMobileListSnap("peek");
            setMobileSheetY(MOBILE_LIST_SNAP_Y.peek);
            return "list";
          }
          return prev;
        });
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (selected) {
      setDetailMetricsOpen(false);
      setMobileDetailMetricsOpen(false);
      if (isMobile) {
        setMobileSurfaceState("detail");
        return;
      }
      setOpenTopPanel((prev) => (prev === "layers" ? prev : "detail"));
      return;
    }
    if (isMobile && mobileSurface === "detail") {
      setMobileSurfaceState("list", { listSnap: "peek" });
    }
    if (openTopPanel === "detail") {
      setOpenTopPanel("none");
    }
    setTransparencyOpen(false);
  }, [selected, openTopPanel, isMobile, mobileSurface]);

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

    const bounds = new mapboxgl.LngLatBounds();
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
    if (isMobile) {
      setMobileSurfaceState(panel === "layers" ? "tools" : panel === "detail" ? "detail" : "list");
      return;
    }
    setOpenTopPanel((prev) => (prev === panel ? "none" : panel));
  }

  function selectRiver(riverId: string | null) {
    setSelectedId(riverId);
    if (riverId) {
      setSelectionSeq((prev) => prev + 1);
      if (isMobile) {
        setMobileSurfaceState("detail");
      } else {
        setOpenTopPanel("detail");
      }
    }
  }

  function onMobileListPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;
    mobileDragRef.current = { startY: y, startSheetY: mobileSheetY };
    setIsMobileDragging(true);
    document.body.style.userSelect = "none";

    const onMove = (e2: PointerEvent | TouchEvent) => {
      const y2 =
        "touches" in e2
          ? (e2 as TouchEvent).touches[0]?.clientY
          : (e2 as PointerEvent).clientY;
      if (y2 == null || !mobileDragRef.current) return;
      const dy = y2 - mobileDragRef.current.startY;
      setMobileSheetY(clamp(mobileDragRef.current.startSheetY + dy / 420, 0, 1));
    };

    const onUp = () => {
      mobileDragRef.current = null;
      setIsMobileDragging(false);
      document.body.style.userSelect = "";
      setMobileSheetY((current) => {
        const snaps: MobileListSnap[] = ["full", "mid", "peek"];
        const nearest = snaps.reduce(
          (best, next) =>
            Math.abs(current - MOBILE_LIST_SNAP_Y[next]) < Math.abs(current - MOBILE_LIST_SNAP_Y[best])
              ? next
              : best,
          "mid" as MobileListSnap
        );
        setMobileListSnap(nearest);
        return MOBILE_LIST_SNAP_Y[nearest];
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

  function onMobileDetailPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;
    mobileDetailDragRef.current = { startY: y };
    document.body.style.userSelect = "none";

    const onMove = (_: PointerEvent | TouchEvent) => {
      // no-op; we only need swipe distance on release
    };

    const onUp = (e2: PointerEvent | TouchEvent) => {
      const y2 =
        "changedTouches" in e2
          ? (e2 as TouchEvent).changedTouches[0]?.clientY
          : (e2 as PointerEvent).clientY;
      const start = mobileDetailDragRef.current?.startY ?? 0;
      const dy = (y2 ?? start) - start;
      mobileDetailDragRef.current = null;
      document.body.style.userSelect = "";
      if (dy > 90) {
        setMobileSurfaceState("list", { listSnap: "peek" });
      }
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

  const layersOpen = !isMobile && openTopPanel === "layers";
  const detailsOpen = !isMobile && openTopPanel === "detail";

  useEffect(() => {
    if (!isMobile && detailsOpen && drawerSnap !== "collapsed") {
      setDrawerSnap("collapsed");
      setSheetY(DRAWER_SNAP_Y.collapsed);
    }
  }, [detailsOpen, drawerSnap, isMobile]);

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
          activeStationsGeojson={stationGeojson ?? null}
          basemap={basemap}
          layerState={layerState}
          rightPanelOpen={detailsOpen}
          drawerState={isMobile ? "collapsed" : drawerSnap}
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

      <header className="absolute left-4 right-4 top-4 z-20 sm:hidden">
        <div className="onx-glass rounded-xl px-3 py-2">
          <div className="text-[11px] font-medium text-white/84">{dateLabel}</div>
          <div className="text-[10px] text-white/52">Last pull {formatPullTime(latestPullAt)} MT</div>
        </div>
      </header>

      <header className="absolute left-4 right-4 top-4 z-20 hidden sm:block sm:left-[108px] sm:right-[340px]">
        <div className="onx-glass rounded-2xl px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="hidden shrink-0 text-xs font-medium text-white/84 sm:block">
              {dateLabel} • {filtered.length} rivers
            </div>
            <div className="hidden shrink-0 text-[11px] text-white/52 lg:block">
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
              className="rounded-md px-2 py-1 text-xs text-white/66 hover:text-white/92"
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

      <div className="absolute right-4 top-4 z-30 hidden items-start gap-2 sm:flex">
        <button
          className={`onx-iconbtn ${layersOpen ? "ring-2 ring-white/20" : ""}`}
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
                    className="text-[11px] font-medium text-[var(--mri-text-dim)] hover:text-[var(--mri-text-muted)]"
                    onClick={resetLayers}
                  >
                    Reset
                  </button>
                  <button
                    className="text-[11px] font-medium text-[var(--mri-text-dim)] hover:text-[var(--mri-text-muted)]"
                    onClick={() => setOpenTopPanel("none")}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
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
                          ? "border-[var(--mri-border-strong)] bg-[rgba(78,122,146,0.3)] text-[var(--mri-text)]"
                          : "border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] text-[var(--mri-text-muted)]",
                        !option.enabled ? "cursor-not-allowed opacity-55" : "hover:bg-[rgba(26,37,43,0.82)]",
                      ].join(" ")}
                      onClick={() => setBasemapStyle(option.id)}
                    >
                      <div>{option.label}</div>
                      {!option.enabled && option.comingSoon ? (
                        <div className="text-[10px] text-[var(--mri-text-dim)]">Coming soon</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                  Core Layers
                </div>
                <div className="mt-2 space-y-2 rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] p-2.5 text-xs text-[var(--mri-text-muted)]">
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
                  className="w-full rounded-lg border border-[var(--mri-border)] bg-[rgba(20,29,32,0.72)] px-2.5 py-2 text-left text-xs font-medium text-[var(--mri-text)] hover:bg-[rgba(26,37,43,0.82)]"
                  onClick={() => setAdvancedLayersOpen((v) => !v)}
                >
                  {advancedLayersOpen ? "Hide Advanced Layers" : "Advanced Layers"}
                </button>
              </div>

              {advancedLayersOpen
                ? groupedLayers.map(({ group, layers }) => (
                    <div key={group} className="mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                        {group}
                      </div>
                      <div className="mt-2 space-y-2 rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] p-2.5 text-xs text-[var(--mri-text-muted)]">
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
                                  <span className="text-[10px] text-[var(--mri-text-dim)]">{layer.minZoomNote}</span>
                                ) : null}
                                {layer.comingSoon ? (
                                  <span className="text-[10px] text-[var(--mri-text-dim)]">Coming soon</span>
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

      <div
        className={[
          "absolute bottom-6 right-4 z-20 flex flex-col gap-2 sm:hidden",
          mobileSurface === "detail" || mobileSurface === "tools" ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
      >
        <button
          className="onx-glass min-h-11 rounded-xl px-3 text-xs font-semibold text-white active:translate-y-[1px]"
          onClick={() => setMobileSurfaceState(mobileSurface === "tools" ? "list" : "tools")}
        >
          Map Tools
        </button>
        <button
          className="onx-glass min-h-11 rounded-xl px-3 text-xs font-semibold text-white active:translate-y-[1px]"
          onClick={() => setMobileSurfaceState(mobileSurface === "list" ? "map" : "list", { listSnap: "mid" })}
        >
          Rivers
        </button>
      </div>

      <section className="absolute right-4 top-[118px] z-20 hidden w-[314px] sm:block">
        {detailsOpen ? (
          <div className="onx-card rounded-3xl p-6 transition-all duration-150 ease-in-out">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--mri-text-dim)]">
                River Detail
              </div>
              <button
                className="text-[11px] text-[var(--mri-text-dim)] hover:text-[var(--mri-text-muted)]"
                onClick={() => setOpenTopPanel("none")}
              >
                Collapse
              </button>
            </div>

            {selected ? (
              <>
                <div className="mt-3 space-y-5">
                  <div>
                    <div className="text-[18px] font-semibold text-[var(--mri-text)]">{selected.river_name}</div>
                    <div className="mt-1 text-xs text-[var(--mri-text-muted)]">{selected.gauge_label ?? ""}</div>
                    <div className="mt-1 text-[11px] text-[var(--mri-text-dim)]">
                      {formatUpdatedAgo(selected.source_flow_observed_at ?? selected.source_temp_observed_at ?? selected.updated_at)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[56px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
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
                  </div>

                  <div className="text-[12px] leading-5 text-[var(--mri-text-muted)]">
                    <span className="font-medium text-[var(--mri-text)]">Today&apos;s Read:</span> {todaysRead}
                  </div>

                  <div className="rounded-xl border border-[var(--mri-border)] bg-[rgba(23,34,40,0.64)] p-3">
                    <div className="flex items-end justify-between">
                      <div className="text-[36px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
                        {selectedFishIndex.value}
                        <span className="ml-1 text-[26px] font-medium text-[var(--mri-text-dim)]">/ 10.0</span>
                      </div>
                      {selectedFishIndex.optimal ? (
                        <span className="rounded border border-[rgba(173,190,202,0.32)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--mri-text-muted)]">
                          Optimal
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <div className="mri-fish-scale-track">
                        <div className="mri-fish-scale-fill" style={{ width: `${selectedFishIndex.percent}%` }} />
                        {selectedFishIndex.normalized != null ? (
                          <div className="mri-fish-scale-marker" style={{ left: `${selectedFishIndex.percent}%` }} />
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-4 text-[10px] uppercase tracking-[0.1em] text-[var(--mri-text-dim)]">
                        <span>Poor</span>
                        <span className="text-center">Fair</span>
                        <span className="text-center">Good</span>
                        <span className="text-right">Excellent</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-[var(--mri-border)] pt-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--mri-text-dim)]">Flow</div>
                      <div className="mt-0.5 text-base font-medium text-[var(--mri-text)]">
                        {selected.flow_cfs ?? "Flow not available at this gauge"}
                        <span className="ml-1 text-xs text-[var(--mri-text-dim)]">
                          {getFlowTrendArrow(selected.change_48h_pct_calc)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--mri-text-dim)]">Temp</div>
                      <div className="mt-0.5 text-base font-medium text-[var(--mri-text)]">
                        {selected.water_temp_f != null
                          ? `${Number(selected.water_temp_f).toFixed(1)}°F`
                          : "Temp not available at this gauge"}
                      </div>
                    </div>
                  </div>

                  <button
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => setDetailMetricsOpen((v) => !v)}
                  >
                    {detailMetricsOpen ? "Hide Detailed Metrics" : "Detailed Metrics"}
                  </button>

                  {detailMetricsOpen ? (
                    <div className="space-y-4 border-t border-[var(--mri-border)] pt-4 text-xs text-[var(--mri-text-muted)]">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span
                          className={[
                            "rounded-full border px-2 py-0.5",
                            selected.temp_status === "available_fresh"
                              ? "border-[rgba(110,150,125,0.4)] bg-[rgba(79,103,87,0.2)] text-[#b4ccb9]"
                              : selected.temp_status === "available_stale"
                              ? "border-[rgba(176,112,63,0.42)] bg-[rgba(176,112,63,0.2)] text-[#d7b089]"
                              : "border-[var(--mri-border)] bg-[rgba(21,31,35,0.7)] text-[var(--mri-text-dim)]",
                          ].join(" ")}
                        >
                          {getTempStatusLabel(selected)}
                        </span>
                        <span className="text-[var(--mri-text-dim)]">{getTempSourceLabel(selected)}</span>
                      </div>

                      {flags.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {flags.map((flag) => (
                            <span
                              key={flag}
                              className="rounded-full border border-[var(--mri-border)] bg-[rgba(21,31,35,0.7)] px-2 py-0.5 text-[10px] font-medium text-[var(--mri-text-dim)]"
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="space-y-2 text-[11px] text-[var(--mri-text-dim)]">
                        <div>
                          {selected.fishability_rank != null && filtered.length > 0
                            ? `Rank ${selected.fishability_rank} / ${filtered.length}`
                            : "Rank unavailable"}
                        </div>
                        <div>
                          {selected.fishability_percentile != null
                            ? `Top ${Math.max(1, Math.round(100 - Number(selected.fishability_percentile)))}%`
                            : "Percentile unavailable"}
                        </div>
                        <div>
                          Stability:{" "}
                          {selected.change_48h_pct_calc == null
                            ? "—"
                            : `${Number(selected.change_48h_pct_calc).toFixed(1)}% 48h`}
                        </div>
                        <div>
                          Ratio: {selected.flow_ratio_calc != null ? `${Number(selected.flow_ratio_calc).toFixed(2)}x` : "—"}
                        </div>
                        <div>Hatch likelihood: {hatchLikelihood}</div>
                        <div>Wind AM {selected.wind_am_mph ?? "—"} • PM {selected.wind_pm_mph ?? "—"}</div>
                      </div>

                      <div className="text-[11px] text-[var(--mri-text-dim)]">
                        Flow source:{" "}
                        {selected.source_flow_observed_at
                          ? `${formatPullTime(selected.source_flow_observed_at)} MT`
                          : "Flow not available at this gauge"}
                      </div>
                      <div className="text-[11px] text-[var(--mri-text-dim)]">
                        Temp source: {getTempSourceLabel(selected)}
                        {selected.source_temp_observed_at ? ` • ${formatPullTime(selected.source_temp_observed_at)} MT` : ""}
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                          Water Temp Window (24h)
                        </div>
                        {intradayLoading ? (
                          <div className="mt-2 text-xs text-[var(--mri-text-dim)]">Loading intraday thermal...</div>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            <div className="text-xs text-[var(--mri-text-muted)]">{thermalSummary.windowLabel}</div>
                            <Sparkline
                              className="h-12 w-full"
                              stroke="#6b7280"
                              values={intradayRows.map((x) => x.water_temp_f)}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                          Trend (14D)
                        </div>
                        {historyLoading ? (
                          <div className="mt-2 text-xs text-[var(--mri-text-dim)]">Loading trend...</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <Sparkline
                              className="h-12 w-full"
                              stroke={MRI_COLORS.riverSelected}
                              values={historyRows.slice().reverse().map((x) => x.flow_cfs)}
                            />
                            <Sparkline
                              className="h-12 w-full"
                              stroke="#6b7280"
                              values={historyRows.slice().reverse().map((x) => x.water_temp_f)}
                            />
                            <Sparkline
                              className="h-12 w-full"
                              stroke={MRI_COLORS.good}
                              values={historyRows.slice().reverse().map((x) => x.fishability_score)}
                            />
                          </div>
                        )}
                      </div>

                      <button
                        className="w-full rounded-lg border border-[var(--mri-border)] bg-[rgba(21,31,35,0.74)] px-2 py-1.5 text-left text-xs font-medium text-[var(--mri-text)] hover:bg-[rgba(26,37,43,0.82)]"
                        onClick={() => setTransparencyOpen((v) => !v)}
                      >
                        How this score is calculated
                      </button>

                      {transparencyOpen && breakdown ? (
                        <div className="rounded-lg bg-[rgba(21,31,35,0.66)] p-2 text-[11px] text-[var(--mri-text-muted)]">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <div>Flow Score</div>
                            <div className="text-right font-semibold">{formatNum(breakdown.flowScore)}</div>
                            <div>Stability Score</div>
                            <div className="text-right font-semibold">{formatNum(breakdown.stabilityScore)}</div>
                            <div>Thermal Score</div>
                            <div className="text-right font-semibold">
                              {breakdown.thermalScore == null ? "Unavailable" : formatNum(breakdown.thermalScore)}
                            </div>
                            <div>Wind Penalty</div>
                            <div className="text-right font-semibold">{formatNum(breakdown.windPenalty)}</div>
                            <div className="border-t border-[var(--mri-border)] pt-1 font-semibold text-[var(--mri-text)]">Total Score</div>
                            <div className="border-t border-[var(--mri-border)] pt-1 text-right font-semibold text-[var(--mri-text)]">
                              {formatNum(breakdown.totalScore)}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-sm font-semibold text-[var(--mri-text)]">Montana River Intel</div>
                <div className="text-xs text-[var(--mri-text-muted)]">
                  Tap a river in the list to preview details here.
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            className="onx-glass rounded-xl px-3 py-2 text-xs font-medium text-white/90 transition-colors duration-150 ease-in-out hover:text-white active:translate-y-[1px]"
            onClick={() => setOpenTopPanel("detail")}
          >
            Details
          </button>
        )}
      </section>

      {isMobile && mobileSurface === "tools" ? (
        <section className="absolute inset-0 z-30 sm:hidden">
          <button
            className="absolute inset-0 bg-black/45"
            aria-label="Close map tools"
            onClick={() => setMobileSurfaceState("list", { listSnap: "peek" })}
          />
          <div className="onx-card absolute inset-x-0 bottom-0 rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-150 ease-in-out">
            <div className="mx-auto mb-3 h-1.5 w-14 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35" style={{ touchAction: "none" }} />
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--mri-text)]">Map Tools</div>
              <button className="rounded-md p-2 text-[var(--mri-text-muted)]" onClick={() => setMobileSurfaceState("list", { listSnap: "peek" })}>
                <X size={18} />
              </button>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">Basemap</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {BASEMAP_OPTIONS.map((option) => (
                <button
                  key={`m-${option.id}`}
                  disabled={!option.enabled}
                  className={[
                    "min-h-11 rounded-lg border px-2 py-1.5 text-xs font-medium",
                    basemap === option.id
                      ? "border-[var(--mri-border-strong)] bg-[rgba(78,122,146,0.3)] text-[var(--mri-text)]"
                      : "border-[var(--mri-border)] bg-[rgba(20,29,32,0.72)] text-[var(--mri-text-muted)]",
                    !option.enabled ? "cursor-not-allowed opacity-55" : "",
                  ].join(" ")}
                  onClick={() => setBasemapStyle(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">Core Layers</div>
            <div className="mt-2 space-y-2 rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] p-3 text-xs text-[var(--mri-text-muted)]">
              {groupedLayers
                .flatMap((g) => g.layers)
                .filter((layer) => layer.id === "mri_river_lines" || layer.id === "mri_selected_highlight")
                .map((layer) => (
                  <label key={`ml-${layer.id}`} className="flex items-center justify-between">
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
        </section>
      ) : null}

      {isMobile && mobileSurface === "detail" ? (
        <section className="absolute inset-0 z-20 bg-black/45 sm:hidden">
          <div className="onx-card absolute inset-x-0 bottom-0 max-h-[92vh] overflow-auto rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-150 ease-in-out">
            <div
              className="mx-auto mb-2 h-1.5 w-14 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35"
              onPointerDown={onMobileDetailPointerDown}
              onTouchStart={onMobileDetailPointerDown}
              style={{ touchAction: "none" }}
            />
            <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">River Detail</div>
              <button
                className="min-h-11 rounded-md px-3 text-xs font-semibold text-slate-600"
                onClick={() => setMobileSurfaceState("list", { listSnap: "peek" })}
              >
                Close
              </button>
            </div>
            {selected ? (
              <>
                <div className="text-xl font-semibold text-[var(--mri-text)]">{selected.river_name}</div>
                <div className="text-sm text-[var(--mri-text-muted)]">{selected.gauge_label ?? ""}</div>
                <div className="mt-1 text-xs text-[var(--mri-text-dim)]">
                  {formatUpdatedAgo(selected.source_flow_observed_at ?? selected.source_temp_observed_at ?? selected.updated_at)}
                </div>
                <div className="mt-2">
                  <span
                    className={[
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      selected.temp_status === "available_fresh"
                        ? "border-[rgba(110,150,125,0.4)] bg-[rgba(79,103,87,0.2)] text-[#b4ccb9]"
                        : selected.temp_status === "available_stale"
                        ? "border-[rgba(176,112,63,0.42)] bg-[rgba(176,112,63,0.2)] text-[#d7b089]"
                        : "border-[var(--mri-border)] bg-[rgba(21,31,35,0.7)] text-[var(--mri-text-dim)]",
                    ].join(" ")}
                  >
                    {getTempStatusLabel(selected)}
                  </span>
                </div>
                <div className="mt-4 text-[56px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
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
                <div className="mt-2 text-xs text-[var(--mri-text-muted)]">{todaysRead}</div>

                <div className="mt-3 rounded-xl border border-[var(--mri-border)] bg-[rgba(23,34,40,0.64)] p-3">
                  <div className="flex items-end justify-between">
                    <div className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
                      {selectedFishIndex.value}
                      <span className="ml-1 text-[22px] font-medium text-[var(--mri-text-dim)]">/ 10.0</span>
                    </div>
                    {selectedFishIndex.optimal ? (
                      <span className="rounded border border-[rgba(173,190,202,0.32)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--mri-text-muted)]">
                        Optimal
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <div className="mri-fish-scale-track">
                      <div className="mri-fish-scale-fill" style={{ width: `${selectedFishIndex.percent}%` }} />
                      {selectedFishIndex.normalized != null ? (
                        <div className="mri-fish-scale-marker" style={{ left: `${selectedFishIndex.percent}%` }} />
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-4 text-[10px] uppercase tracking-[0.1em] text-[var(--mri-text-dim)]">
                      <span>Poor</span>
                      <span className="text-center">Fair</span>
                      <span className="text-center">Good</span>
                      <span className="text-right">Excellent</span>
                    </div>
                  </div>
                </div>

                <div className="my-4 h-px bg-[var(--mri-border)]" />
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--mri-text-dim)]">Flow</div>
                    <div className="font-medium text-[var(--mri-text)]">
                      {selected.flow_cfs ?? "Flow not available at this gauge"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--mri-text-dim)]">Temp</div>
                    <div className="font-medium text-[var(--mri-text)]">
                      {selected.water_temp_f != null
                        ? `${Number(selected.water_temp_f).toFixed(1)}°F`
                        : "Temp not available at this gauge"}
                    </div>
                  </div>
                </div>

                <button
                  className="mt-4 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-left text-xs font-medium text-white/85"
                  onClick={() => setMobileDetailMetricsOpen((v) => !v)}
                >
                  {mobileDetailMetricsOpen ? "Hide Detailed Metrics" : "Detailed Metrics"}
                </button>

                {mobileDetailMetricsOpen ? (
                  <div className="mt-4 space-y-3 border-t border-[var(--mri-border)] pt-4 text-xs text-[var(--mri-text-muted)]">
                    <div>{getTempStatusLabel(selected)}</div>
                    <div>{getTempSourceLabel(selected)}</div>
                    <div>
                      Ratio: {selected.flow_ratio_calc != null ? `${Number(selected.flow_ratio_calc).toFixed(2)}x` : "—"}
                    </div>
                    <div>
                      Stability: {selected.change_48h_pct_calc == null ? "—" : `${Number(selected.change_48h_pct_calc).toFixed(1)}%`}
                    </div>
                    <div>
                      Rank:{" "}
                      {selected.fishability_rank != null && filtered.length > 0
                        ? `${selected.fishability_rank} / ${filtered.length}`
                        : "Unavailable"}
                    </div>
                    {flags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {flags.map((flag) => (
                          <span
                            key={`mf-${flag}`}
                            className="rounded-full border border-[var(--mri-border)] bg-[rgba(20,29,32,0.72)] px-2 py-0.5 text-[10px] font-medium text-[var(--mri-text-dim)]"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-[var(--mri-text-muted)]">Select a river to view details.</div>
            )}
          </div>
        </section>
      ) : null}

      {isMobile && mobileSurface === "list" ? (
        <section
          className="absolute inset-x-0 bottom-0 z-10 sm:hidden"
          style={{
            transform: `translateY(${mobileSheetY * 92}%)`,
            transition: isMobileDragging ? "none" : SNAP_TRANSITION,
          }}
        >
          <div className="rounded-t-3xl border border-white/10 bg-[#0b1220]/94 backdrop-blur-md">
            <div
              className={`mx-auto mt-2 h-1.5 w-14 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35 ${isMobileDragging ? "select-none" : ""}`}
              onPointerDown={onMobileListPointerDown}
              onTouchStart={onMobileListPointerDown}
              style={{ touchAction: "none" }}
            />
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="text-sm font-semibold text-white">Rivers ({filtered.length})</div>
              <button
                className="min-h-11 rounded-md px-3 text-xs font-semibold text-white/80"
                onClick={() => {
                  if (mobileListSnap === "peek") {
                    setMobileListSnap("mid");
                    setMobileSheetY(MOBILE_LIST_SNAP_Y.mid);
                  } else {
                    setMobileListSnap("peek");
                    setMobileSheetY(MOBILE_LIST_SNAP_Y.peek);
                  }
                }}
              >
                {mobileListSnap === "peek" ? "Expand" : "Peek"}
              </button>
            </div>
            <div className="px-4 pt-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rivers..."
                className="mri-topbar-input"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
                  <button key={`m-tier-${t}`} onClick={() => setTier(t)} className={`mri-chip min-h-11 ${tier === t ? "mri-chip-active" : ""}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`mri-scroll max-h-[65vh] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 ${
                mobileListSnap === "full" ? "overflow-auto" : "overflow-hidden"
              }`}
            >
              {topRivers.length > 0 ? (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">Top Rivers Today</div>
                  <div className="mb-3 flex gap-2 overflow-auto">
                    {topRivers.map((r) => (
                      <button
                        key={`m-top-${r.river_id}`}
                        onClick={() => selectRiver(r.river_id)}
                        className={[
                          "min-h-11 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs active:translate-y-[1px]",
                          r.river_id === selectedId
                            ? "border-white/50 bg-white/20 text-white"
                            : "border-white/20 bg-white/10 text-white/85",
                        ].join(" ")}
                      >
                        #{r.fishability_rank ?? "—"} {r.river_name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                {filtered.map((r) => (
                  <button
                    key={`m-r-${r.river_id}`}
                    onClick={() => selectRiver(r.river_id)}
                    className={`mri-drawer-card w-full text-left active:translate-y-[1px] ${r.river_id === selectedId ? "mri-drawer-card-selected" : ""}`}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{r.river_name}</div>
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
                        <div><div className="mri-kv-label">Score</div><div className="font-semibold">{r.fishability_score_calc ?? "—"}</div></div>
                        <div><div className="mri-kv-label">Flow</div><div className="font-semibold">{r.flow_cfs ?? "—"}</div></div>
                        <div><div className="mri-kv-label">Temp</div><div className="font-semibold">{r.water_temp_f != null ? `${Number(r.water_temp_f).toFixed(1)}°` : "—"}</div></div>
                      </div>
                      {r.temp_status === "available_stale" ? (
                        <div className="mt-1 text-[10px] text-amber-300">Temp stale</div>
                      ) : r.temp_status === "unavailable_at_gauge" ? (
                        <div className="mt-1 text-[10px] text-white/60">No temp at this gauge</div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div
        className="absolute bottom-0 left-0 right-0 z-10 hidden sm:block"
        style={{
          transform: `translateY(${sheetY * 78}%)`,
          transition: isDragging ? "none" : SNAP_TRANSITION,
        }}
      >
        <div className={`mx-auto max-w-6xl px-3 pb-3 ${detailsOpen ? "sm:pr-[340px]" : ""}`}>
          <div className="onx-glass overflow-hidden rounded-3xl">
            <div
              className={`mx-auto mt-2 h-1.5 w-14 flex-shrink-0 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35 active:cursor-grabbing ${isDragging ? "select-none" : ""}`}
              onPointerDown={onSheetPointerDown}
              onTouchStart={onSheetPointerDown}
              title="Drag to expand/collapse"
              style={{ touchAction: "none" }}
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
                        "min-h-11 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition active:translate-y-[1px]",
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
                className={`mri-scroll pr-1 transition-[max-height] duration-200 ease-in-out ${
                  drawerSnap === "expanded" ? "overflow-auto" : "overflow-hidden"
                }`}
                style={{
                  maxHeight: drawerSnap === "expanded" ? "65vh" : drawerSnap === "mid" ? "40vh" : "80px",
                }}
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((r) => (
                    <button
                      key={r.river_id}
                      onClick={() => selectRiver(r.river_id)}
                      className={`mri-drawer-card text-left active:translate-y-[1px] ${r.river_id === selectedId ? "mri-drawer-card-selected" : ""}`}
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
                        {r.temp_status === "available_stale" ? (
                          <div className="mt-1 text-[10px] text-amber-300">Temp stale</div>
                        ) : r.temp_status === "unavailable_at_gauge" ? (
                          <div className="mt-1 text-[10px] text-white/60">No temp at this gauge</div>
                        ) : null}
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
