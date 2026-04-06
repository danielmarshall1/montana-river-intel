import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type CatalogSite = {
  siteNo: string;
  stationName: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  active: boolean;
  hasIv: boolean;
  hasDv: boolean;
  parameterCodes: Set<string>;
  rowCount: number;
};

type RdbRow = Record<string, string>;

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const STATE_LIST = (process.env.USGS_SITE_STATES ?? "MT")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const SITE_STATUS = process.env.USGS_SITE_STATUS ?? "active";
const ENABLE_SERIES_CATALOG = (process.env.USGS_SITE_SERIES_CATALOG ?? "true").toLowerCase() !== "false";
const REQUEST_TIMEOUT_MS = Number(process.env.USGS_SITE_TIMEOUT_MS ?? "90000");
const CHUNK_SIZE = Number(process.env.USGS_SITE_UPSERT_CHUNK ?? "1000");
const DRY_RUN = (process.env.USGS_SITE_DRY_RUN ?? "false").toLowerCase() === "true";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function asNum(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseRdb(text: string): RdbRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("#")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0 || headerIndex + 2 > lines.length) {
    return [];
  }

  const headers = lines[headerIndex].split("\t");
  const dataStart = headerIndex + 2; // skip dtype line

  const rows: RdbRow[] = [];
  for (let i = dataStart; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    const row: RdbRow = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function selectCol(row: RdbRow, candidates: string[]): string | undefined {
  for (const col of candidates) {
    const value = row[col];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

async function fetchStateSeries(stateCd: string): Promise<RdbRow[]> {
  const url = new URL("https://waterservices.usgs.gov/nwis/site/");
  url.searchParams.set("format", "rdb");
  url.searchParams.set("stateCd", stateCd);
  url.searchParams.set("siteStatus", SITE_STATUS);
  if (ENABLE_SERIES_CATALOG) {
    url.searchParams.set("seriesCatalogOutput", "true");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const resp = await fetch(url, { method: "GET", signal: controller.signal });
  clearTimeout(timeout);

  if (!resp.ok) {
    throw new Error(`USGS site service HTTP ${resp.status} for state ${stateCd}`);
  }

  const text = await resp.text();
  return parseRdb(text);
}

async function main() {
  const runStart = await sb
    .from("usgs_site_catalog_runs")
    .insert({ status: "running" })
    .select("run_id")
    .single();

  if (runStart.error || !runStart.data?.run_id) {
    throw new Error(`Failed to create catalog run: ${runStart.error?.message ?? "unknown error"}`);
  }

  const runId = runStart.data.run_id as string;

  try {
    const aggregated = new Map<string, CatalogSite>();

    for (const stateCd of STATE_LIST) {
      const rows = await fetchStateSeries(stateCd);
      for (const row of rows) {
        const siteNo = selectCol(row, ["site_no", "site_no_cd"]);
        if (!siteNo) continue;

        const stationName = selectCol(row, ["station_nm", "site_nm"]) ?? null;
        const lat = asNum(selectCol(row, ["dec_lat_va", "dec_lat"]));
        const lon = asNum(selectCol(row, ["dec_long_va", "dec_long"]));
        const state = (selectCol(row, ["state_cd", "state"]) ?? stateCd ?? null) as string | null;
        const dataType = (selectCol(row, ["data_type_cd", "data_type"]) ?? "").toLowerCase();
        const parmCd = selectCol(row, ["parm_cd", "parameter_cd", "parameterCode"]);

        const existing = aggregated.get(siteNo) ?? {
          siteNo,
          stationName,
          state,
          lat,
          lon,
          active: SITE_STATUS.toLowerCase() !== "inactive",
          hasIv: false,
          hasDv: false,
          parameterCodes: new Set<string>(),
          rowCount: 0,
        };

        if (!existing.stationName && stationName) existing.stationName = stationName;
        if (!existing.state && state) existing.state = state;
        if (existing.lat == null && lat != null) existing.lat = lat;
        if (existing.lon == null && lon != null) existing.lon = lon;

        if (dataType === "iv") existing.hasIv = true;
        if (dataType === "dv") existing.hasDv = true;
        if (parmCd) existing.parameterCodes.add(parmCd);

        existing.rowCount += 1;
        aggregated.set(siteNo, existing);
      }
    }

    const rows = Array.from(aggregated.values()).map((s) => ({
      site_no: s.siteNo,
      station_name: s.stationName,
      state: s.state,
      lat: s.lat,
      lon: s.lon,
      active: s.active,
      has_iv: s.hasIv,
      has_dv: s.hasDv,
      parameter_codes: Array.from(s.parameterCodes).sort(),
      last_seen_at: new Date().toISOString(),
      source: {
        source: "usgs_site_service_rdb",
        states: STATE_LIST,
        row_count: s.rowCount,
        series_catalog_output: ENABLE_SERIES_CATALOG,
      },
    }));

    if (!DRY_RUN) {
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await sb.from("usgs_sites").upsert(chunk, { onConflict: "site_no" });
        if (error) throw new Error(`upsert usgs_sites failed at chunk ${i / CHUNK_SIZE + 1}: ${error.message}`);
      }
    }

    const ok = rows.length;
    const failed = 0;

    await sb
      .from("usgs_site_catalog_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        stations_total: rows.length,
        ok,
        failed,
      })
      .eq("run_id", runId);

    console.table(
      STATE_LIST.map((state) => ({ state }))
    );
    console.log(
      `USGS catalog sync complete: run_id=${runId}, stations_total=${rows.length}, dry_run=${DRY_RUN}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sb
      .from("usgs_site_catalog_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("run_id", runId);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
