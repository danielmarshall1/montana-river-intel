import { SupabaseClient } from "@supabase/supabase-js";
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

type RiverLatestRow = {
  river_id?: string | number | null;
  slug?: string | null;
  river_name?: string | null;
  gauge_label?: string | null;
  usgs_site_no?: string | null;
  date?: string | null;
  flow_cfs?: number | null;
  median_flow_cfs?: number | null;
  flow_ratio_calc?: number | null;
  change_48h_pct_calc?: number | null;
  water_temp_f?: number | null;
  wind_am_mph?: number | null;
  wind_pm_mph?: number | null;
  precip_mm?: number | null;
  precip_probability_pct?: number | null;
  fishability_rank?: number | null;
  fishability_percentile?: number | null;
  fishability_score_calc?: number | null;
  bite_tier?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source_flow_observed_at?: string | null;
  source_temp_observed_at?: string | null;
  updated_at?: string | null;
  is_stale?: boolean | null;
  stale_reason?: string | null;
  last_usgs_pull_at?: string | null;
  last_weather_pull_at?: string | null;
  last_river_daily_date?: string | null;
};

type RiverHealthRow = {
  river_id?: string | number | null;
  is_stale?: boolean | null;
  stale_reason?: string | null;
  last_usgs_pull_at?: string | null;
  last_weather_pull_at?: string | null;
  last_river_daily_date?: string | null;
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

  const fromLatest = await supabase
    .from("v_river_latest")
    .select("river_id,slug,river_name,gauge_label,usgs_site_no,date,fishability_score_calc,flow_cfs,change_48h_pct_calc,water_temp_f,wind_am_mph,wind_pm_mph,bite_tier,median_flow_cfs,flow_ratio_calc,source_flow_observed_at,source_temp_observed_at,updated_at");

  if (!fromLatest.error && fromLatest.data && fromLatest.data.length > 0) {
    return (fromLatest.data as RiverLatestRow[]).map((r) => ({
      river_id: String(r.slug ?? r.river_id ?? ""),
      river_name: r.river_name ?? undefined,
      gauge_label: r.gauge_label ?? undefined,
      usgs_site_no: r.usgs_site_no ?? undefined,
      date: r.date ?? undefined,
      fishability_score_calc: r.fishability_score_calc ?? null,
      flow_cfs: r.flow_cfs ?? null,
      change_48h_pct: r.change_48h_pct_calc ?? null,
      water_temp_f: r.water_temp_f ?? null,
      wind_am_mph: r.wind_am_mph ?? null,
      wind_pm_mph: r.wind_pm_mph ?? null,
      bite_tier: r.bite_tier ?? null,
      median_flow_cfs: r.median_flow_cfs ?? null,
      flow_ratio_calc: r.flow_ratio_calc ?? null,
      source_flow_observed_at: r.source_flow_observed_at ?? null,
      source_temp_observed_at: r.source_temp_observed_at ?? null,
      updated_at: r.updated_at ?? null,
    }));
  }
  return [];
}

async function fetchHealthMap(supabase: SupabaseClient): Promise<Map<string, RiverHealthRow>> {
  const out = new Map<string, RiverHealthRow>();
  const healthRes = await supabase
    .from("v_river_health")
    .select("river_id,is_stale,stale_reason,last_usgs_pull_at,last_weather_pull_at,last_river_daily_date");
  if (healthRes.error || !healthRes.data) return out;
  for (const row of healthRes.data as RiverHealthRow[]) {
    const id = String(row.river_id ?? "");
    if (!id) continue;
    out.set(id, row);
  }
  return out;
}

/** Fetch rivers metadata + latest scores, merge to FishabilityRow[] */
export async function fetchRiversWithLatest(): Promise<FishabilityRow[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const latestSelectEnriched =
    "river_id,slug,river_name,gauge_label,usgs_site_no,latitude,longitude,date,flow_cfs,median_flow_cfs,flow_ratio_calc,change_48h_pct_calc,water_temp_f,wind_am_mph,wind_pm_mph,precip_mm,precip_probability_pct,fishability_score_calc,fishability_rank,fishability_percentile,bite_tier,source_flow_observed_at,source_temp_observed_at,updated_at,is_stale,stale_reason,last_usgs_pull_at,last_weather_pull_at,last_river_daily_date";
  const latestSelectFallback =
    "river_id,slug,river_name,gauge_label,usgs_site_no,latitude,longitude,date,flow_cfs,median_flow_cfs,flow_ratio_calc,change_48h_pct_calc,water_temp_f,wind_am_mph,wind_pm_mph,fishability_score_calc,bite_tier,source_flow_observed_at,source_temp_observed_at,updated_at";

  let latestRes: any = await supabase
    .from("v_river_latest")
    .select(latestSelectEnriched)
    .order("fishability_score_calc", { ascending: false, nullsFirst: false });

  if (latestRes.error) {
    latestRes = await supabase
      .from("v_river_latest")
      .select(latestSelectFallback)
      .order("fishability_score_calc", { ascending: false, nullsFirst: false });
  }

  if (!latestRes.error && latestRes.data && latestRes.data.length > 0) {
    const healthMap = await fetchHealthMap(supabase);
    const rows = (latestRes.data as RiverLatestRow[]).map((r) => ({
      river_id: String(r.river_id ?? ""),
      slug: r.slug ?? undefined,
      river_name: r.river_name ?? formatSlug(String(r.slug ?? r.river_id ?? "")),
      gauge_label: r.gauge_label ?? "",
      usgs_site_no: r.usgs_site_no ?? "",
      date: r.date ?? "",
      flow_cfs: r.flow_cfs ?? null,
      median_flow_cfs: r.median_flow_cfs ?? null,
      flow_ratio_calc: r.flow_ratio_calc ?? null,
      change_48h_pct_calc: r.change_48h_pct_calc ?? null,
      water_temp_f: r.water_temp_f ?? null,
      wind_am_mph: r.wind_am_mph ?? null,
      wind_pm_mph: r.wind_pm_mph ?? null,
      precip_mm: r.precip_mm ?? null,
      precip_probability_pct: r.precip_probability_pct ?? null,
      fishability_score_calc: r.fishability_score_calc ?? null,
      fishability_rank: r.fishability_rank ?? null,
      fishability_percentile: r.fishability_percentile ?? null,
      bite_tier: normalizeBiteTier(r.bite_tier),
      lat: r.latitude ?? null,
      lng: r.longitude ?? null,
      source_flow_observed_at: r.source_flow_observed_at ?? null,
      source_temp_observed_at: r.source_temp_observed_at ?? null,
      updated_at: r.updated_at ?? null,
      is_stale:
        r.is_stale ??
        healthMap.get(String(r.river_id ?? ""))?.is_stale ??
        null,
      stale_reason:
        r.stale_reason ??
        healthMap.get(String(r.river_id ?? ""))?.stale_reason ??
        null,
      last_usgs_pull_at:
        r.last_usgs_pull_at ??
        healthMap.get(String(r.river_id ?? ""))?.last_usgs_pull_at ??
        null,
      last_weather_pull_at:
        r.last_weather_pull_at ??
        healthMap.get(String(r.river_id ?? ""))?.last_weather_pull_at ??
        null,
      last_river_daily_date:
        r.last_river_daily_date ??
        healthMap.get(String(r.river_id ?? ""))?.last_river_daily_date ??
        null,
    })) as FishabilityRow[];

    rows.sort((a, b) => (b.fishability_score_calc ?? 0) - (a.fishability_score_calc ?? 0));
    return rows;
  }

  return [];
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
  } catch (_) {
    /* fall through */
  }

  const { MOCK_RIVERS } = await import("./mock-data");
  return MOCK_RIVERS;
}

export async function fetchRiverDetailByIdOrSlug(
  riverIdOrSlug: string
): Promise<FishabilityRow | null> {
  const client = createSupabaseClient();
  if (!client) return null;

  const bySlug = await client
    .from("v_river_detail")
    .select("*")
    .eq("slug", riverIdOrSlug)
    .maybeSingle();

  const row = (!bySlug.error ? bySlug.data : null) as RiverLatestRow | null;
  if (row) {
    return {
      river_id: String(row.river_id ?? ""),
      slug: row.slug ?? undefined,
      river_name: row.river_name ?? formatSlug(String(row.slug ?? row.river_id ?? "")),
      gauge_label: row.gauge_label ?? "",
      usgs_site_no: row.usgs_site_no ?? "",
      date: row.date ?? "",
      flow_cfs: row.flow_cfs ?? null,
      median_flow_cfs: row.median_flow_cfs ?? null,
      flow_ratio_calc: row.flow_ratio_calc ?? null,
      change_48h_pct_calc: row.change_48h_pct_calc ?? null,
      water_temp_f: row.water_temp_f ?? null,
      wind_am_mph: row.wind_am_mph ?? null,
      wind_pm_mph: row.wind_pm_mph ?? null,
      precip_mm: row.precip_mm ?? null,
      precip_probability_pct: row.precip_probability_pct ?? null,
      fishability_score_calc: row.fishability_score_calc ?? null,
      fishability_rank: row.fishability_rank ?? null,
      fishability_percentile: row.fishability_percentile ?? null,
      bite_tier: normalizeBiteTier(row.bite_tier),
      lat: row.latitude ?? null,
      lng: row.longitude ?? null,
      source_flow_observed_at: row.source_flow_observed_at ?? null,
      source_temp_observed_at: row.source_temp_observed_at ?? null,
      updated_at: row.updated_at ?? null,
      is_stale: row.is_stale ?? null,
      stale_reason: row.stale_reason ?? null,
      last_usgs_pull_at: row.last_usgs_pull_at ?? null,
      last_weather_pull_at: row.last_weather_pull_at ?? null,
      last_river_daily_date: row.last_river_daily_date ?? null,
    };
  }

  return null;
}

export async function fetchRiverHistory14d(
  riverDbId: string
): Promise<Array<{ obs_date: string; flow_cfs: number | null; water_temp_f: number | null; fishability_score: number | null }>> {
  const client = createSupabaseClient();
  if (!client) return [];

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let resolvedRiverId = riverDbId;
  if (!uuidLike.test(riverDbId)) {
    const bySlug = await client
      .from("rivers")
      .select("id")
      .eq("slug", riverDbId)
      .maybeSingle();
    if (bySlug.error || !bySlug.data?.id) return [];
    resolvedRiverId = String(bySlug.data.id);
  }

  const { data, error } = await client.rpc("river_history_14d", {
    p_river_id: resolvedRiverId,
  });
  if (!error && data) {
    return data as Array<{
      obs_date: string;
      flow_cfs: number | null;
      water_temp_f: number | null;
      fishability_score: number | null;
    }>;
  }

  // Fallback path when RPC is missing/mismatched: read directly from river_daily.
  const dailyRes = await client
    .from("river_daily")
    .select("obs_date,flow_cfs,water_temp_f,fishability_score")
    .eq("river_id", resolvedRiverId)
    .order("obs_date", { ascending: false })
    .limit(14);

  if (dailyRes.error || !dailyRes.data) return [];
  return (dailyRes.data as Array<{
    obs_date: string;
    flow_cfs: number | null;
    water_temp_f: number | null;
    fishability_score: number | null;
  }>);
}

export async function fetchRiverIntraday24h(
  riverDbId: string
): Promise<
  Array<{
    observed_at: string;
    flow_cfs: number | null;
    water_temp_f: number | null;
    gage_height_ft: number | null;
  }>
> {
  const client = createSupabaseClient();
  if (!client) return [];

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let resolvedRiverId = riverDbId;
  if (!uuidLike.test(riverDbId)) {
    const bySlug = await client
      .from("rivers")
      .select("id")
      .eq("slug", riverDbId)
      .maybeSingle();
    if (bySlug.error || !bySlug.data?.id) return [];
    resolvedRiverId = String(bySlug.data.id);
  }

  const rpc = await client.rpc("river_intraday_24h", {
    p_river_id: resolvedRiverId,
  });
  if (!rpc.error && rpc.data) {
    return rpc.data as Array<{
      observed_at: string;
      flow_cfs: number | null;
      water_temp_f: number | null;
      gage_height_ft: number | null;
    }>;
  }

  const fallback = await client
    .from("river_hourly")
    .select("observed_at,flow_cfs,water_temp_f,gage_height_ft")
    .eq("river_id", resolvedRiverId)
    .gte("observed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("observed_at", { ascending: true });

  if (fallback.error || !fallback.data) return [];
  return fallback.data as Array<{
    observed_at: string;
    flow_cfs: number | null;
    water_temp_f: number | null;
    gage_height_ft: number | null;
  }>;
}
