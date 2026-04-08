import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import type {
  FishabilityRow,
  BiteTier,
  RiverDetailAnalyticsBackendRow,
  RiverSourceSiteSummary,
  RiverWeatherDay,
} from "./types";

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
  gage_height_ft?: number | null;
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
  flow_source_site_no?: string | null;
  temp_status?: "available_fresh" | "available_stale" | "unavailable_at_gauge" | null;
  temp_stale?: boolean | null;
  temp_age_minutes?: number | null;
  temp_source_site_no?: string | null;
  temp_source_kind?: "IV" | "DV" | "NONE" | null;
  temp_observed_at?: string | null;
  confidence_level?: "High" | "Moderate" | "Low" | null;
  temp_unavailable?: boolean | null;
  temp_reason?: string | null;
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

type StationRegistryRow = {
  river_id?: string | number | null;
  river_name?: string | null;
  site_no?: string | null;
  station_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  has_flow?: boolean | null;
  has_temp?: boolean | null;
  has_wq?: boolean | null;
  parameter_codes?: string[] | null;
  monitoring_location_id?: string | null;
};

type RiverUsgsMapRoleRow = {
  river_id?: string | number | null;
  site_no?: string | null;
  role?: "flow" | "temp" | "stage" | "aux" | string | null;
  priority?: number | null;
};

type UsgsSiteCatalogRow = {
  site_no?: string | null;
  station_name?: string | null;
  lat?: number | null;
  lon?: number | null;
  active?: boolean | null;
  parameter_codes?: string[] | null;
};

type RiverNameRow = {
  id?: string | number | null;
  river_name?: string | null;
  slug?: string | null;
};

type WeatherDailyRow = {
  date?: string | null;
  wind_am_mph?: number | null;
  wind_pm_mph?: number | null;
  wind_speed_max_mph?: number | null;
  air_temp_f?: number | null;
  wind_direction_deg?: number | null;
  gust_mph?: number | null;
  cloud_cover_pct?: number | null;
  air_temp_high_f?: number | null;
  air_temp_low_f?: number | null;
  precip_mm?: number | null;
  precip_probability_pct?: number | null;
  observed_at?: string | null;
  created_at?: string | null;
};

type RiverDetailAnalyticsRow = RiverDetailAnalyticsBackendRow;

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
  return getSupabaseClient();
}

/** Fetch latest score per river from river_daily_scores (no coords) */
export async function fetchLatestRiverScores(): Promise<RiverScoreRow[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];

  const fromLatest = await supabase
    .from("v_river_latest")
    .select("*");

  if (!fromLatest.error && fromLatest.data && fromLatest.data.length > 0) {
    return (fromLatest.data as RiverLatestRow[]).map((r) => ({
      river_id: String(r.slug ?? r.river_id ?? ""),
      river_uuid: r.river_id ? String(r.river_id) : null,
      river_name: r.river_name ?? undefined,
      gauge_label: r.gauge_label ?? undefined,
      usgs_site_no: r.usgs_site_no ?? undefined,
      date: r.date ?? undefined,
      fishability_score_calc: r.fishability_score_calc ?? null,
      flow_cfs: r.flow_cfs ?? null,
      gage_height_ft: r.gage_height_ft ?? null,
      change_48h_pct: r.change_48h_pct_calc ?? null,
      water_temp_f: r.water_temp_f ?? null,
      wind_am_mph: r.wind_am_mph ?? null,
      wind_pm_mph: r.wind_pm_mph ?? null,
      bite_tier: r.bite_tier ?? null,
      median_flow_cfs: r.median_flow_cfs ?? null,
      flow_ratio_calc: r.flow_ratio_calc ?? null,
      source_flow_observed_at: r.source_flow_observed_at ?? null,
      source_temp_observed_at: r.source_temp_observed_at ?? null,
      temp_observed_at: r.temp_observed_at ?? r.source_temp_observed_at ?? null,
      flow_source_site_no: r.flow_source_site_no ?? null,
      temp_status: r.temp_status ?? null,
      temp_stale: r.temp_stale ?? null,
      temp_age_minutes: r.temp_age_minutes ?? null,
      temp_source_site_no: r.temp_source_site_no ?? null,
      temp_source_kind: r.temp_source_kind ?? null,
      confidence_level: r.confidence_level ?? null,
      temp_unavailable: r.temp_unavailable ?? null,
      temp_reason: r.temp_reason ?? null,
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

  const latestRes: any = await supabase
    .from("v_river_latest")
    .select("*")
    .order("fishability_score_calc", { ascending: false, nullsFirst: false });

  if (!latestRes.error && latestRes.data && latestRes.data.length > 0) {
    const healthMap = await fetchHealthMap(supabase);
    const rows = (latestRes.data as RiverLatestRow[]).map((r) => ({
      river_id: String(r.river_id ?? ""),
      river_uuid: r.river_id ? String(r.river_id) : null,
      slug: r.slug ?? undefined,
      river_name: r.river_name ?? formatSlug(String(r.slug ?? r.river_id ?? "")),
      gauge_label: r.gauge_label ?? "",
      usgs_site_no: r.usgs_site_no ?? "",
      date: r.date ?? "",
      flow_cfs: r.flow_cfs ?? null,
      gage_height_ft: r.gage_height_ft ?? null,
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
      temp_observed_at: r.temp_observed_at ?? r.source_temp_observed_at ?? null,
      flow_source_site_no: r.flow_source_site_no ?? null,
      temp_status: r.temp_status ?? null,
      temp_stale: r.temp_stale ?? null,
      temp_age_minutes: r.temp_age_minutes ?? null,
      temp_source_site_no: r.temp_source_site_no ?? null,
      temp_source_kind: r.temp_source_kind ?? null,
      confidence_level: r.confidence_level ?? null,
      temp_unavailable: r.temp_unavailable ?? null,
      temp_reason: r.temp_reason ?? null,
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
  const u = t.toUpperCase().trim();
  if (u === "HOT" || u.includes("GREAT")) return "HOT";
  if (u === "GOOD") return "GOOD";
  if (u === "FAIR") return "FAIR";
  if (u === "TOUGH") return "TOUGH";
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

export async function fetchActiveStationGeojsonByRiverIds(
  riverIds: string[]
): Promise<GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>>> {
  const client = createSupabaseClient();
  if (!client || riverIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const uniqueIds = Array.from(new Set(riverIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const roleRes = await client
    .from("river_usgs_map_roles")
    .select("river_id,site_no,role,priority")
    .eq("is_active", true)
    .in("river_id", uniqueIds);

  if (roleRes.error || !roleRes.data?.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const activeRoles = (roleRes.data as RiverUsgsMapRoleRow[])
    .map((row) => ({
      river_id: row.river_id != null ? String(row.river_id) : null,
      site_no: row.site_no ? String(row.site_no).trim() : "",
      role: row.role ? String(row.role).trim().toLowerCase() : "",
      priority: row.priority ?? null,
    }))
    .filter((row) => row.river_id && row.site_no && row.role);

  const activeSiteNos = Array.from(new Set(activeRoles.map((row) => row.site_no)));
  if (!activeSiteNos.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const [registryRes, catalogRes, riversRes] = await Promise.all([
    client
      .from("usgs_station_registry")
      .select(
        "river_id,river_name,site_no,station_name,latitude,longitude,has_flow,has_temp,has_wq,parameter_codes,monitoring_location_id,is_active"
      )
      .eq("is_active", true)
      .in("site_no", activeSiteNos),
    client
      .from("usgs_sites")
      .select("site_no,station_name,lat,lon,active,parameter_codes")
      .eq("active", true)
      .in("site_no", activeSiteNos),
    client
      .from("rivers")
      .select("id,river_name,slug")
      .in("id", uniqueIds),
  ]);

  if (catalogRes.error || !catalogRes.data?.length) {
    return { type: "FeatureCollection", features: [] };
  }

  const rows = (registryRes.data ?? []) as StationRegistryRow[];
  const catalogRows = catalogRes.data as UsgsSiteCatalogRow[];
  const riverNameById = new Map<string, string>();
  for (const row of (riversRes.data ?? []) as RiverNameRow[]) {
    const id = row.id != null ? String(row.id) : "";
    if (!id) continue;
    riverNameById.set(id, row.river_name?.trim() || row.slug?.trim() || id);
  }

  const catalogBySite = new Map<string, UsgsSiteCatalogRow>();
  for (const row of catalogRows) {
    const siteNo = row.site_no ? String(row.site_no).trim() : "";
    if (!siteNo) continue;
    catalogBySite.set(siteNo, row);
  }

  const registryBySite = new Map<string, StationRegistryRow[]>();
  for (const row of rows) {
    const siteNo = row.site_no ? String(row.site_no).trim() : "";
    if (!siteNo) continue;
    const bucket = registryBySite.get(siteNo) ?? [];
    bucket.push(row);
    registryBySite.set(siteNo, bucket);
  }

  const rolesBySite = new Map<string, Set<string>>();
  const riverIdsBySite = new Map<string, Set<string>>();
  for (const row of activeRoles) {
    const roleBucket = rolesBySite.get(row.site_no) ?? new Set<string>();
    roleBucket.add(row.role);
    rolesBySite.set(row.site_no, roleBucket);
    if (row.river_id) {
      const riverBucket = riverIdsBySite.get(row.site_no) ?? new Set<string>();
      riverBucket.add(row.river_id);
      riverIdsBySite.set(row.site_no, riverBucket);
    }
  }

  const roleOrder = ["flow", "temp", "stage", "aux"];
  const features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[] = [];
  for (const siteNo of activeSiteNos) {
    const siteRows = registryBySite.get(siteNo) ?? [];
    const catalogRow = catalogBySite.get(siteNo);
    const baseRegistryRow =
      siteRows.find((row) => row.latitude != null && row.longitude != null && row.station_name) ??
      siteRows.find((row) => row.latitude != null && row.longitude != null) ??
      siteRows[0];
    const lng = baseRegistryRow?.longitude ?? catalogRow?.lon ?? null;
    const lat = baseRegistryRow?.latitude ?? catalogRow?.lat ?? null;
    if (lng == null || lat == null || Number.isNaN(Number(lng)) || Number.isNaN(Number(lat))) continue;
    const roles = Array.from(rolesBySite.get(siteNo) ?? []).sort((a, b) => {
      const ai = roleOrder.indexOf(a);
      const bi = roleOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    const relatedRiverIds = Array.from(riverIdsBySite.get(siteNo) ?? []);
    const relatedRiverNames = Array.from(
      new Set(
        [
          ...siteRows.map((row) => row.river_name?.trim()),
          ...relatedRiverIds.map((riverId) => riverNameById.get(riverId)?.trim()),
        ].filter((value): value is string => Boolean(value))
      )
    );
    const parameterCodes = Array.from(
      new Set(
        [
          ...siteRows.flatMap((row) => row.parameter_codes ?? []),
          ...(catalogRow?.parameter_codes ?? []),
        ]
          .map((code) => String(code).trim())
          .filter(Boolean)
      )
    );
    const hasFlow = siteRows.some((row) => row.has_flow === true) || roles.includes("flow");
    const hasTemp = siteRows.some((row) => row.has_temp === true) || roles.includes("temp");
    const hasWq = siteRows.some((row) => row.has_wq === true);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      properties: {
        river_id: relatedRiverIds[0] ?? (baseRegistryRow?.river_id ? String(baseRegistryRow.river_id) : null),
        river_name: relatedRiverNames[0] ?? baseRegistryRow?.river_name ?? null,
        related_river_ids: relatedRiverIds,
        related_river_ids_csv: relatedRiverIds.join(" | "),
        related_river_names: relatedRiverNames,
        related_river_names_csv: relatedRiverNames.join(" | "),
        site_no: siteNo,
        station_name: baseRegistryRow?.station_name ?? catalogRow?.station_name ?? null,
        roles,
        roles_csv: roles.join(" • "),
        primary_role: roles[0] ?? null,
        role_count: roles.length,
        has_flow: hasFlow,
        has_temp: hasTemp,
        has_wq: hasWq,
        parameter_codes: parameterCodes,
        monitoring_location_id: baseRegistryRow?.monitoring_location_id ?? null,
      },
    });
  }

  return { type: "FeatureCollection", features };
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
      gage_height_ft: row.gage_height_ft ?? null,
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
      temp_observed_at: row.temp_observed_at ?? row.source_temp_observed_at ?? null,
      flow_source_site_no: row.flow_source_site_no ?? null,
      temp_status: row.temp_status ?? null,
      temp_stale: row.temp_stale ?? null,
      temp_age_minutes: row.temp_age_minutes ?? null,
      temp_source_site_no: row.temp_source_site_no ?? null,
      temp_source_kind: row.temp_source_kind ?? null,
      confidence_level: row.confidence_level ?? null,
      temp_unavailable: row.temp_unavailable ?? null,
      temp_reason: row.temp_reason ?? null,
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

export async function fetchRiverDetailAnalyticsByIdOrSlug(
  riverIdOrSlug: string
): Promise<RiverDetailAnalyticsBackendRow | null> {
  const client = createSupabaseClient();
  if (!client) return null;

  const byId = await client
    .from("v_river_detail_analytics")
    .select("*")
    .eq("river_id", riverIdOrSlug)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return byId.data as RiverDetailAnalyticsRow;
  }

  const bySlug = await client
    .from("v_river_detail_analytics")
    .select("*")
    .eq("slug", riverIdOrSlug)
    .maybeSingle();

  if (!bySlug.error && bySlug.data) {
    return bySlug.data as RiverDetailAnalyticsRow;
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

function mountainDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function resolveRiverId(client: SupabaseClient, riverDbId: string): Promise<string | null> {
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidLike.test(riverDbId)) return riverDbId;
  const bySlug = await client
    .from("rivers")
    .select("id")
    .eq("slug", riverDbId)
    .maybeSingle();
  if (bySlug.error || !bySlug.data?.id) return null;
  return String(bySlug.data.id);
}

export async function fetchRiverWeatherWindow(riverDbId: string): Promise<RiverWeatherDay[]> {
  const client = createSupabaseClient();
  if (!client) return [];

  const resolvedRiverId = await resolveRiverId(client, riverDbId);
  if (!resolvedRiverId) return [];

  const today = mountainDate();
  let res = await client
    .from("weather_daily")
    .select("*")
    .eq("river_id", resolvedRiverId)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(4);

  if (res.error || !res.data?.length) {
    res = await client
      .from("weather_daily")
      .select("*")
      .eq("river_id", resolvedRiverId)
      .order("date", { ascending: false })
      .limit(4);
  }

  if (res.error || !res.data) return [];
  return [...(res.data as WeatherDailyRow[])]
    .map((row) => ({
      date: row.date ?? "",
      wind_am_mph: row.wind_am_mph ?? null,
      wind_pm_mph: row.wind_pm_mph ?? null,
      wind_speed_max_mph: row.wind_speed_max_mph ?? null,
      air_temp_f: row.air_temp_f ?? null,
      wind_direction_deg: row.wind_direction_deg ?? null,
      gust_mph: row.gust_mph ?? null,
      cloud_cover_pct: row.cloud_cover_pct ?? null,
      air_temp_high_f: row.air_temp_high_f ?? null,
      air_temp_low_f: row.air_temp_low_f ?? null,
      precip_mm: row.precip_mm ?? null,
      precip_probability_pct: row.precip_probability_pct ?? null,
      observed_at: row.observed_at ?? null,
      created_at: row.created_at ?? null,
    }))
    .filter((row) => Boolean(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchUsgsSiteSummaries(
  siteNos: string[]
): Promise<Record<string, RiverSourceSiteSummary>> {
  const client = createSupabaseClient();
  if (!client) return {};
  const normalized = Array.from(new Set(siteNos.map((siteNo) => String(siteNo).trim()).filter(Boolean)));
  if (!normalized.length) return {};

  const [registryRes, catalogRes] = await Promise.all([
    client.from("usgs_station_registry").select("site_no,station_name").in("site_no", normalized),
    client.from("usgs_sites").select("site_no,station_name").in("site_no", normalized),
  ]);

  const out: Record<string, RiverSourceSiteSummary> = {};
  for (const row of (catalogRes.data ?? []) as Array<{ site_no?: string | null; station_name?: string | null }>) {
    const siteNo = row.site_no ? String(row.site_no).trim() : "";
    if (!siteNo) continue;
    out[siteNo] = { site_no: siteNo, station_name: row.station_name ?? null };
  }
  for (const row of (registryRes.data ?? []) as Array<{ site_no?: string | null; station_name?: string | null }>) {
    const siteNo = row.site_no ? String(row.site_no).trim() : "";
    if (!siteNo) continue;
    out[siteNo] = out[siteNo] ?? { site_no: siteNo, station_name: row.station_name ?? null };
    if (!out[siteNo].station_name && row.station_name) {
      out[siteNo] = { site_no: siteNo, station_name: row.station_name };
    }
  }
  return out;
}
