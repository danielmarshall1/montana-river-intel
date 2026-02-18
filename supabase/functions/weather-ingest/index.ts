import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type RiverRow = {
  id: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean | null;
};

type WeatherRunRow = {
  id: string;
};

function toMountainDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return now.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const obsDate = toMountainDate();
  const cadence = req.headers.get("x-mri-cadence") ?? "manual";

  const runInsert = await sb
    .from("weather_pull_runs")
    .insert({ status: "running", cadence })
    .select("id")
    .single<WeatherRunRow>();

  if (runInsert.error || !runInsert.data?.id) {
    return new Response(JSON.stringify({ error: "Failed to create weather run", details: runInsert.error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const runId = runInsert.data.id;

  const riversResp = await sb
    .from("rivers")
    .select("id,slug,latitude,longitude,is_active")
    .eq("is_active", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("id", { ascending: true });

  if (riversResp.error) {
    await sb
      .from("weather_pull_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: riversResp.error.message,
      })
      .eq("id", runId);

    return new Response(JSON.stringify({ error: riversResp.error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rivers = (riversResp.data ?? []) as RiverRow[];
  let ok = 0;
  let fail = 0;
  const errors: Array<{ river_id: string; slug: string | null; error: string }> = [];

  for (const river of rivers) {
    try {
      const lat = river.latitude;
      const lon = river.longitude;
      if (lat == null || lon == null) continue;

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
        `&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=mm&timezone=America%2FDenver`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`);
      const data = await resp.json();

      const dailyTimes: string[] = data?.daily?.time ?? [];
      const tmaxArr: number[] = data?.daily?.temperature_2m_max ?? [];
      const tminArr: number[] = data?.daily?.temperature_2m_min ?? [];
      const precipArr: number[] = data?.daily?.precipitation_sum ?? [];
      const precipProbArr: number[] = data?.daily?.precipitation_probability_max ?? [];
      const windMaxArr: number[] = data?.daily?.wind_speed_10m_max ?? [];
      const hourlyTimes: string[] = data?.hourly?.time ?? [];
      const hourlyWind: number[] = data?.hourly?.wind_speed_10m ?? data?.hourly?.windspeed_10m ?? [];

      let dIdx = dailyTimes.findIndex((d) => d === obsDate);
      if (dIdx < 0) dIdx = 0;

      const air_temp_high_f = Number.isFinite(tmaxArr[dIdx]) ? tmaxArr[dIdx] : null;
      const air_temp_low_f = Number.isFinite(tminArr[dIdx]) ? tminArr[dIdx] : null;
      const precip_mm = Number.isFinite(precipArr[dIdx]) ? precipArr[dIdx] : null;
      const precip_probability_pct = Number.isFinite(precipProbArr[dIdx]) ? precipProbArr[dIdx] : null;
      const wind_speed_max_mph = Number.isFinite(windMaxArr[dIdx]) ? windMaxArr[dIdx] : null;

      let amSum = 0;
      let amN = 0;
      let pmSum = 0;
      let pmN = 0;
      for (let i = 0; i < hourlyTimes.length; i++) {
        const ts = hourlyTimes[i];
        const w = hourlyWind[i];
        if (!ts || !ts.startsWith(obsDate) || !Number.isFinite(w)) continue;
        const hour = Number(ts.slice(11, 13));
        if (!Number.isFinite(hour)) continue;

        if (hour >= 6 && hour <= 11) {
          amSum += w;
          amN++;
        }
        if (hour >= 12 && hour <= 18) {
          pmSum += w;
          pmN++;
        }
      }

      const wind_am_mph = amN > 0 ? Number((amSum / amN).toFixed(1)) : null;
      const wind_pm_mph = pmN > 0 ? Number((pmSum / pmN).toFixed(1)) : null;

      const upsert = await sb.from("weather_daily").upsert(
        {
          river_id: river.id,
          date: obsDate,
          wind_am_mph,
          wind_pm_mph,
          air_temp_high_f,
          air_temp_low_f,
          precip_mm,
          precip_probability_pct,
          wind_speed_max_mph,
        },
        { onConflict: "river_id,date" }
      );
      if (upsert.error) throw new Error(upsert.error.message);

      ok += 1;
    } catch (error) {
      fail += 1;
      errors.push({
        river_id: river.id,
        slug: river.slug,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  // Recompute daily scores with weather penalties
  const scoreRun = await sb.rpc("compute_river_daily_scores", { p_obs_date: obsDate });

  const finalStatus = fail === 0 ? "success" : ok === 0 ? "failed" : "partial";
  await sb
    .from("weather_pull_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: finalStatus,
      rivers_total: rivers.length,
      rivers_ok: ok,
      rivers_failed: fail,
      error_message: scoreRun.error?.message ?? (errors[0]?.error ?? null),
    })
    .eq("id", runId);

  return new Response(
    JSON.stringify({
      run_id: runId,
      obs_date: obsDate,
      rivers_total: rivers.length,
      weather_ok: ok,
      weather_failed: fail,
      score_recompute_error: scoreRun.error?.message ?? null,
      errors: errors.slice(0, 10),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
