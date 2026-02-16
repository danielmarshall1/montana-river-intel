import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { FishabilityRow, BiteTier } from "./types";

/** Raw row from river_daily_scores */
type RiverScoreRow = {
  river?: string;
  date?: string;
  usgs_site_no?: string;
  fishability_score?: number | null;
  flow_cfs?: number | null;
  change_48h_pct?: number | null;
  water_temp_f?: number | null;
  wind_am_mph?: number | null;
  wind_pm_mph?: number | null;
  bite_tier?: string | null;
  median_flow_cfs?: number | null;
  flow_ratio_calc?: number | null;
  fishability_score_calc?: number | null;
  river_id?: string | null;
  river_name?: string | null;
  gauge_label?: string | null;
};

/** Raw row from rivers */
type RiverMetaRow = {
  id?: string | number;
  slug?: string;
  river?: string;
  river_name?: string;
  gauge_label?: string;
  usgs_site_no?: string;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export async function fetchRiverGeom(
  riverId: string
): Promise<GeoJSON.Geometry | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("river_geoms")
    .select("geom")
    .eq("river_id", riverId)
    .single();
  if (error || !data) return null;
  return (data as { geom: GeoJSON.Geometry }).geom ?? null;
}

/** Fetch river geometry as GeoJSON via PostGIS RPC (river_geometries table) */
export async function fetchRiverGeojson(riverId: string): Promise<GeoJSON.GeoJSON | null> {
  const client = createSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.rpc("get_river_geojson", { p_river_id: riverId });
    if (error) {
      console.warn("[fetchRiverGeojson] rpc error", error);
      return null;
    }
    if (!data) return null;
    return { type: "Feature", geometry: data, properties: { river_id: riverId } } as GeoJSON.Feature<GeoJSON.Geometry>;
  } catch (e) {
    console.warn("[fetchRiverGeojson] exception", e);
    return null;
  }
}

export function createSupabaseClient(): SupabaseClient | null {
  return supabase;
}

/** Fetch latest score per river from river_daily_scores (no coords) */
export async function fetchLatestRiverScores(): Promise<RiverScoreRow[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("river_daily_scores")
    .select(
      "river_id,date,fishability_score,flow_cfs,change_48h_pct,water_temp_f,wind_am_mph,wind_pm_mph,bite_tier,median_flow_cfs,flow_ratio,fishability_score"
    )
    .order("date", { ascending: false });

  if (error) return [];

  const seen = new Set<string>();
  const latest: RiverScoreRow[] = [];
  const key = (r: RiverScoreRow) => String(r.river_id ?? "");

  for (const row of data ?? []) {
    const k = key(row);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    latest.push(row);
  }
  return latest;
}

/** Fetch rivers metadata + latest scores, merge to FishabilityRow[] */
export async function fetchRiversWithLatest(): Promise<FishabilityRow[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const [riversRes, scoresRes] = await Promise.all([
    supabase
      .from("rivers")
      .select("id,slug,river_name,gauge_label,usgs_site_no,latitude,longitude")
      .eq("is_active", true),
    supabase
      .from("river_daily_scores")
      .select("river_id,date,fishability_score,flow_cfs,change_48h_pct,water_temp_f,wind_am_mph,wind_pm_mph,bite_tier,median_flow_cfs,flow_ratio")
      .order("date", { ascending: false }),
  ]);

  let rivers = (riversRes.data ?? []) as RiverMetaRow[];
  if (rivers.length === 0 && riversRes.error) {
    const retry = await supabase.from("rivers").select("id,slug,river_name,gauge_label,usgs_site_no,latitude,longitude").eq("is_active", true);
    rivers = (retry.data ?? []) as RiverMetaRow[];
  }

  const scoresData = scoresRes.data ?? [];

  console.log("[fetchRiversWithLatest] RIVERS:", rivers.length, rivers);
  console.log("[fetchRiversWithLatest] SCORES:", scoresData.length, scoresData);

  const seen = new Set<string>();
  const scoresByRiverId = new Map<string, RiverScoreRow>();
  for (const row of scoresData as RiverScoreRow[]) {
    const k = row.river_id ?? "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    scoresByRiverId.set(k, row);
  }

  const rows: FishabilityRow[] = [];
  for (const r of rivers) {
    const riverIdStr = String(r.id ?? "");
    const slug = r.slug ?? "";
    const score = scoresByRiverId.get(riverIdStr) ?? scoresByRiverId.get(slug);

    const riverId = slug || riverIdStr;
    const riverName = r.river_name ?? score?.river_name ?? r.river ?? formatSlug(r.slug ?? riverId);
    const gaugeLabel = r.gauge_label ?? score?.gauge_label ?? "";

    rows.push({
      river_id: riverId,
      slug: slug || undefined,
      river_name: riverName,
      gauge_label: gaugeLabel,
      usgs_site_no: r.usgs_site_no ?? (score as { usgs_site_no?: string })?.usgs_site_no ?? "",
      date: score?.date ?? "",
      flow_cfs: score?.flow_cfs ?? null,
      median_flow_cfs: score?.median_flow_cfs ?? null,
      flow_ratio_calc: (score as { flow_ratio?: number })?.flow_ratio ?? score?.flow_ratio_calc ?? null,
      change_48h_pct_calc: (score as { change_48h_pct?: number })?.change_48h_pct ?? score?.change_48h_pct ?? null,
      water_temp_f: score?.water_temp_f ?? null,
      wind_am_mph: score?.wind_am_mph ?? null,
      wind_pm_mph: score?.wind_pm_mph ?? null,
      fishability_score_calc: (score as { fishability_score_calc?: number })?.fishability_score_calc ?? score?.fishability_score ?? null,
      bite_tier: normalizeBiteTier(score?.bite_tier),
      lat: r.latitude ?? r.lat ?? null,
      lng: r.longitude ?? r.lng ?? null,
    });
  }

  rows.sort(
    (a, b) => (b.fishability_score_calc ?? 0) - (a.fishability_score_calc ?? 0)
  );
  return rows;
}

function normalizeBiteTier(t?: string | null): BiteTier | null {
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === "HOT" || u === "GOOD" || u === "FAIR" || u === "TOUGH") return u as BiteTier;
  return null;
}

function formatSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export async function fetchFishabilityData(useMock = false): Promise<FishabilityRow[]> {
  if (useMock) {
    const { MOCK_RIVERS } = await import("./mock-data");
    return MOCK_RIVERS;
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    const { MOCK_RIVERS } = await import("./mock-data");
    return MOCK_RIVERS;
  }

  try {
    const fromRivers = await fetchRiversWithLatest();
    if (fromRivers.length > 0) return fromRivers;

    const { data, error } = await supabase
      .from("v_today_fishability_canonical")
      .select("*")
      .order("fishability_score_calc", { ascending: false });

    if (!error && data && data.length > 0) {
      return (data as FishabilityRow[]).map((r) => ({
        ...r,
        lat: (r as FishabilityRow & { latitude?: number }).latitude ?? r.lat,
        lng: (r as FishabilityRow & { longitude?: number }).longitude ?? r.lng,
      }));
    }

    const fallback = await supabase
      .from("v_today_fishability")
      .select("*")
      .order("fishability_score_calc", { ascending: false });

    if (!fallback.error && fallback.data && fallback.data.length > 0) {
      return fallback.data as FishabilityRow[];
    }

    const scores = await fetchLatestRiverScores();
    if (scores.length > 0) {
      return scores.map((s) => ({
        river_id: String(s.river_id ?? ""),
        river_name: (s as { river_name?: string }).river_name ?? "",
        gauge_label: s.gauge_label ?? "",
        usgs_site_no: s.usgs_site_no ?? "",
        date: s.date ?? "",
        flow_cfs: s.flow_cfs ?? null,
        median_flow_cfs: s.median_flow_cfs ?? null,
        flow_ratio_calc: s.flow_ratio_calc ?? null,
        change_48h_pct_calc: s.change_48h_pct ?? null,
        water_temp_f: s.water_temp_f ?? null,
        wind_am_mph: s.wind_am_mph ?? null,
        wind_pm_mph: s.wind_pm_mph ?? null,
        fishability_score_calc: (s as { fishability_score_calc?: number }).fishability_score_calc ?? s.fishability_score ?? null,
        bite_tier: s.bite_tier as BiteTier,
      }));
    }
  } catch (_) {
    /* fall through */
  }

  const { MOCK_RIVERS } = await import("./mock-data");
  return MOCK_RIVERS;
}
