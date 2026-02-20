import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type RiverRow = {
  id: string;
  slug: string | null;
  river_name: string | null;
  usgs_site_no: string | null;
  is_active: boolean | null;
};

type RiverParamMapRow = {
  river_id: string;
  flow_site_no: string | null;
  temp_site_no: string | null;
  stage_site_no: string | null;
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
  hasTempSeries: boolean;
  hourlyRows: Array<{
    observedAt: string;
    flowCfs: number | null;
    waterTempF: number | null;
    gageHeightFt: number | null;
  }>;
};

type ParsedDVTemp = {
  hasTempSeries: boolean;
  waterTempF: number | null;
  observedAt: string | null;
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

function cToF(c: number): number {
  return Number(((c * 9) / 5 + 32).toFixed(2));
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
  const hourlyByTs = new Map<string, {
    observedAt: string;
    flowCfs: number | null;
    waterTempF: number | null;
    gageHeightFt: number | null;
  }>();

  let hasTempSeries = false;

  for (const ts of series) {
    const code: string | undefined = ts?.variable?.variableCode?.[0]?.value;
    if (!code) continue;
    parameterCodes.add(code);

    const values = ts?.values?.[0]?.value ?? [];
    if (!Array.isArray(values) || values.length === 0) continue;

    if (code === "00010") {
      hasTempSeries = true;
    }

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
      waterTempF = rawValue < -5 || rawValue > 35 ? null : cToF(rawValue);
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

    for (const point of values) {
      const tsValue = typeof point?.dateTime === "string" ? point.dateTime : null;
      if (!tsValue) continue;

      const n = Number(point?.value);
      const valid = Number.isFinite(n) && n > -9990;
      const row = hourlyByTs.get(tsValue) ?? {
        observedAt: tsValue,
        flowCfs: null,
        waterTempF: null,
        gageHeightFt: null,
      };

      if (valid) {
        if (code === "00060") {
          row.flowCfs = n;
        } else if (code === "00010") {
          row.waterTempF = n < -5 || n > 35 ? null : cToF(n);
        } else if (code === "00065") {
          row.gageHeightFt = n;
        }
      }

      hourlyByTs.set(tsValue, row);
    }
  }

  const hourlyRows = Array.from(hourlyByTs.values())
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())
    .slice(-72);

  return {
    flowCfs,
    waterTempF,
    gageHeightFt,
    flowObservedAt,
    tempObservedAt,
    gageObservedAt,
    parameterCodes: Array.from(parameterCodes),
    rawSummary,
    hasTempSeries,
    hourlyRows,
  };
}

function parseUSGSDVTemp(payload: any): ParsedDVTemp {
  const series = payload?.value?.timeSeries ?? [];
  if (!Array.isArray(series) || series.length === 0) {
    return { hasTempSeries: false, waterTempF: null, observedAt: null };
  }

  const ts = series.find((s: any) => s?.variable?.variableCode?.[0]?.value === "00010") ?? series[0];
  const values = ts?.values?.[0]?.value ?? [];
  if (!Array.isArray(values) || values.length === 0) {
    return { hasTempSeries: true, waterTempF: null, observedAt: null };
  }

  const latest = values[values.length - 1] ?? {};
  const rawValue = Number(latest?.value);
  const observedAt = typeof latest?.dateTime === "string" ? latest.dateTime : null;
  if (!Number.isFinite(rawValue) || rawValue <= -9990 || rawValue < -5 || rawValue > 35) {
    return { hasTempSeries: true, waterTempF: null, observedAt };
  }

  return {
    hasTempSeries: true,
    waterTempF: cToF(rawValue),
    observedAt,
  };
}

async function fetchUSGSIv(siteNo: string, parameterCd: string): Promise<{ parsed: ParsedUSGS; status: number }> {
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(siteNo)}` +
    `&parameterCd=${encodeURIComponent(parameterCd)}&siteStatus=all`;

  const resp = await fetch(url, { method: "GET" });
  const status = resp.status;
  if (!resp.ok) throw new Error(`USGS IV HTTP ${status}`);

  const body = await resp.json();
  return { parsed: parseUSGSTimeSeries(body), status };
}

async function fetchUSGSDVTemp(siteNo: string): Promise<{ parsed: ParsedDVTemp; status: number }> {
  const url =
    `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${encodeURIComponent(siteNo)}` +
    "&parameterCd=00010&siteStatus=all&period=P14D";

  const resp = await fetch(url, { method: "GET" });
  const status = resp.status;
  if (!resp.ok) throw new Error(`USGS DV HTTP ${status}`);

  const body = await resp.json();
  return { parsed: parseUSGSDVTemp(body), status };
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

  const riverMapResp = await sb
    .from("river_usgs_map")
    .select("river_id,flow_site_no,temp_site_no,stage_site_no");

  const riverMap = new Map<string, RiverParamMapRow>();
  if (!riverMapResp.error && riverMapResp.data) {
    for (const row of riverMapResp.data as RiverParamMapRow[]) {
      riverMap.set(String(row.river_id), row);
    }
  }

  const rivers = (riversResp.data ?? []) as RiverRow[];
  let okCount = 0;
  let failCount = 0;

  for (const river of rivers) {
    const defaultSiteNo = river.usgs_site_no?.trim();
    if (!defaultSiteNo) continue;

    try {
      const mapRow = riverMap.get(river.id);
      const flowSiteNo = (mapRow?.flow_site_no ?? defaultSiteNo).trim();
      const tempSiteNo = (mapRow?.temp_site_no ?? flowSiteNo).trim();

      const { parsed: mainIv, status } = await fetchUSGSIv(flowSiteNo, "00060,00010,00065");

      let tempValue = mainIv.waterTempF;
      let tempObservedAt = mainIv.tempObservedAt;
      let tempSource = "IV";
      let hasTempIv = mainIv.hasTempSeries;
      let hasTempDv = false;

      if (tempSiteNo !== flowSiteNo && tempValue == null) {
        const ivTempOnly = await fetchUSGSIv(tempSiteNo, "00010");
        hasTempIv = hasTempIv || ivTempOnly.parsed.hasTempSeries;
        if (ivTempOnly.parsed.waterTempF != null) {
          tempValue = ivTempOnly.parsed.waterTempF;
          tempObservedAt = ivTempOnly.parsed.tempObservedAt;
          tempSource = "IV_TEMP_SITE";
          if (!mainIv.parameterCodes.includes("00010")) {
            mainIv.parameterCodes.push("00010(TEMP_SITE)");
          }
        }
      }

      if (tempValue == null) {
        try {
          const dvTemp = await fetchUSGSDVTemp(tempSiteNo);
          hasTempDv = dvTemp.parsed.hasTempSeries;
          if (dvTemp.parsed.waterTempF != null) {
            tempValue = dvTemp.parsed.waterTempF;
            tempObservedAt = dvTemp.parsed.observedAt;
            tempSource = "DV_FALLBACK";
            if (!mainIv.parameterCodes.includes("00010(DV)")) {
              mainIv.parameterCodes.push("00010(DV)");
            }
          }
        } catch {
          hasTempDv = false;
        }
      }

      mainIv.rawSummary.temp_source = tempSource;
      mainIv.rawSummary.temp_site_no = tempSiteNo;
      mainIv.rawSummary.flow_site_no = flowSiteNo;
      if (tempValue == null && !hasTempIv && !hasTempDv) {
        mainIv.rawSummary.temp_status = "not_available";
      }

      const upsertResp = await sb.from("river_daily").upsert(
        {
          river_id: river.id,
          obs_date: obsDate,
          source: "usgs_iv",
          flow_cfs: mainIv.flowCfs,
          water_temp_f: tempValue,
          gage_height_ft: mainIv.gageHeightFt,
          source_flow_observed_at: mainIv.flowObservedAt,
          source_temp_observed_at: tempObservedAt,
          source_gage_observed_at: mainIv.gageObservedAt,
          source_parameter_codes: mainIv.parameterCodes,
          source_payload: mainIv.rawSummary,
        },
        { onConflict: "river_id,obs_date" }
      );

      if (upsertResp.error) {
        throw new Error(`river_daily upsert failed: ${upsertResp.error.message}`);
      }

      if (mainIv.hourlyRows.length > 0) {
        const hourlyPayload = mainIv.hourlyRows.map((row) => {
          const obsTs = new Date(row.observedAt);
          const hourlyObsDate = toMountainObsDate(obsTs);
          return {
            river_id: river.id,
            observed_at: row.observedAt,
            obs_date: hourlyObsDate,
            flow_cfs: row.flowCfs,
            water_temp_f: row.waterTempF,
            gage_height_ft: row.gageHeightFt,
            source: "usgs_iv",
          };
        });

        const hourlyUpsert = await sb
          .from("river_hourly")
          .upsert(hourlyPayload, { onConflict: "river_id,observed_at" });

        if (hourlyUpsert.error) {
          mainIv.rawSummary.hourly_upsert_error = hourlyUpsert.error.message;
        }
      }

      const paramUpsert = await sb
        .from("usgs_site_parameters")
        .upsert(
          {
            site_no: tempSiteNo,
            has_temp_iv: hasTempIv,
            has_temp_dv: hasTempDv,
            checked_at: new Date().toISOString(),
          },
          { onConflict: "site_no" }
        );

      if (paramUpsert.error) {
        mainIv.rawSummary.site_parameter_upsert_error = paramUpsert.error.message;
      }

      const siteLogResp = await sb.from("usgs_pull_sites").insert({
        run_id: runId,
        river_id: river.id,
        usgs_site_no: flowSiteNo,
        obs_date: obsDate,
        status: "success",
        http_status: status,
        flow_cfs: mainIv.flowCfs,
        water_temp_f: tempValue,
        gage_height_ft: mainIv.gageHeightFt,
        source_flow_observed_at: mainIv.flowObservedAt,
        source_temp_observed_at: tempObservedAt,
        source_gage_observed_at: mainIv.gageObservedAt,
        parameter_codes: mainIv.parameterCodes,
        raw_summary: mainIv.rawSummary,
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
        usgs_site_no: defaultSiteNo,
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
