"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Plus, Minus, Maximize2, Crosshair, Type, Layers, List } from "lucide-react";
import { MapView } from "@/components/MapView";
import { fetchRiverGeom } from "@/lib/supabase";
import { fetchRiverGeojsonBrowser } from "@/lib/supabaseBrowser";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import type { FishabilityRow } from "@/lib/types";

type River = FishabilityRow;

function styleForBasemap(b: "voyager" | "dark" | "satellite"): string {
  if (b === "dark") return "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  if (b === "satellite") {
    const k = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    return k
      ? `https://api.maptiler.com/maps/satellite/style.json?key=${k}`
      : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  }
  return "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
}

function TierPill({ tier }: { tier?: string }) {
  const cls =
    tier === "Good" || tier === "HOT" || tier === "GOOD"
      ? "bg-green-500"
      : tier === "Fair" || tier === "FAIR"
      ? "bg-yellow-500"
      : "bg-slate-400";
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
      <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
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
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"All" | "Good" | "Fair" | "Tough">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetY, setSheetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startSheetY: number } | null>(null);
  const [selectedGeojson, setSelectedGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
  }
  function onSheetPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;
    dragRef.current = { startY: y, startSheetY: sheetY };
    setIsDragging(true);

    const onMove = (e2: PointerEvent | TouchEvent) => {
      const y2 = "touches" in e2 ? (e2 as TouchEvent).touches[0]?.clientY : (e2 as PointerEvent).clientY;
      if (y2 == null || !dragRef.current) return;
      const dy = y2 - dragRef.current.startY;
      const next = clamp(dragRef.current.startSheetY + dy / 320, 0, 1);
      setSheetY(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsDragging(false);
      setSheetY((current) => {
        const snap = current > 0.45 ? 1 : 0;
        setSheetOpen(snap === 0);
        return snap;
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
  const [labelsOn, setLabelsOn] = useState(true);
  const [basemap, setBasemap] = useState<"voyager" | "dark" | "satellite">("voyager");

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
        const matchesTier = tier === "All" || displayTier === tier;
        return matchesSearch && matchesTier;
      })
      .sort(
        (a, b) =>
          (b.fishability_score_calc ?? -999) - (a.fishability_score_calc ?? -999)
      );
  }, [rivers, search, tier]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!selectedId) {
        setSelectedGeojson(null);
        return;
      }
      const river = filtered.find((r) => r.river_id === selectedId) ?? rivers.find((r) => r.river_id === selectedId);
      const key = river?.slug ?? river?.river_id ?? selectedId;

      const gj = await fetchRiverGeojsonBrowser(key);
      if (cancelled) return;
      if (gj) {
        setSelectedGeojson(gj);
        return;
      }
      const geom = await fetchRiverGeom(selectedId);
      if (cancelled) return;
      setSelectedGeojson(geom ? { type: "Feature", geometry: geom, properties: { river_id: selectedId } } as GeoJSON.Feature : null);
    }

    run().catch((e) => {
      if (!cancelled) {
        console.warn("[geojson] rpc failed:", e);
        setSelectedGeojson(null);
      }
    });
    return () => { cancelled = true; };
  }, [selectedId, filtered, rivers]);

  const selected = useMemo(() => {
    if (selectedId == null) return null;
    return (
      filtered.find((r) => r.river_id === selectedId) ??
      (rivers ?? []).find((r) => r.river_id === selectedId) ??
      null
    );
  }, [filtered, rivers, selectedId]);

  function zoomIn() {
    mapRef.current?.zoomIn?.({ duration: 180 });
  }
  function zoomOut() {
    mapRef.current?.zoomOut?.({ duration: 180 });
  }
  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo?.({ center: [-110.9, 46.9], zoom: 5.2, duration: 450, essential: true });
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
        lat != null && lng != null
          ? [lng, lat]
          : RIVER_FOCUS_POINTS[r.river_id];
      if (coords) {
        bounds.extend(coords);
        hasAny = true;
      }
    }
    if (hasAny && !bounds.isEmpty()) {
      map.fitBounds?.(bounds, { padding: 60, duration: 450, essential: true });
    }
  }
  function toggleBasemap() {
    const map = mapRef.current;
    const next = basemap === "voyager" ? "dark" : basemap === "dark" ? "satellite" : "voyager";
    setBasemap(next);
    if (!map) return;

    const center = map.getCenter?.();
    const zoom = map.getZoom?.();
    const bearing = map.getBearing?.();
    const pitch = map.getPitch?.();

    const styleUrl = styleForBasemap(next);

    try {
      map.setStyle(styleUrl);
      map.once("load", () => {
        try {
          if (center) map.setCenter(center);
          if (zoom != null) map.setZoom(zoom);
          if (bearing != null) map.setBearing(bearing);
          if (pitch != null) map.setPitch(pitch);
        } catch { /* ignore */ }
        map.resize?.();
      });
    } catch (e) {
      console.error("[basemap] setStyle failed", e);
    }
  }

  function toggleLabels() {
    const map = mapRef.current;
    if (!map) return;
    const next = !labelsOn;
    setLabelsOn(next);
    const visibility = next ? "visible" : "none";
    const style = map.getStyle?.();
    const layers = style?.layers ?? [];
    for (const layer of layers) {
      if (!layer?.id) continue;
      if (
        layer.id.toLowerCase().includes("label") ||
        layer.id.toLowerCase().includes("place") ||
        layer.id.toLowerCase().includes("poi")
      ) {
        try {
          map.setLayoutProperty(layer.id, "visibility", visibility);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
      {/* MAP */}
      <div className="absolute inset-0">
        <MapView
          rivers={filtered}
          selectedRiver={selected}
          selectedRiverId={selectedId}
          selectedRiverGeojson={selectedGeojson}
          onSelectRiver={(r) => setSelectedId(r.river_id)}
          className="absolute inset-0"
          initialStyleUrl={styleForBasemap(basemap)}
          onMapReady={(m) => (mapRef.current = m)}
        />
      </div>

      {/* LEFT RAIL (onX-like) */}
      <div className="absolute left-3 top-3 z-30 hidden sm:block">
        <div className="onx-glass rounded-2xl overflow-hidden w-[84px]">
          <div className="px-3 py-3 border-b border-white/10">
            <div className="text-white font-semibold text-sm leading-tight">
              MRI
            </div>
            <div className="text-white/70 text-[10px] leading-tight">
              Montana
            </div>
          </div>

          <div className="p-2 flex flex-col gap-2">
            <button className="onx-iconbtn" title="Map">
              🗺️
            </button>
            <button className="onx-iconbtn" title="Rivers">
              🎣
            </button>
            <button className="onx-iconbtn" title="Reports">
              📄
            </button>
            <button className="onx-iconbtn" title="Settings">
              ⚙️
            </button>
          </div>
        </div>
      </div>

      {/* TOP SEARCH BAR */}
      <div className="absolute left-3 right-3 top-3 z-30 sm:left-[108px] sm:right-[240px]">
        <div className="onx-glass rounded-2xl px-3 py-2 flex items-center gap-2">
          <div className="hidden sm:block text-white/80 text-xs font-semibold">
            {dateLabel} • {filtered.length} rivers
          </div>

          <div className="flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rivers..."
              className="w-full bg-transparent text-sm text-white placeholder:text-white/60 outline-none"
            />
          </div>

          <button
            className="text-xs text-white/80 hover:text-white px-2 py-1 rounded-lg"
            onClick={() => {
              setSearch("");
              setTier("All");
              setSelectedId(null);
            }}
          >
            Reset
          </button>
        </div>

        {/* FILTER CHIPS */}
        <div className="mt-2 flex flex-wrap gap-2">
          {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={[
                "h-9 px-3 rounded-full text-sm font-medium border backdrop-blur",
                tier === t
                  ? "bg-white/90 border-slate-200 text-slate-900"
                  : "bg-slate-900/50 border-white/20 text-white hover:bg-slate-900/60",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT TOOL STACK */}
      <div className="absolute right-3 top-3 z-30 hidden sm:flex flex-col gap-2">
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
        <button className="onx-iconbtn" title="Toggle labels" onClick={toggleLabels}>
          <Type size={18} strokeWidth={2.5} className={!labelsOn ? "opacity-50" : ""} />
        </button>
        <button className="onx-iconbtn" title="Toggle basemap" onClick={toggleBasemap}>
          <Layers size={18} strokeWidth={2.5} />
        </button>
        <button
          className="onx-iconbtn"
          title="Toggle list"
          onClick={() => {
            const next = !sheetOpen;
            setSheetOpen(next);
            setSheetY(next ? 0 : 1);
          }}
        >
          <List size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* DETAILS PANEL (right) */}
      <div className="absolute right-3 top-[120px] z-30 hidden sm:block w-[224px]">
        <div className="onx-card rounded-2xl p-3 shadow-xl">
          {selected ? (
            <>
              <div className="text-sm font-semibold text-slate-900">
                {selected.river_name}
              </div>
              <div className="text-xs text-slate-600">
                {selected.gauge_label ?? ""}
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

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-slate-500">Score</div>
                  <div className="font-semibold text-slate-900">
                    {selected.fishability_score_calc ?? "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-slate-500">Flow</div>
                  <div className="font-semibold text-slate-900">
                    {selected.flow_cfs ?? "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-slate-500">Temp</div>
                  <div className="font-semibold text-slate-900">
                    {selected.water_temp_f != null
                      ? `${Number(selected.water_temp_f).toFixed(1)}°F`
                      : "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-slate-500">Ratio</div>
                  <div className="font-semibold text-slate-900">
                    {selected.flow_ratio_calc != null
                      ? `${Number(selected.flow_ratio_calc).toFixed(2)}x`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-slate-600">
                Wind AM {selected.wind_am_mph ?? "—"} • PM{" "}
                {selected.wind_pm_mph ?? "—"}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-slate-900">
                Montana River Intel
              </div>
              <div className="text-xs text-slate-600">
                Tap a river in the list to preview details here.
              </div>
            </>
          )}
        </div>
      </div>

      {/* BOTTOM LIST SHEET */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30"
        style={{
          transform: `translateY(${(sheetOpen ? sheetY : Math.max(sheetY, 0.75)) * 78}%)`,
          transition: isDragging ? "none" : "transform 180ms ease-out",
        }}
      >
        <div className="mx-auto max-w-6xl px-3 pb-3">
          <div className="onx-glass rounded-3xl shadow-2xl overflow-hidden">
            <div
              className="mx-auto mt-2 h-1.5 w-12 flex-shrink-0 cursor-grab rounded-full bg-white/25 active:cursor-grabbing"
              onPointerDown={onSheetPointerDown}
              onTouchStart={onSheetPointerDown}
              title="Drag to expand/collapse"
            />
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="text-sm font-semibold text-white">
                Rivers ({filtered.length})
              </div>
              <button
                className="text-xs text-white/80 hover:text-white"
                onClick={() => {
                  const next = !sheetOpen;
                  setSheetOpen(next);
                  setSheetY(next ? 0 : 1);
                }}
              >
                {sheetOpen ? "Collapse" : "Expand"}
              </button>
            </div>

            <div className="px-3 pb-3 pt-2">
              <div className="max-h-[34vh] overflow-auto pr-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((r) => (
                    <button
                      key={r.river_id}
                      onClick={() => setSelectedId(r.river_id)}
                      className={[
                        "text-left rounded-2xl border transition",
                        r.river_id === selectedId
                          ? "border-white/45 bg-white/15"
                          : "border-white/15 hover:border-white/25 bg-white/5",
                      ].join(" ")}
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {r.river_name}
                            </div>
                            <div className="text-xs text-white/70">
                              {r.gauge_label ?? ""}
                            </div>
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

                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/85">
                          <div>
                            <div className="text-white/60">Score</div>
                            <div className="font-semibold">
                              {r.fishability_score_calc ?? "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-white/60">Flow</div>
                            <div className="font-semibold">
                              {r.flow_cfs ?? "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-white/60">Temp</div>
                            <div className="font-semibold">
                              {r.water_temp_f != null
                                ? `${Number(r.water_temp_f).toFixed(1)}°`
                                : "—"}
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
