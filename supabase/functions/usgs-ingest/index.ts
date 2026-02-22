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

type RiverRoleMapRow = {
  river_id: string;
  role: "flow" | "temp" | "stage" | "aux";
  site_no: string;
  priority: number | null;
  is_active: boolean | null;
};

type RiverStationConfigRow = {
  river_id: string;
  parameter_code: "00060" | "00010" | "WQ";
  site_no: string;
  priority: number | null;
  is_enabled: boolean | null;
};

type StationRegistryRow = {
  river_id: string;
  site_no: string | null;
  has_flow: boolean | null;
  has_temp: boolean | null;
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
  hasTempSeries: boolean;
  hourlyRows: Array<{
    observedAt: string;
    flowCfs: number | null;
    waterTempF: number | null;
    gageHeightFt: number | null;
  }>;
};

type ParsedDVParam = {
  hasSeries: boolean;
  value: number | null;
  observedAt: string | null;
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

function isObservationFresh(ts: string | null, maxAgeHours: number): boolean {
  if (!ts) return false;
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return false;
  const ageH = (Date.now() - ms) / (1000 * 60 * 60);
  return ageH <= maxAgeHours;
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
    const latestObservedAt = typeof latest?.dateTime === "string" ? latest.dateTime : null;
    let latestValid: any | null = null;
    for (let i = values.length - 1; i >= 0; i--) {
      const row = values[i] ?? {};
      const n = Number(row?.value);
      if (!Number.isFinite(n) || n <= -9990) continue;
      latestValid = row;
      break;
    }

    if (!latestValid) {
      rawSummary[code] = { observed_at: latestObservedAt, value: null, qualifiers: latest?.qualifiers ?? [] };
      continue;
    }

    const rawValue = Number(latestValid?.value);
    const observedAt = typeof latestValid?.dateTime === "string" ? latestValid.dateTime : latestObservedAt;

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
      qualifiers: latestValid?.qualifiers ?? latest?.qualifiers ?? [],
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
  const parsed = parseUSGSDVParam(payload, "00010");
  if (!parsed.hasSeries || parsed.value == null) {
    return {
      hasTempSeries: parsed.hasSeries,
      waterTempF: null,
      observedAt: parsed.observedAt,
    };
  }
  if (parsed.value < -5 || parsed.value > 35) {
    return {
      hasTempSeries: parsed.hasSeries,
      waterTempF: null,
      observedAt: parsed.observedAt,
    };
  }
  return { hasTempSeries: true, waterTempF: cToF(parsed.value), observedAt: parsed.observedAt };
}

function parseUSGSDVParam(payload: any, parameterCd: string): ParsedDVParam {
  const series = payload?.value?.timeSeries ?? [];
  if (!Array.isArray(series) || series.length === 0) {
    return { hasSeries: false, value: null, observedAt: null };
  }

  const ts = series.find((s: any) => s?.variable?.variableCode?.[0]?.value === parameterCd) ?? series[0];
  const values = ts?.values?.[0]?.value ?? [];
  if (!Array.isArray(values) || values.length === 0) {
    return { hasSeries: true, value: null, observedAt: null };
  }

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i] ?? {};
    const rawValue = Number(row?.value);
    const observedAt = typeof row?.dateTime === "string" ? row.dateTime : null;
    if (!Number.isFinite(rawValue) || rawValue <= -9990) {
      continue;
    }
    return { hasSeries: true, value: rawValue, observedAt };
  }

  const last = values[values.length - 1] ?? {};
  return {
    hasSeries: true,
    value: null,
    observedAt: typeof last?.dateTime === "string" ? last.dateTime : null,
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
    "&parameterCd=00010&siteStatus=all&period=P60D";

  const resp = await fetch(url, { method: "GET" });
  const status = resp.status;
  if (!resp.ok) throw new Error(`USGS DV HTTP ${status}`);

  const body = await resp.json();
  return { parsed: parseUSGSDVTemp(body), status };
}

async function fetchUSGSDVFlow(siteNo: string): Promise<{ parsed: ParsedDVParam; status: number }> {
  const url =
    `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${encodeURIComponent(siteNo)}` +
    "&parameterCd=00060&siteStatus=all&period=P14D";

  const resp = await fetch(url, { method: "GET" });
  const status = resp.status;
  if (!resp.ok) throw new Error(`USGS DV HTTP ${status}`);
  const body = await resp.json();
  return { parsed: parseUSGSDVParam(body, "00060"), status };
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

  const roleMapResp = await sb
    .from("river_usgs_map_roles")
    .select("river_id,role,site_no,priority,is_active")
    .eq("is_active", true);

  const roleMapByRiver = new Map<string, { flowSites: string[]; tempSites: string[]; stageSites: string[] }>();
  if (!roleMapResp.error && roleMapResp.data) {
    const sorted = (roleMapResp.data as RiverRoleMapRow[])
      .filter((row) => !!row.site_no)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const row of sorted) {
      const rid = String(row.river_id ?? "");
      const siteNo = String(row.site_no ?? "").trim();
      if (!rid || !siteNo) continue;
      const existing = roleMapByRiver.get(rid) ?? { flowSites: [], tempSites: [], stageSites: [] };
      if (row.role === "flow" && !existing.flowSites.includes(siteNo)) {
        existing.flowSites.push(siteNo);
      }
      if (row.role === "temp" && !existing.tempSites.includes(siteNo)) {
        existing.tempSites.push(siteNo);
      }
      if (row.role === "stage" && !existing.stageSites.includes(siteNo)) {
        existing.stageSites.push(siteNo);
      }
      roleMapByRiver.set(rid, existing);
    }
  }

  const stationConfigResp = await sb
    .from("river_station_parameter_config")
    .select("river_id,parameter_code,site_no,priority,is_enabled")
    .eq("is_enabled", true)
    .in("parameter_code", ["00060", "00010"]);

  const stationConfigByRiver = new Map<string, { flowSiteNo?: string; tempSiteNo?: string }>();
  if (!stationConfigResp.error && stationConfigResp.data) {
    const sorted = (stationConfigResp.data as RiverStationConfigRow[])
      .filter((row) => !!row.site_no)
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const row of sorted) {
      const rid = String(row.river_id ?? "");
      if (!rid) continue;
      const existing = stationConfigByRiver.get(rid) ?? {};
      if (row.parameter_code === "00060" && !existing.flowSiteNo) {
        existing.flowSiteNo = String(row.site_no).trim();
      }
      if (row.parameter_code === "00010" && !existing.tempSiteNo) {
        existing.tempSiteNo = String(row.site_no).trim();
      }
      stationConfigByRiver.set(rid, existing);
    }
  }

  const stationRegistryResp = await sb
    .from("usgs_station_registry")
    .select("river_id,site_no,has_flow,has_temp,is_active")
    .eq("is_active", true);

  const stationRegistryByRiver = new Map<string, { flowSites: string[]; tempSites: string[] }>();
  if (!stationRegistryResp.error && stationRegistryResp.data) {
    for (const row of stationRegistryResp.data as StationRegistryRow[]) {
      const rid = String(row.river_id ?? "");
      const siteNo = String(row.site_no ?? "").trim();
      if (!rid || !siteNo) continue;
      const existing = stationRegistryByRiver.get(rid) ?? { flowSites: [], tempSites: [] };
      if (row.has_flow && !existing.flowSites.includes(siteNo)) {
        existing.flowSites.push(siteNo);
      }
      if (row.has_temp && !existing.tempSites.includes(siteNo)) {
        existing.tempSites.push(siteNo);
      }
      stationRegistryByRiver.set(rid, existing);
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
      const roleMap = roleMapByRiver.get(river.id);
      const stationConfig = stationConfigByRiver.get(river.id);
      const stationRegistry = stationRegistryByRiver.get(river.id);
      const flowCandidates = [
        ...(roleMap?.flowSites ?? []),
        ...(stationConfig?.flowSiteNo ? [stationConfig.flowSiteNo] : []),
        ...(mapRow?.flow_site_no ? [mapRow.flow_site_no] : []),
        defaultSiteNo,
      ].filter((v, i, arr) => !!v && arr.indexOf(v) === i) as string[];
      const tempCandidates = [
        ...(roleMap?.tempSites ?? []),
        ...(stationConfig?.tempSiteNo ? [stationConfig.tempSiteNo] : []),
        ...(mapRow?.temp_site_no ? [mapRow.temp_site_no] : []),
      ].filter((v, i, arr) => !!v && arr.indexOf(v) === i) as string[];

      const flowSiteNo = String(flowCandidates[0] ?? defaultSiteNo).trim();
      const tempSiteNo = tempCandidates.length > 0 ? String(tempCandidates[0]).trim() : null;

      const { parsed: mainIv, status } = await fetchUSGSIv(flowSiteNo, "00060,00065");

      let flowValue = mainIv.flowCfs;
      let flowObservedAt = mainIv.flowObservedAt;
      let flowSource = "IV";
      let tempValue: number | null = null;
      let tempObservedAt: string | null = null;
      let tempSource: "IV" | "DV" | "NONE" = "NONE";
      let tempReason: string | null = null;
      let selectedTempSiteNo: string | null = null;
      let tempIsFresh = false;
      let hasTempIv = false;
      let hasTempDv = false;

      for (const candidate of tempCandidates) {
        if (tempValue != null) break;
        try {
          const ivTempOnly = await fetchUSGSIv(candidate, "00010");
          if (ivTempOnly.parsed.hasTempSeries) hasTempIv = true;
          if (ivTempOnly.parsed.waterTempF != null) {
            const isFresh = isObservationFresh(ivTempOnly.parsed.tempObservedAt, 72);
            if (isFresh) {
              tempValue = ivTempOnly.parsed.waterTempF;
              tempObservedAt = ivTempOnly.parsed.tempObservedAt;
              tempSource = "IV";
              selectedTempSiteNo = candidate;
              tempIsFresh = true;
              tempReason = null;
              if (!mainIv.parameterCodes.includes("00010(TEMP_SITE_IV)")) {
                mainIv.parameterCodes.push("00010(TEMP_SITE_IV)");
              }
              break;
            }
            if (tempValue == null) {
              tempValue = ivTempOnly.parsed.waterTempF;
              tempObservedAt = ivTempOnly.parsed.tempObservedAt;
              tempSource = "IV";
              selectedTempSiteNo = candidate;
              tempReason = "temp_observation_stale_or_missing";
              if (!mainIv.parameterCodes.includes("00010(TEMP_SITE_IV)")) {
                mainIv.parameterCodes.push("00010(TEMP_SITE_IV)");
              }
            }
          }
        } catch {
          // keep trying next temp candidate
        }
      }

      if (!tempIsFresh) {
        for (const candidate of tempCandidates) {
          try {
            const dvTemp = await fetchUSGSDVTemp(candidate);
            if (dvTemp.parsed.hasTempSeries) hasTempDv = true;
            if (dvTemp.parsed.waterTempF != null) {
              const isFresh = isObservationFresh(dvTemp.parsed.observedAt, 240);
              if (isFresh) {
                tempValue = dvTemp.parsed.waterTempF;
                tempObservedAt = dvTemp.parsed.observedAt;
                tempSource = "DV";
                selectedTempSiteNo = candidate;
                tempIsFresh = true;
                tempReason = null;
                if (!mainIv.parameterCodes.includes("00010(TEMP_SITE_DV)")) {
                  mainIv.parameterCodes.push("00010(TEMP_SITE_DV)");
                }
                break;
              }
              if (tempValue == null) {
                tempValue = dvTemp.parsed.waterTempF;
                tempObservedAt = dvTemp.parsed.observedAt;
                tempSource = "DV";
                selectedTempSiteNo = candidate;
                tempReason = "temp_observation_stale_or_missing";
                if (!mainIv.parameterCodes.includes("00010(TEMP_SITE_DV)")) {
                  mainIv.parameterCodes.push("00010(TEMP_SITE_DV)");
                }
              }
            }
          } catch {
            // keep trying next temp candidate
          }
        }
      }

      if (tempValue == null) {
        if (tempCandidates.length === 0) {
          tempReason = "no_temp_site_mapping";
        } else if (!hasTempIv && !hasTempDv) {
          tempReason = "no_00010_sites";
        } else {
          tempReason = "temp_observation_stale_or_missing";
        }
      } else if (!tempIsFresh) {
        tempReason = "temp_observation_stale_or_missing";
      }

      if (flowValue == null) {
        const fallbackFlowCandidates = (stationRegistry?.flowSites ?? []).filter((s) => s !== flowSiteNo);
        for (const candidate of fallbackFlowCandidates) {
          try {
            const altIv = await fetchUSGSIv(candidate, "00060");
            if (altIv.parsed.flowCfs == null) continue;
            if (!isObservationFresh(altIv.parsed.flowObservedAt, 72)) continue;
            flowValue = Number(altIv.parsed.flowCfs.toFixed(2));
            flowObservedAt = altIv.parsed.flowObservedAt;
            flowSource = "IV_REGISTRY_SITE";
            if (!mainIv.parameterCodes.includes("00060(REGISTRY)")) {
              mainIv.parameterCodes.push("00060(REGISTRY)");
            }
            mainIv.rawSummary.flow_site_no = candidate;
            break;
          } catch {
            // try next registry candidate
          }
        }
      }

      if (flowValue == null) {
        try {
          const dvFlow = await fetchUSGSDVFlow(flowSiteNo);
          if (dvFlow.parsed.value != null) {
            flowValue = Number(dvFlow.parsed.value.toFixed(2));
            flowObservedAt = dvFlow.parsed.observedAt;
            flowSource = "DV_FALLBACK";
            if (!mainIv.parameterCodes.includes("00060(DV)")) {
              mainIv.parameterCodes.push("00060(DV)");
            }
          }
        } catch {
          // keep null flow
        }
      }

      if (flowValue == null) {
        const fallbackFlowCandidates = (stationRegistry?.flowSites ?? []).filter((s) => s !== flowSiteNo);
        for (const candidate of fallbackFlowCandidates) {
          try {
            const dvFlow = await fetchUSGSDVFlow(candidate);
            if (dvFlow.parsed.value == null) continue;
            if (!isObservationFresh(dvFlow.parsed.observedAt, 240)) continue;
            flowValue = Number(dvFlow.parsed.value.toFixed(2));
            flowObservedAt = dvFlow.parsed.observedAt;
            flowSource = "DV_REGISTRY_FALLBACK";
            if (!mainIv.parameterCodes.includes("00060(DV_REGISTRY)")) {
              mainIv.parameterCodes.push("00060(DV_REGISTRY)");
            }
            mainIv.rawSummary.flow_site_no = candidate;
            break;
          } catch {
            // keep searching
          }
        }
      }

      if (flowValue != null) {
        const maxAge = flowSource === "DV_FALLBACK" ? 240 : 72;
        if (!isObservationFresh(flowObservedAt, maxAge)) {
          flowValue = null;
          flowObservedAt = null;
          flowSource = `${flowSource}_STALE`;
        }
      }

      mainIv.rawSummary.temp_source = tempSource;
      mainIv.rawSummary.flow_source = flowSource;
      mainIv.rawSummary.temp_site_no = selectedTempSiteNo ?? tempSiteNo;
      mainIv.rawSummary.flow_site_no = flowSiteNo;
      mainIv.rawSummary.temp_reason = tempReason;
      if (stationConfig?.flowSiteNo || stationConfig?.tempSiteNo) {
        mainIv.rawSummary.station_config_override = {
          flow_site_no: stationConfig?.flowSiteNo ?? null,
          temp_site_no: stationConfig?.tempSiteNo ?? null,
        };
      }
      mainIv.rawSummary.temp_policy = "strict_mapped_temp_site_only";
      if (!tempSiteNo) {
        mainIv.rawSummary.temp_status = "mapping_missing";
      } else if (tempValue == null && !hasTempIv && !hasTempDv) {
        mainIv.rawSummary.temp_status = "not_available";
      } else if (tempValue == null) {
        mainIv.rawSummary.temp_status = "missing_or_stale";
      } else if (!tempIsFresh) {
        mainIv.rawSummary.temp_status = "available_stale";
      } else {
        mainIv.rawSummary.temp_status = "available_fresh";
      }

      const upsertResp = await sb.from("river_daily").upsert(
        {
          river_id: river.id,
          obs_date: obsDate,
          source: "usgs_iv",
          flow_cfs: flowValue,
          water_temp_f: tempValue,
          gage_height_ft: mainIv.gageHeightFt,
          source_flow_observed_at: flowObservedAt,
          source_temp_observed_at: tempObservedAt,
          source_gage_observed_at: mainIv.gageObservedAt,
          flow_source_site_no: flowSiteNo,
          temp_source_site_no: selectedTempSiteNo ?? tempSiteNo,
          temp_source_kind: tempSource,
          temp_unavailable: tempValue == null,
          temp_reason: tempReason,
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

      const parameterRows = new Map<string, { has_temp_iv: boolean; has_temp_dv: boolean }>();
      for (const candidate of [flowSiteNo, ...(tempCandidates ?? [])]) {
        if (!candidate) continue;
        const prev = parameterRows.get(candidate) ?? { has_temp_iv: false, has_temp_dv: false };
        if (candidate === selectedTempSiteNo || candidate === tempSiteNo) {
          prev.has_temp_iv = prev.has_temp_iv || hasTempIv;
          prev.has_temp_dv = prev.has_temp_dv || hasTempDv;
        }
        parameterRows.set(candidate, prev);
      }
      if (parameterRows.size > 0) {
        const paramUpsert = await sb
          .from("usgs_site_parameters")
          .upsert(
            Array.from(parameterRows.entries()).map(([site_no, flags]) => ({
              site_no,
              has_temp_iv: flags.has_temp_iv,
              has_temp_dv: flags.has_temp_dv,
              checked_at: new Date().toISOString(),
            })),
            { onConflict: "site_no" }
          );

        if (paramUpsert.error) {
          mainIv.rawSummary.site_parameter_upsert_error = paramUpsert.error.message;
        }
      }

      const siteLogResp = await sb.from("usgs_pull_sites").insert({
        run_id: runId,
        river_id: river.id,
        usgs_site_no: flowSiteNo,
        obs_date: obsDate,
        status: "success",
        http_status: status,
        flow_cfs: flowValue,
        water_temp_f: tempValue,
        gage_height_ft: mainIv.gageHeightFt,
        source_flow_observed_at: flowObservedAt,
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
