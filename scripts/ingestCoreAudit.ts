import 'dotenv/config';

type RiverRow = {
  id: string;
  slug: string;
  river_name: string | null;
  usgs_site_no: string | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
}

function obsDateMountain(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : now.toISOString().slice(0, 10);
}

async function sbFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase ${res.status} ${path}: ${txt}`);
  }
  return res;
}

async function createRun() {
  const res = await sbFetch('/rest/v1/usgs_pull_runs?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ cadence: 'manual-script', status: 'running' }),
  });
  const data = (await res.json()) as Array<{ id: string }>;
  if (!data[0]?.id) throw new Error('Failed to create usgs_pull_runs row');
  return data[0].id;
}

async function patchRun(runId: string, patch: Record<string, unknown>) {
  await sbFetch(`/rest/v1/usgs_pull_runs?id=eq.${runId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function getRivers(): Promise<RiverRow[]> {
  const res = await sbFetch('/rest/v1/rivers?select=id,slug,river_name,usgs_site_no&is_active=eq.true&usgs_site_no=not.is.null');
  return (await res.json()) as RiverRow[];
}

type Parsed = {
  flow_cfs: number | null;
  water_temp_f: number | null;
  gage_height_ft: number | null;
  source_flow_observed_at: string | null;
  source_temp_observed_at: string | null;
  source_gage_observed_at: string | null;
  source_parameter_codes: string[];
  raw_summary: Record<string, unknown>;
};

function parseUSGS(payload: any): Parsed {
  const series = payload?.value?.timeSeries ?? [];
  let flow: number | null = null;
  let tempF: number | null = null;
  let gage: number | null = null;
  let flowTs: string | null = null;
  let tempTs: string | null = null;
  let gageTs: string | null = null;
  const codes = new Set<string>();
  const raw: Record<string, unknown> = {};

  for (const ts of series) {
    const code = ts?.variable?.variableCode?.[0]?.value as string | undefined;
    if (!code) continue;
    codes.add(code);

    const vals = ts?.values?.[0]?.value ?? [];
    if (!Array.isArray(vals) || vals.length === 0) continue;
    const latest = vals[vals.length - 1];
    const v = Number(latest?.value);
    const dt = typeof latest?.dateTime === 'string' ? latest.dateTime : null;

    if (!Number.isFinite(v) || v <= -9990) {
      raw[code] = { observed_at: dt, value: null, qualifiers: latest?.qualifiers ?? [] };
      continue;
    }

    if (code === '00060') {
      flow = v;
      flowTs = dt;
    } else if (code === '00010') {
      tempF = v < -5 || v > 35 ? null : Number((((v * 9) / 5) + 32).toFixed(2));
      tempTs = dt;
    } else if (code === '00065') {
      gage = v;
      gageTs = dt;
    }

    raw[code] = {
      observed_at: dt,
      value: v,
      qualifiers: latest?.qualifiers ?? [],
      unit: ts?.variable?.unit?.unitCode ?? null,
    };
  }

  return {
    flow_cfs: flow,
    water_temp_f: tempF,
    gage_height_ft: gage,
    source_flow_observed_at: flowTs,
    source_temp_observed_at: tempTs,
    source_gage_observed_at: gageTs,
    source_parameter_codes: Array.from(codes),
    raw_summary: raw,
  };
}

async function fetchUSGS(site: string): Promise<{ status: number; parsed: Parsed }> {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(site)}&parameterCd=00060,00010,00065&siteStatus=all`;
  const res = await fetch(url);
  const status = res.status;
  if (!res.ok) {
    throw new Error(`USGS ${status}`);
  }
  const data = await res.json();
  return { status, parsed: parseUSGS(data) };
}

async function upsertRiverDaily(riverId: string, date: string, parsed: Parsed) {
  await sbFetch('/rest/v1/river_daily?on_conflict=river_id,obs_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      river_id: riverId,
      obs_date: date,
      source: 'usgs_iv_script',
      flow_cfs: parsed.flow_cfs,
      water_temp_f: parsed.water_temp_f,
      gage_height_ft: parsed.gage_height_ft,
      source_flow_observed_at: parsed.source_flow_observed_at,
      source_temp_observed_at: parsed.source_temp_observed_at,
      source_gage_observed_at: parsed.source_gage_observed_at,
      source_parameter_codes: parsed.source_parameter_codes,
      source_payload: parsed.raw_summary,
    }),
  });
}

async function insertSiteLog(input: Record<string, unknown>) {
  await sbFetch('/rest/v1/usgs_pull_sites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function refreshMetrics(date: string) {
  try {
    await sbFetch('/rest/v1/rpc/refresh_river_daily_metrics', {
      method: 'POST',
      body: JSON.stringify({ p_obs_date: date }),
    });
  } catch (e) {
    console.warn('refresh_river_daily_metrics failed:', e instanceof Error ? e.message : e);
  }
}

async function main() {
  const date = obsDateMountain();
  const runId = await createRun();
  const rivers = await getRivers();

  let ok = 0;
  let failed = 0;

  for (const r of rivers) {
    const site = r.usgs_site_no?.trim();
    if (!site) continue;

    try {
      const { status, parsed } = await fetchUSGS(site);
      await upsertRiverDaily(r.id, date, parsed);
      await insertSiteLog({
        run_id: runId,
        river_id: r.id,
        usgs_site_no: site,
        obs_date: date,
        status: 'success',
        http_status: status,
        flow_cfs: parsed.flow_cfs,
        water_temp_f: parsed.water_temp_f,
        gage_height_ft: parsed.gage_height_ft,
        source_flow_observed_at: parsed.source_flow_observed_at,
        source_temp_observed_at: parsed.source_temp_observed_at,
        source_gage_observed_at: parsed.source_gage_observed_at,
        parameter_codes: parsed.source_parameter_codes,
        raw_summary: parsed.raw_summary,
      });
      ok++;
      console.log(`ok ${r.slug} (${site}) flow=${parsed.flow_cfs ?? 'null'} temp=${parsed.water_temp_f ?? 'null'}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      await insertSiteLog({
        run_id: runId,
        river_id: r.id,
        usgs_site_no: site,
        obs_date: date,
        status: 'failed',
        error_message: msg,
      });
      console.error(`fail ${r.slug} (${site}): ${msg}`);
    }
  }

  await refreshMetrics(date);

  await patchRun(runId, {
    finished_at: new Date().toISOString(),
    status: failed === 0 ? 'success' : ok === 0 ? 'failed' : 'partial',
    sites_total: ok + failed,
    sites_ok: ok,
    sites_failed: failed,
  });

  console.log(`done run_id=${runId} date=${date} ok=${ok} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
