import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type RiverRow = {
  id: string;
  slug: string | null;
  river_name: string | null;
  usgs_site_no: string | null;
  is_active: boolean | null;
};

type ParsedUSGS = {
  flowCfs: number | null;
  waterTempF: number | null;
  gageHeightFt: number | null;
  flowObservedAt: string | null;
  tempObservedAt: string | null;
  gageObservedAt: string | null;
  parameterCodes: string[];
  rawSummary: Record<string, unknown>;
};

function toMountainObsDate(now = new Date()): string {
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

function parseUSGSTimeSeries(payload: any): ParsedUSGS {
  const series = payload?.value?.timeSeries ?? [];

  let flowCfs: number | null = null;
  let waterTempF: number | null = null;
  let gageHeightFt: number | null = null;

  let flowObservedAt: string | null = null;
  let tempObservedAt: string | null = null;
  let gageObservedAt: string | null = null;

  const parameterCodes = new Set<string>();
  const rawSummary: Record<string, unknown> = {};

  for (const ts of series) {
    const code: string | undefined = ts?.variable?.variableCode?.[0]?.value;
    if (!code) continue;
    parameterCodes.add(code);

    const values = ts?.values?.[0]?.value ?? [];
    if (!Array.isArray(values) || values.length === 0) continue;

    const latest = values[values.length - 1] ?? {};
    const rawValue = Number(latest?.value);
    const observedAt = typeof latest?.dateTime === "string" ? latest.dateTime : null;

    if (!Number.isFinite(rawValue) || rawValue <= -9990) {
      rawSummary[code] = { observed_at: observedAt, value: null, qualifiers: latest?.qualifiers ?? [] };
      continue;
    }

    if (code === "00060") {
      flowCfs = rawValue;
      flowObservedAt = observedAt;
    } else if (code === "00010") {
      const c = rawValue;
      waterTempF = c < -5 || c > 35 ? null : Number(((c * 9) / 5 + 32).toFixed(2));
      tempObservedAt = observedAt;
    } else if (code === "00065") {
      gageHeightFt = rawValue;
      gageObservedAt = observedAt;
    }

    rawSummary[code] = {
      observed_at: observedAt,
      value: rawValue,
      qualifiers: latest?.qualifiers ?? [],
      unit: ts?.variable?.unit?.unitCode ?? null,
      description: ts?.variable?.variableDescription ?? null,
    };
  }

  return {
    flowCfs,
    waterTempF,
    gageHeightFt,
    flowObservedAt,
    tempObservedAt,
    gageObservedAt,
    parameterCodes: Array.from(parameterCodes),
    rawSummary,
  };
}

async function fetchUSGS(siteNo: string): Promise<{ parsed: ParsedUSGS; status: number }> {
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(siteNo)}` +
    "&parameterCd=00060,00010,00065&siteStatus=all";

  const resp = await fetch(url, { method: "GET" });
  const status = resp.status;
  if (!resp.ok) throw new Error(`USGS HTTP ${status}`);

  const body = await resp.json();
  return { parsed: parseUSGSTimeSeries(body), status };
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

  const cadence = req.headers.get("x-mri-cadence") ?? "manual";
  const obsDate = toMountainObsDate();

  const sb = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const runInsert = await sb
    .from("usgs_pull_runs")
    .insert({ cadence, status: "running" })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data?.id) {
    return new Response(JSON.stringify({ error: "Failed to create ingestion run", details: runInsert.error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const runId = runInsert.data.id as string;

  const riversResp = await sb
    .from("rivers")
    .select("id,slug,river_name,usgs_site_no,is_active")
    .eq("is_active", true)
    .not("usgs_site_no", "is", null)
    .order("id", { ascending: true });

  if (riversResp.error) {
    await sb
      .from("usgs_pull_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_message: riversResp.error.message })
      .eq("id", runId);

    return new Response(JSON.stringify({ error: "Failed to load rivers", details: riversResp.error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rivers = (riversResp.data ?? []) as RiverRow[];
  let okCount = 0;
  let failCount = 0;

  for (const river of rivers) {
    const siteNo = river.usgs_site_no?.trim();
    if (!siteNo) continue;

    try {
      const { parsed, status } = await fetchUSGS(siteNo);

      const upsertResp = await sb.from("river_daily").upsert(
        {
          river_id: river.id,
          obs_date: obsDate,
          source: "usgs_iv",
          flow_cfs: parsed.flowCfs,
          water_temp_f: parsed.waterTempF,
          gage_height_ft: parsed.gageHeightFt,
          source_flow_observed_at: parsed.flowObservedAt,
          source_temp_observed_at: parsed.tempObservedAt,
          source_gage_observed_at: parsed.gageObservedAt,
          source_parameter_codes: parsed.parameterCodes,
          source_payload: parsed.rawSummary,
        },
        { onConflict: "river_id,obs_date" }
      );

      if (upsertResp.error) {
        throw new Error(`river_daily upsert failed: ${upsertResp.error.message}`);
      }

      const siteLogResp = await sb.from("usgs_pull_sites").insert({
        run_id: runId,
        river_id: river.id,
        usgs_site_no: siteNo,
        obs_date: obsDate,
        status: "success",
        http_status: status,
        flow_cfs: parsed.flowCfs,
        water_temp_f: parsed.waterTempF,
        gage_height_ft: parsed.gageHeightFt,
        source_flow_observed_at: parsed.flowObservedAt,
        source_temp_observed_at: parsed.tempObservedAt,
        source_gage_observed_at: parsed.gageObservedAt,
        parameter_codes: parsed.parameterCodes,
        raw_summary: parsed.rawSummary,
      });

      if (siteLogResp.error) {
        throw new Error(`site log insert failed: ${siteLogResp.error.message}`);
      }

      okCount += 1;
    } catch (err) {
      failCount += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await sb.from("usgs_pull_sites").insert({
        run_id: runId,
        river_id: river.id,
        usgs_site_no: siteNo,
        obs_date: obsDate,
        status: "failed",
        error_message: msg,
      });
    }
  }

  await sb.rpc("refresh_river_daily_metrics", { p_obs_date: obsDate });

  const finalStatus = failCount === 0 ? "success" : okCount === 0 ? "failed" : "partial";

  const runUpdate = await sb
    .from("usgs_pull_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: finalStatus,
      sites_total: okCount + failCount,
      sites_ok: okCount,
      sites_failed: failCount,
    })
    .eq("id", runId);

  if (runUpdate.error) {
    return new Response(JSON.stringify({
      run_id: runId,
      warning: "Ingest complete but run summary update failed",
      error: runUpdate.error.message,
      obs_date: obsDate,
      sites_ok: okCount,
      sites_failed: failCount,
    }), {
      status: 207,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      run_id: runId,
      status: finalStatus,
      obs_date: obsDate,
      sites_total: okCount + failCount,
      sites_ok: okCount,
      sites_failed: failCount,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
