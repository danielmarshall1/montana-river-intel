// scripts/ingestDaily.ts
//
// End-to-end daily ingestion:
// 1) Fetch active rivers (includes lat/lon)
// 2) Fetch USGS IV (flow/temp/gage height)
// 3) Fetch Open-Meteo (wind AM/PM, air temp high/low, precip)
// 4) Upsert into river_daily_scores via upsert_river_daily_by_site
// 5) Run scoring RPC once at end: run_daily_scoring(today)
//
// Requirements:
// - .env.local contains SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// - Postgres RPC exists: upsert_river_daily_by_site(p_usgs_site_no, p_date, p_payload)
// - Postgres RPC exists: run_daily_scoring(p_date)

import "dotenv/config";

type RiverRow = {
  slug: string;
  usgs_site_no: string;
  latitude: number | null;
  longitude: number | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
}

function todayISO(): string {
  // Uses local machine timezone. That's fine because we consistently write YYYY-MM-DD.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function supabaseFetch(path: string, init: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text}`);
  }

  return res;
}

async function getActiveRivers(): Promise<RiverRow[]> {
  const res = await supabaseFetch(
    `/rest/v1/rivers?select=slug,usgs_site_no,latitude,longitude&is_active=eq.true`,
    { method: "GET" }
  );
  return (await res.json()) as RiverRow[];
}

async function upsertDaily(site: string, dateISO: string, payload: any) {
  await supabaseFetch(`/rest/v1/rpc/upsert_river_daily_by_site`, {
    method: "POST",
    body: JSON.stringify({
      p_usgs_site_no: site,
      p_date: dateISO,
      p_payload: payload,
    }),
  });
}

async function runDailyScoring(dateISO: string) {
  await supabaseFetch(`/rest/v1/rpc/run_daily_scoring`, {
    method: "POST",
    body: JSON.stringify({ p_date: dateISO }),
  });
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

async function fetchUSGSInstant(site: string): Promise<{
  flow_cfs: number | null;
  water_temp_f: number | null;
  gage_height_ft: number | null;
  qualifiers: any | null;
}> {
  // 00060 discharge (cfs), 00010 water temp (C), 00065 gage height (ft)
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}` +
    `&parameterCd=00060,00010,00065&siteStatus=all`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS IV error ${res.status}`);

  const data = await res.json();
  const series = data?.value?.timeSeries ?? [];

  let flow_cfs: number | null = null;
  let water_temp_f: number | null = null;
  let gage_height_ft: number | null = null;
  let qualifiers: any | null = null;

  for (const ts of series) {
    const code: string | undefined = ts?.variable?.variableCode?.[0]?.value;
    const values = ts?.values?.[0]?.value ?? [];
    if (!values.length) continue;

    const latest = values[values.length - 1];
    const rawVal = latest?.value;

    if (rawVal === undefined || rawVal === null || rawVal === "") continue;

    const num = Number(rawVal);
    if (!Number.isFinite(num)) continue;

    // Save qualifiers if present (for debugging / quality flags)
    if (latest?.qualifiers) qualifiers = latest.qualifiers;

    // Sentinels: USGS often uses -9999/-999999 for missing values
    if (num <= -9990) {
      if (code === "00010") water_temp_f = null;
      continue;
    }

    if (code === "00060") {
      flow_cfs = num;
    } else if (code === "00065") {
      gage_height_ft = num;
    } else if (code === "00010") {
      // sanity range in Celsius for MT winter rivers; adjust later if needed
      if (num < -5 || num > 35) {
        water_temp_f = null;
      } else {
        water_temp_f = Number(cToF(num).toFixed(2));
      }
    }
  }

  return { flow_cfs, water_temp_f, gage_height_ft, qualifiers };
}

async function fetchOpenMeteoDaily(lat: number, lon: number): Promise<{
  wind_am_mph: number | null;
  wind_pm_mph: number | null;
  air_temp_high_f: number | null;
  air_temp_low_f: number | null;
  precip_in: number | null;
}> {
  // Hourly for AM/PM wind, daily for high/low & precip sum.
  // Units: Fahrenheit, mph, inches. Timezone: America/New_York.
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,windspeed_10m,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch` +
    `&timezone=America%2FNew_York`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);

  const data = await res.json();

  // DEBUG: inspect Open-Meteo response shape
  console.log("[DEBUG] data.daily =", JSON.stringify(data?.daily ?? null, null, 2));
  console.log("[DEBUG] data.hourly.time[0:3] =", (data?.hourly?.time ?? []).slice(0, 3));
  console.log("[DEBUG] data.daily.time[0:3] =", (data?.daily?.time ?? []).slice(0, 3));

  // Hourly arrays aligned by index
  const times: string[] = data?.hourly?.time ?? [];
  const wind: number[] = data?.hourly?.windspeed_10m ?? [];

  // Daily arrays
  const dailyTimes: string[] = data?.daily?.time ?? [];
  const tmaxArr: number[] = data?.daily?.temperature_2m_max ?? [];
  const tminArr: number[] = data?.daily?.temperature_2m_min ?? [];
  const psumArr: number[] = data?.daily?.precipitation_sum ?? [];

  // Target day from Open-Meteo response (no reliance on local machine date)
  const targetDay =
    data?.daily?.time && data.daily.time.length
      ? data.daily.time[0]
      : todayISO();

  // Find index for targetDay in daily.time (America/New_York dates)
  let dailyIdx = dailyTimes.findIndex((d: string) => d === targetDay);
  if (dailyIdx < 0) dailyIdx = 0;

  const hi = tmaxArr[dailyIdx];
  const lo = tminArr[dailyIdx];
  const pr = psumArr[dailyIdx];

  const air_temp_high_f = Number.isFinite(hi) ? hi : null;
  const air_temp_low_f = Number.isFinite(lo) ? lo : null;
  const precip_in = Number.isFinite(pr) ? pr : null;

  // Hourly wind averages: only rows whose hourly time string starts with targetDay
  let amSum = 0,
    amN = 0;
  let pmSum = 0,
    pmN = 0;

  for (let i = 0; i < times.length; i++) {
    const ts = times[i];
    if (!ts || typeof ts !== "string" || ts.length < 13) continue;

    if (!ts.startsWith(targetDay)) continue;

    const hour = Number(ts.slice(11, 13));
    const w = wind[i];

    if (!Number.isFinite(hour) || !Number.isFinite(w)) continue;

    if (hour >= 6 && hour <= 11) {
      amSum += w;
      amN++;
    }
    if (hour >= 12 && hour <= 18) {
      pmSum += w;
      pmN++;
    }
  }

  const wind_am_mph = amN ? Number((amSum / amN).toFixed(1)) : null;
  const wind_pm_mph = pmN ? Number((pmSum / pmN).toFixed(1)) : null;

  return {
    wind_am_mph,
    wind_pm_mph,
    air_temp_high_f,
    air_temp_low_f,
    precip_in,
  };
}

async function main() {
  const date = todayISO();
  const rivers = await getActiveRivers();

  console.log(`Running ingestion for ${date}`);
  console.log(`Active rivers: ${rivers.length}`);

  let ok = 0;
  let fail = 0;

  for (const r of rivers) {
    try {
      const usgs = await fetchUSGSInstant(r.usgs_site_no);

      let weather: {
        wind_am_mph: number | null;
        wind_pm_mph: number | null;
        air_temp_high_f: number | null;
        air_temp_low_f: number | null;
        precip_in: number | null;
      } = {
        wind_am_mph: null,
        wind_pm_mph: null,
        air_temp_high_f: null,
        air_temp_low_f: null,
        precip_in: null,
      };

      if (
        typeof r.latitude === "number" &&
        Number.isFinite(r.latitude) &&
        typeof r.longitude === "number" &&
        Number.isFinite(r.longitude)
      ) {
        weather = await fetchOpenMeteoDaily(r.latitude, r.longitude);
      }

      const payload = {
        flow_cfs: usgs.flow_cfs,
        water_temp_f: usgs.water_temp_f,
        gage_height_ft: usgs.gage_height_ft,

        wind_am_mph: weather.wind_am_mph,
        wind_pm_mph: weather.wind_pm_mph,
        air_temp_high_f: weather.air_temp_high_f,
        air_temp_low_f: weather.air_temp_low_f,
        precip_in: weather.precip_in,

        source: {
          usgs_iv: true,
          open_meteo: true,
          fetched_at: new Date().toISOString(),
        },
        quality: {
          usgs_qualifiers: usgs.qualifiers,
        },
      };

      await upsertDaily(r.usgs_site_no, date, payload);
      ok++;
      console.log(`✅ ${r.slug}`);
    } catch (e: any) {
      fail++;
      console.error(`❌ ${r.slug}: ${e?.message ?? e}`);
    }
  }

  // Hardened: compute deltas, baselines, scoring in ONE call
  try {
    await runDailyScoring(date);
    console.log(`✅ run_daily_scoring(${date})`);
  } catch (e: any) {
    console.error(`❌ run_daily_scoring failed: ${e?.message ?? e}`);
  }

  console.log(`Done. ok=${ok}, fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});