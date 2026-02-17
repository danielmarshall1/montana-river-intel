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
  fishability_score_calc?: number | null;
  bite_tier?: string | null;
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

  const fromLatest = await supabase
    .from("v_river_latest")
    .select("river_id,slug,river_name,gauge_label,usgs_site_no,date,fishability_score_calc,flow_cfs,change_48h_pct_calc,water_temp_f,wind_am_mph,wind_pm_mph,bite_tier,median_flow_cfs,flow_ratio_calc");

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
    }));
  }
  return [];
}

/** Fetch rivers metadata + latest scores, merge to FishabilityRow[] */
export async function fetchRiversWithLatest(): Promise<FishabilityRow[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const latestRes = await supabase
    .from("v_river_latest")
    .select("river_id,slug,river_name,gauge_label,usgs_site_no,latitude,longitude,date,flow_cfs,median_flow_cfs,flow_ratio_calc,change_48h_pct_calc,water_temp_f,wind_am_mph,wind_pm_mph,fishability_score_calc,bite_tier")
    .order("fishability_score_calc", { ascending: false, nullsFirst: false });

  if (!latestRes.error && latestRes.data && latestRes.data.length > 0) {
    const rows = (latestRes.data as RiverLatestRow[]).map((r) => ({
      river_id: String(r.slug ?? r.river_id ?? ""),
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
      fishability_score_calc: r.fishability_score_calc ?? null,
      bite_tier: normalizeBiteTier(r.bite_tier),
      lat: r.latitude ?? null,
      lng: r.longitude ?? null,
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
      river_id: String(row.slug ?? row.river_id ?? ""),
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
      fishability_score_calc: row.fishability_score_calc ?? null,
      bite_tier: normalizeBiteTier(row.bite_tier),
      lat: row.latitude ?? null,
      lng: row.longitude ?? null,
    };
  }

  return null;
}

export async function fetchRiverHistory14d(
  riverDbId: string
): Promise<Array<{ obs_date: string; flow_cfs: number | null; water_temp_f: number | null; fishability_score: number | null }>> {
  const client = createSupabaseClient();
  if (!client) return [];

  const { data, error } = await client.rpc("river_history_14d", {
    p_river_id: riverDbId,
  });
  if (error || !data) return [];
  return data as Array<{ obs_date: string; flow_cfs: number | null; water_temp_f: number | null; fishability_score: number | null }>;
}
