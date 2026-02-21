import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type RiverBBox = {
  river_id: string;
  river_slug: string | null;
  river_name: string | null;
  min_lng: number;
  min_lat: number;
  max_lng: number;
  max_lat: number;
};

type MonitoringFeature = {
  id?: string;
  type?: string;
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
};

type StationMetadata = {
  monitoringLocationId: string;
  siteNo: string;
  stationName: string | null;
  latitude: number | null;
  longitude: number | null;
  parameterCodes: string[];
  hasFlow: boolean;
  hasTemp: boolean;
  hasWq: boolean;
  metadata: Record<string, unknown>;
  tsMetadata: Record<string, unknown>;
};

const OGC_BASE = "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
const FLOW_CODES = new Set(["00060", "72137"]);
const TEMP_CODES = new Set(["00010", "72214"]);
const MIN_REQUEST_INTERVAL_MS = Number(process.env.USGS_OGC_MIN_INTERVAL_MS ?? "900");
const MAX_RETRIES = Number(process.env.USGS_OGC_MAX_RETRIES ?? "6");
const BASE_BACKOFF_MS = Number(process.env.USGS_OGC_BASE_BACKOFF_MS ?? "1200");
const MAX_STATIONS_PER_RIVER = Number(process.env.USGS_OGC_MAX_STATIONS_PER_RIVER ?? "40");
const SKIP_FRESH_HOURS = Number(process.env.USGS_OGC_SKIP_FRESH_HOURS ?? "24");
const RIVER_LIMIT = Number(process.env.USGS_OGC_RIVER_LIMIT ?? "0");
const RIVER_OFFSET = Number(process.env.USGS_OGC_RIVER_OFFSET ?? "0");
const REQUEST_TIMEOUT_MS = Number(process.env.USGS_OGC_REQUEST_TIMEOUT_MS ?? "25000");
const RIVER_TIMEOUT_MS = Number(process.env.USGS_OGC_RIVER_TIMEOUT_MS ?? "90000");
const BBOX_PAD_DEG = Number(process.env.USGS_OGC_BBOX_PAD_DEG ?? "0.12");
const MONITORING_PAGE_SIZE = Number(process.env.USGS_OGC_PAGE_SIZE ?? "100");
const MONITORING_MAX_PAGES = Number(process.env.USGS_OGC_MAX_PAGES ?? "10");
const RIVER_MATCH = (process.env.USGS_OGC_RIVER_MATCH ?? "").trim().toLowerCase();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let lastRequestAt = 0;

function toSiteNo(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/USGS-(\d+)/i);
  if (match?.[1]) return match[1];
  const digits = value.match(/\d{6,}/);
  return digits?.[0] ?? null;
}

function asNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string): Promise<any> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const sinceLast = Date.now() - lastRequestAt;
    if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - sinceLast));
    }
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (res.ok) {
      return res.json();
    }

    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt === MAX_RETRIES) {
      throw new Error(`HTTP ${res.status}: ${url}`);
    }

    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const retryAfterMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : BASE_BACKOFF_MS * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 350);
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs + jitter));
  }
  throw new Error(`HTTP retry failed: ${url}`);
}

async function listRiverBBoxes(): Promise<RiverBBox[]> {
  const { data, error } = await sb.rpc("list_river_bboxes");
  if (error) throw new Error(`list_river_bboxes failed: ${error.message}`);
  let rows = (data ?? []) as RiverBBox[];
  if (RIVER_MATCH) {
    rows = rows.filter((r) =>
      `${r.river_name ?? ""} ${r.river_slug ?? ""} ${r.river_id}`.toLowerCase().includes(RIVER_MATCH)
    );
  }
  const sliced = RIVER_OFFSET > 0 ? rows.slice(RIVER_OFFSET) : rows;
  return RIVER_LIMIT > 0 ? sliced.slice(0, RIVER_LIMIT) : sliced;
}

async function fetchMonitoringLocationsForBBox(b: RiverBBox): Promise<MonitoringFeature[]> {
  const minLng = b.min_lng - BBOX_PAD_DEG;
  const minLat = b.min_lat - BBOX_PAD_DEG;
  const maxLng = b.max_lng + BBOX_PAD_DEG;
  const maxLat = b.max_lat + BBOX_PAD_DEG;
  const bbox = [minLng, minLat, maxLng, maxLat].map((n) => n.toFixed(6)).join(",");

  const out: MonitoringFeature[] = [];
  for (let page = 0; page < MONITORING_MAX_PAGES; page += 1) {
    const offset = page * MONITORING_PAGE_SIZE;
    const url =
      `${OGC_BASE}/monitoring-locations/items?bbox=${bbox}&f=json` +
      `&limit=${MONITORING_PAGE_SIZE}&offset=${offset}`;
    const payload = await fetchJson(url);
    const chunk = (payload?.features ?? payload?.items ?? []) as MonitoringFeature[];
    if (!chunk.length) break;
    out.push(...chunk);
    if (chunk.length < MONITORING_PAGE_SIZE) break;
    if (out.length >= MAX_STATIONS_PER_RIVER) break;
  }
  return MAX_STATIONS_PER_RIVER > 0 ? out.slice(0, MAX_STATIONS_PER_RIVER) : out;
}

function deriveMonitoringId(feature: MonitoringFeature): string | null {
  const p = feature.properties ?? {};
  const raw =
    (p.monitoring_location_id as string | undefined) ??
    (p.monitoringLocationIdentifier as string | undefined) ??
    (p.monitoring_location_identifier as string | undefined) ??
    (p.identifier as string | undefined) ??
    (feature.id as string | undefined) ??
    null;
  if (!raw) return null;
  if (raw.toUpperCase().startsWith("USGS-")) return raw;
  const siteNo = toSiteNo(raw);
  return siteNo ? `USGS-${siteNo}` : raw;
}

async function fetchTimeSeriesMetadata(monitoringLocationId: string): Promise<any> {
  const url =
    `${OGC_BASE}/time-series-metadata/items?monitoring_location_id=${encodeURIComponent(monitoringLocationId)}&f=json&limit=500`;
  return fetchJson(url);
}

async function fetchLatestCheckByRiver(): Promise<Map<string, string>> {
  const { data, error } = await sb
    .from("usgs_station_registry")
    .select("river_id,checked_at")
    .eq("is_active", true)
    .order("checked_at", { ascending: false })
    .limit(10000);
  if (error || !data) return new Map();
  const out = new Map<string, string>();
  for (const row of data as Array<{ river_id?: string | null; checked_at?: string | null }>) {
    const rid = String(row.river_id ?? "");
    const ts = String(row.checked_at ?? "");
    if (!rid || !ts || out.has(rid)) continue;
    out.set(rid, ts);
  }
  return out;
}

function isFresh(ts: string | null | undefined, maxAgeHours: number): boolean {
  if (!ts) return false;
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return false;
  const ageH = (Date.now() - ms) / (1000 * 60 * 60);
  return ageH <= maxAgeHours;
}

function extractParameterCodes(tsPayload: any): string[] {
  const features = (tsPayload?.features ?? tsPayload?.items ?? []) as MonitoringFeature[];
  const out = new Set<string>();

  for (const f of features) {
    const p = f.properties ?? {};
    const candidates = [
      p.parameter_code,
      p.parameterCd,
      p.observed_property_code,
      p.observedPropertyCode,
      p.variable_code,
      p.variableCode,
    ];
    for (const c of candidates) {
      if (!c) continue;
      const code = String(c).trim();
      if (code) out.add(code);
    }
    const extra = p.parameter_codes;
    if (Array.isArray(extra)) {
      for (const e of extra) {
        const code = String(e ?? "").trim();
        if (code) out.add(code);
      }
    }
  }

  return Array.from(out).sort();
}

function buildStationMetadata(feature: MonitoringFeature, tsPayload: any): StationMetadata | null {
  const monitoringLocationId = deriveMonitoringId(feature);
  const siteNo = toSiteNo(monitoringLocationId ?? "");
  if (!monitoringLocationId || !siteNo) return null;

  const p = feature.properties ?? {};
  const parameterCodes = extractParameterCodes(tsPayload);
  const hasFlow = parameterCodes.some((c) => FLOW_CODES.has(c));
  const hasTemp = parameterCodes.some((c) => TEMP_CODES.has(c));
  const hasWq = parameterCodes.some((c) => !FLOW_CODES.has(c) && !TEMP_CODES.has(c));

  const stationName =
    (p.monitoring_location_name as string | undefined) ??
    (p.monitoringLocationName as string | undefined) ??
    (p.name as string | undefined) ??
    null;

  const coords = feature.geometry?.coordinates ?? [];
  const longitude = asNum(coords[0] ?? p.longitude ?? p.lon);
  const latitude = asNum(coords[1] ?? p.latitude ?? p.lat);

  return {
    monitoringLocationId,
    siteNo,
    stationName,
    latitude,
    longitude,
    parameterCodes,
    hasFlow,
    hasTemp,
    hasWq,
    metadata: p,
    tsMetadata: {
      feature_count: Array.isArray(tsPayload?.features)
        ? tsPayload.features.length
        : Array.isArray(tsPayload?.items)
        ? tsPayload.items.length
        : 0,
      parameter_codes: parameterCodes,
    },
  };
}

async function upsertRegistryRows(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const { error } = await sb.from("usgs_station_registry").upsert(rows, {
    onConflict: "river_id,site_no",
  });
  if (error) throw new Error(`usgs_station_registry upsert failed: ${error.message}`);
}

async function main() {
  console.log(
    `[sync-usgs-registry v2] interval=${MIN_REQUEST_INTERVAL_MS}ms retries=${MAX_RETRIES} req_timeout=${REQUEST_TIMEOUT_MS}ms river_timeout=${RIVER_TIMEOUT_MS}ms max_stations=${MAX_STATIONS_PER_RIVER} skip_fresh_h=${SKIP_FRESH_HOURS} offset=${RIVER_OFFSET} limit=${RIVER_LIMIT} bbox_pad=${BBOX_PAD_DEG} page_size=${MONITORING_PAGE_SIZE} max_pages=${MONITORING_MAX_PAGES} match=${RIVER_MATCH || "*"}`
  );
  const rivers = await listRiverBBoxes();
  const latestCheckByRiver = await fetchLatestCheckByRiver();
  const report: Array<{ river: string; stations: number; flow: number; temp: number; wq: number }> = [];
  const failedRivers: Array<{ river: string; error: string }> = [];
  const skippedRivers: Array<{ river: string; checked_at: string }> = [];
  const tsMetaCache = new Map<string, any>();

  let idx = 0;
  for (const river of rivers) {
    idx += 1;
    const riverLabel = river.river_name ?? river.river_slug ?? river.river_id;
    console.log(`[${idx}/${rivers.length}] start ${riverLabel}`);
    const lastChecked = latestCheckByRiver.get(river.river_id);
    if (isFresh(lastChecked, SKIP_FRESH_HOURS)) {
      skippedRivers.push({
        river: riverLabel,
        checked_at: String(lastChecked),
      });
      console.log(`[${idx}/${rivers.length}] skip fresh ${riverLabel}`);
      continue;
    }

    try {
      const riverStartedAt = Date.now();
      const features = await fetchMonitoringLocationsForBBox(river);
      const seen = new Set<string>();
      const riverRegistryRows: Array<Record<string, unknown>> = [];
      let flow = 0;
      let temp = 0;
      let wq = 0;
      let timedOut = false;

      for (const feature of features) {
        if (Date.now() - riverStartedAt > RIVER_TIMEOUT_MS) {
          timedOut = true;
          break;
        }

        const monitoringId = deriveMonitoringId(feature);
        if (!monitoringId || seen.has(monitoringId)) continue;
        seen.add(monitoringId);

        let tsPayload: any = {};
        if (tsMetaCache.has(monitoringId)) {
          tsPayload = tsMetaCache.get(monitoringId) ?? {};
        } else {
          try {
            tsPayload = await fetchTimeSeriesMetadata(monitoringId);
            tsMetaCache.set(monitoringId, tsPayload);
          } catch {
            tsPayload = {};
            tsMetaCache.set(monitoringId, tsPayload);
          }
        }

        const station = buildStationMetadata(feature, tsPayload);
        if (!station) continue;
        if (station.hasFlow) flow += 1;
        if (station.hasTemp) temp += 1;
        if (station.hasWq) wq += 1;

        riverRegistryRows.push({
          river_id: river.river_id,
          river_slug: river.river_slug,
          river_name: river.river_name,
          monitoring_location_id: station.monitoringLocationId,
          site_no: station.siteNo,
          station_name: station.stationName,
          latitude: station.latitude,
          longitude: station.longitude,
          parameter_codes: station.parameterCodes,
          has_flow: station.hasFlow,
          has_temp: station.hasTemp,
          has_wq: station.hasWq,
          metadata: station.metadata,
          ts_metadata: station.tsMetadata,
          checked_at: new Date().toISOString(),
          is_active: true,
        });
      }

      // Persist per-river so partial runs still save useful output.
      await upsertRegistryRows(riverRegistryRows);

      report.push({
        river: riverLabel,
        stations: seen.size,
        flow,
        temp,
        wq,
      });
      console.log(
        `[${idx}/${rivers.length}] done ${riverLabel} stations=${seen.size} flow=${flow} temp=${temp} wq=${wq}${timedOut ? " (timed out; partial)" : ""}`
      );
    } catch (error) {
      failedRivers.push({
        river: riverLabel,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`[${idx}/${rivers.length}] failed ${riverLabel}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
  }

  // Recompute best temp station mapping after registry refresh.
  const refreshRankings = await sb.rpc("refresh_river_temp_site_rankings", { p_river_id: null });
  if (refreshRankings.error) {
    throw new Error(`refresh_river_temp_site_rankings failed: ${refreshRankings.error.message}`);
  }
  const applyMapping = await sb.rpc("apply_best_temp_site_map", { p_river_id: null });
  if (applyMapping.error) {
    throw new Error(`apply_best_temp_site_map failed: ${applyMapping.error.message}`);
  }

  console.table(report);
  if (failedRivers.length > 0) {
    console.log("\nRivers skipped due to API/HTTP errors:");
    console.table(failedRivers);
  }
  if (skippedRivers.length > 0) {
    console.log("\nRivers skipped because registry is fresh:");
    console.table(skippedRivers);
  }
  const byCapability = report.reduce(
    (acc, r) => {
      acc.flow += r.flow;
      acc.temp += r.temp;
      acc.wq += r.wq;
      return acc;
    },
    { flow: 0, temp: 0, wq: 0 }
  );
  console.log(
    `\nUSGS station registry updated: rivers_total=${rivers.length}, rivers_synced=${report.length}, rivers_skipped_fresh=${skippedRivers.length}, ` +
      `flow_capable=${byCapability.flow}, temp_capable=${byCapability.temp}, wq_capable=${byCapability.wq}, ` +
      `river_errors=${failedRivers.length}`
  );

  const selectedResp = await sb
    .from("v_river_temp_station_selection")
    .select("river_name,flow_site_no,selected_temp_site_no,distance_to_river_m,on_river_alignment")
    .order("river_name", { ascending: true });
  if (!selectedResp.error && selectedResp.data) {
    console.log("\nSelected temp mapping by river:");
    console.table(selectedResp.data);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
