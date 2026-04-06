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

function toMountainHourStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  const h = parts.find((p) => p.type === "hour")?.value;
  if (!y || !m || !d || !h) return `${toMountainDate(now)}T00:00`;
  return `${y}-${m}-${d}T${h}:00`;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
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
  const obsHourStamp = toMountainHourStamp();
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
        `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover` +
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
      const hourlyTemp: number[] = data?.hourly?.temperature_2m ?? [];
      const hourlyWindDirection: number[] = data?.hourly?.wind_direction_10m ?? [];
      const hourlyWindGusts: number[] = data?.hourly?.wind_gusts_10m ?? [];
      const hourlyCloudCover: number[] = data?.hourly?.cloud_cover ?? [];

      const hourlyByDate = new Map<
        string,
        Array<{
          ts: string;
          hour: number;
          airTempF: number | null;
          windMph: number | null;
          windDirectionDeg: number | null;
          gustMph: number | null;
          cloudCoverPct: number | null;
        }>
      >();

      for (let i = 0; i < hourlyTimes.length; i++) {
        const ts = hourlyTimes[i];
        if (!ts || ts.length < 13) continue;
        const date = ts.slice(0, 10);
        const hour = Number(ts.slice(11, 13));
        if (!Number.isFinite(hour)) continue;
        const bucket = hourlyByDate.get(date) ?? [];
        bucket.push({
          ts,
          hour,
          airTempF: Number.isFinite(hourlyTemp[i]) ? hourlyTemp[i] : null,
          windMph: Number.isFinite(hourlyWind[i]) ? hourlyWind[i] : null,
          windDirectionDeg: Number.isFinite(hourlyWindDirection[i]) ? hourlyWindDirection[i] : null,
          gustMph: Number.isFinite(hourlyWindGusts[i]) ? hourlyWindGusts[i] : null,
          cloudCoverPct: Number.isFinite(hourlyCloudCover[i]) ? hourlyCloudCover[i] : null,
        });
        hourlyByDate.set(date, bucket);
      }

      const dailyIndexByDate = new Map<string, number>();
      dailyTimes.forEach((date, index) => {
        if (date) dailyIndexByDate.set(date, index);
      });

      const targetDates = [0, 1, 2, 3]
        .map((offset) => addDaysToIsoDate(obsDate, offset))
        .filter((date) => dailyIndexByDate.has(date));

      const rowsToUpsert = targetDates.map((date) => {
          const index = dailyIndexByDate.get(date)!;
          const samples = hourlyByDate.get(date) ?? [];

          let amSum = 0;
          let amN = 0;
          let pmSum = 0;
          let pmN = 0;
          let cloudSum = 0;
          let cloudN = 0;
          let gustMax: number | null = null;
          let representative = samples.find((sample) => sample.ts === `${date}T12:00`) ?? null;

          for (const sample of samples) {
            if (sample.windMph != null && sample.hour >= 6 && sample.hour <= 11) {
              amSum += sample.windMph;
              amN++;
            }
            if (sample.windMph != null && sample.hour >= 12 && sample.hour <= 18) {
              pmSum += sample.windMph;
              pmN++;
            }
            if (sample.cloudCoverPct != null) {
              cloudSum += sample.cloudCoverPct;
              cloudN++;
            }
            if (sample.gustMph != null) {
              gustMax = gustMax == null ? sample.gustMph : Math.max(gustMax, sample.gustMph);
            }
          }

          if (date === obsDate) {
            representative =
              [...samples]
                .filter((sample) => sample.ts <= obsHourStamp)
                .sort((a, b) => a.ts.localeCompare(b.ts))
                .at(-1) ??
              representative;
          }

          const air_temp_high_f = Number.isFinite(tmaxArr[index]) ? tmaxArr[index] : null;
          const air_temp_low_f = Number.isFinite(tminArr[index]) ? tminArr[index] : null;
          const precip_mm = Number.isFinite(precipArr[index]) ? precipArr[index] : null;
          const precip_probability_pct = Number.isFinite(precipProbArr[index]) ? precipProbArr[index] : null;
          const wind_speed_max_mph = Number.isFinite(windMaxArr[index]) ? windMaxArr[index] : null;

          return {
            river_id: river.id,
            date,
            wind_am_mph: amN > 0 ? Number((amSum / amN).toFixed(1)) : null,
            wind_pm_mph: pmN > 0 ? Number((pmSum / pmN).toFixed(1)) : null,
            air_temp_f: representative?.airTempF ?? null,
            wind_direction_deg: representative?.windDirectionDeg ?? null,
            gust_mph: gustMax,
            cloud_cover_pct: cloudN > 0 ? Number((cloudSum / cloudN).toFixed(0)) : null,
            observed_at: date === obsDate ? new Date().toISOString() : null,
            air_temp_high_f,
            air_temp_low_f,
            precip_mm,
            precip_probability_pct,
            wind_speed_max_mph,
          };
        });

      const upsert = await sb.from("weather_daily").upsert(rowsToUpsert, { onConflict: "river_id,date" });
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
