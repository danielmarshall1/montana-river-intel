import type {
  FishabilityRow,
  RiverDetailAnalytics,
  RiverDetailAnalyticsBackendRow,
  RiverSourceSiteSummary,
  RiverWeatherDay,
} from "@/lib/types";

type DailyHistoryPoint = {
  obs_date: string;
  flow_cfs: number | null;
  water_temp_f: number | null;
  fishability_score: number | null;
};

type IntradayPoint = {
  observed_at: string;
  flow_cfs: number | null;
  water_temp_f: number | null;
  gage_height_ft: number | null;
};

type HatchInput = {
  date: Date;
  tempF: number | null;
  stabilityLabel: string | null;
};

type DryFlyViabilityInput = {
  windImpact: string | null;
  hatchLikelihood: string | null;
  thermalStatus: string | null;
};

type ConfidenceInput = {
  tempConfidence: string | null;
  tempObservedAt: string | null;
  lastHydrologyPullAt: string | null;
  missingInputs: string[];
};

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export function safeDivide(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

export function calculateFlowRatio(
  currentFlow: number | null | undefined,
  medianFlow: number | null | undefined
): number | null {
  const ratio = safeDivide(currentFlow, medianFlow);
  return ratio == null ? null : round(ratio, 2);
}

export function calculate48hChange(
  currentFlow: number | null | undefined,
  flow48hAgo: number | null | undefined
): number | null {
  if (
    currentFlow == null ||
    flow48hAgo == null ||
    !Number.isFinite(currentFlow) ||
    !Number.isFinite(flow48hAgo) ||
    flow48hAgo === 0
  ) {
    return null;
  }
  return round(((currentFlow - flow48hAgo) / flow48hAgo) * 100, 1);
}

export function classifyThermalStatus(tempF: number | null | undefined): string | null {
  if (tempF == null || !Number.isFinite(tempF)) return null;
  if (tempF < 60) return "Safe";
  if (tempF <= 66) return "Watch";
  if (tempF <= 70) return "Stress";
  return "Critical";
}

export function classifyWindImpact(windMph: number | null | undefined): string | null {
  if (windMph == null || !Number.isFinite(windMph)) return null;
  if (windMph < 5) return "Light";
  if (windMph <= 10) return "Manageable";
  if (windMph <= 18) return "Difficult";
  return "Severe";
}

export function classifyDryFlyWindImpact(windMph: number | null | undefined): string | null {
  if (windMph == null || !Number.isFinite(windMph)) return null;
  if (windMph < 6) return "Good";
  if (windMph <= 12) return "Moderate";
  return "Poor";
}

export function classifyStability(
  recentFlowSeries: Array<number | null | undefined>
): { raw: number | null; label: string | null } {
  const values = recentFlowSeries.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length < 2) return { raw: null, label: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!Number.isFinite(mean) || mean === 0) return { raw: null, label: null };
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  const raw = round(cv, 3);
  if (cv < 0.05) return { raw, label: "High Stability" };
  if (cv <= 0.12) return { raw, label: "Moderate Stability" };
  return { raw, label: "Low Stability" };
}

export function classifyThermalTrend(
  tempNow: number | null | undefined,
  temp24hAgo: number | null | undefined
): { label: string | null; delta24hF: number | null } {
  if (
    tempNow == null ||
    temp24hAgo == null ||
    !Number.isFinite(tempNow) ||
    !Number.isFinite(temp24hAgo)
  ) {
    return { label: null, delta24hF: null };
  }
  const delta24hF = round(tempNow - temp24hAgo, 1);
  if (delta24hF > 1.0) return { label: "Rising", delta24hF };
  if (delta24hF < -1.0) return { label: "Falling", delta24hF };
  return { label: "Stable", delta24hF };
}

export function deriveHatchLikelihood({ date, tempF, stabilityLabel }: HatchInput): string | null {
  if (tempF == null || !Number.isFinite(tempF)) return null;
  if (tempF < 38) return "Low";
  const month = date.getMonth();
  const inShoulderSeason = month >= 2 && month <= 5 || month >= 8 && month <= 10;
  if (tempF >= 44 && tempF <= 62 && stabilityLabel === "High Stability" && inShoulderSeason) {
    return "High";
  }
  if (tempF >= 40 && tempF <= 64 && stabilityLabel !== "Low Stability") {
    return "Moderate";
  }
  return "Low";
}

export function deriveDryFlyViability({
  windImpact,
  hatchLikelihood,
  thermalStatus,
}: DryFlyViabilityInput): string | null {
  if (!windImpact && !hatchLikelihood && !thermalStatus) return null;
  if (windImpact === "Severe" || thermalStatus === "Critical") return "Low";
  if (hatchLikelihood === "High" && (windImpact === "Light" || windImpact === "Manageable") && thermalStatus === "Safe") {
    return "High";
  }
  if (hatchLikelihood === "Moderate" && windImpact !== "Severe" && thermalStatus !== "Stress") {
    return "Moderate";
  }
  return "Low";
}

export function deriveOverallConfidence({
  tempConfidence,
  tempObservedAt,
  lastHydrologyPullAt,
  missingInputs,
}: ConfidenceInput): string | null {
  let score = 2;
  if (tempConfidence === "High") score += 2;
  else if (tempConfidence === "Moderate") score += 1;
  else if (tempConfidence === "Low") score -= 1;

  const now = Date.now();
  const tempMs = tempObservedAt ? new Date(tempObservedAt).getTime() : NaN;
  const hydroMs = lastHydrologyPullAt ? new Date(lastHydrologyPullAt).getTime() : NaN;
  if (Number.isFinite(tempMs) && now - tempMs > 12 * 60 * 60 * 1000) score -= 1;
  if (Number.isFinite(hydroMs) && now - hydroMs > 18 * 60 * 60 * 1000) score -= 1;
  if (missingInputs.length >= 3) score -= 2;
  else if (missingInputs.length >= 1) score -= 1;

  if (score >= 4) return "High";
  if (score >= 2) return "Moderate";
  return "Low";
}

function nearestHistoryPoint(
  rows: DailyHistoryPoint[],
  targetMs: number
): DailyHistoryPoint | null {
  let best: DailyHistoryPoint | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rowMs = new Date(`${row.obs_date}T12:00:00-07:00`).getTime();
    if (!Number.isFinite(rowMs)) continue;
    const diff = Math.abs(rowMs - targetMs);
    if (diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best;
}

function nearestIntradayPoint(
  rows: IntradayPoint[],
  targetMs: number
): IntradayPoint | null {
  let best: IntradayPoint | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rowMs = new Date(row.observed_at).getTime();
    if (!Number.isFinite(rowMs)) continue;
    const diff = Math.abs(rowMs - targetMs);
    if (diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best;
}

function getWeatherRowForDate(rows: RiverWeatherDay[], targetDate: string): RiverWeatherDay | null {
  return rows.find((row) => row.date === targetDate) ?? null;
}

function getForecastDays(rows: RiverWeatherDay[]): RiverDetailAnalytics["forecast"] {
  const dayRows = rows.slice(0, 3);
  const buildDay = (index: number) => {
    const row = dayRows[index] ?? null;
    return {
      label: index === 0 ? "Tomorrow" : `Day ${index + 1}`,
      airTempF: row?.air_temp_high_f ?? null,
      windMph: row?.wind_speed_max_mph ?? row?.wind_pm_mph ?? row?.wind_am_mph ?? null,
      precipChancePct: row?.precip_probability_pct ?? null,
      available: Boolean(row),
    };
  };
  const day1 = buildDay(0);
  const day2 = buildDay(1);
  const day3 = buildDay(2);
  const windValues = [day1.windMph, day2.windMph, day3.windMph].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  const windOutlook =
    windValues.length === 0
      ? null
      : windValues.every((value) => value < 8)
      ? "Favorable"
      : windValues.some((value) => value > 15)
      ? "Challenging"
      : "Mixed";

  return {
    day1,
    day2,
    day3,
    windOutlook,
    fishingOutlook: null,
    flowOutlook: null,
  };
}

function classifyThermalTrendFromDelta(delta24hF: number | null | undefined): {
  label: string | null;
  delta24hF: number | null;
} {
  if (delta24hF == null || !Number.isFinite(delta24hF)) {
    return { label: null, delta24hF: null };
  }
  const delta = round(delta24hF, 1);
  if (delta > 1.0) return { label: "Rising", delta24hF: delta };
  if (delta < -1.0) return { label: "Falling", delta24hF: delta };
  return { label: "Stable", delta24hF: delta };
}

function degreesToCompass(degrees: number | null | undefined): string | null {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(normalized / 45) % 8] ?? null;
}

function deriveTacticalRead(params: {
  stabilityLabel: string | null;
  windImpact: string | null;
  thermalStatus: string | null;
  hatchLikelihood: string | null;
}): string | null {
  const { stabilityLabel, windImpact, thermalStatus, hatchLikelihood } = params;
  if (stabilityLabel === "High Stability" && (windImpact === "Light" || windImpact === "Manageable")) {
    return "Stable flows and manageable wind favor consistent presentations.";
  }
  if (thermalStatus === "Safe" && hatchLikelihood === "High") {
    return "Thermal window and seasonal signal support opportunistic surface activity.";
  }
  if (stabilityLabel === "Low Stability" || windImpact === "Severe") {
    return "Rising volatility or wind creates mixed conditions and favors subsurface tactics.";
  }
  if (thermalStatus === "Critical") {
    return "Thermal stress compresses the fishable window and demands a cautious approach.";
  }
  return "Current signals are mixed, with no single metric dominating the read.";
}

export function buildRiverDetailAnalytics(params: {
  river: FishabilityRow | null;
  historyRows: DailyHistoryPoint[];
  intradayRows: IntradayPoint[];
  weatherRows: RiverWeatherDay[];
  flowSourceSite: RiverSourceSiteSummary | null;
  tempSourceSite: RiverSourceSiteSummary | null;
  backendAnalytics?: RiverDetailAnalyticsBackendRow | null;
}): RiverDetailAnalytics | null {
  const { river, historyRows, intradayRows, weatherRows, flowSourceSite, tempSourceSite, backendAnalytics } = params;
  if (!river) return null;

  const now = new Date();
  const todayMountain = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const flow48hPoint = nearestHistoryPoint(historyRows, now.getTime() - 48 * 60 * 60 * 1000);
  const temp24hPoint = nearestIntradayPoint(intradayRows, now.getTime() - 24 * 60 * 60 * 1000);
  const currentGaugeHeightFt =
    [...intradayRows].reverse().find((row) => typeof row.gage_height_ft === "number")?.gage_height_ft ??
    backendAnalytics?.current_stage_ft ??
    river.gage_height_ft ??
    null;
  const recentFlowSeries = historyRows
    .slice(0, 3)
    .map((row) => row.flow_cfs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const stability = classifyStability(recentFlowSeries);
  const flowRatio =
    backendAnalytics?.flow_ratio ??
    calculateFlowRatio(
      backendAnalytics?.current_flow_cfs ?? river.flow_cfs,
      backendAnalytics?.median_flow_cfs ?? river.median_flow_cfs
    );
  const change48hPct =
    backendAnalytics?.change_48h_pct ??
    river.change_48h_pct_calc ??
    calculate48hChange(river.flow_cfs, flow48hPoint?.flow_cfs ?? null);
  const thermalTrend =
    backendAnalytics?.thermal_trend_label
      ? {
          label: backendAnalytics.thermal_trend_label,
          delta24hF: backendAnalytics.temp_change_24h_f ?? null,
        }
      : backendAnalytics?.temp_change_24h_f != null
      ? classifyThermalTrendFromDelta(backendAnalytics.temp_change_24h_f)
      : classifyThermalTrend(
          backendAnalytics?.current_temp_f ?? river.water_temp_f,
          backendAnalytics?.temp_24h_ago ?? temp24hPoint?.water_temp_f ?? null
        );
  const thermalStatus = classifyThermalStatus(backendAnalytics?.current_temp_f ?? river.water_temp_f);

  const todayWeather =
    getWeatherRowForDate(weatherRows, todayMountain) ??
    [...weatherRows].sort((a, b) => b.date.localeCompare(a.date))[0] ??
    null;
  const forecastRows = weatherRows
    .filter((row) => row.date > todayMountain)
    .sort((a, b) => a.date.localeCompare(b.date));

  const windSpeedMph =
    backendAnalytics?.wind_speed_mph ??
    river.wind_pm_mph ??
    river.wind_am_mph ??
    todayWeather?.wind_speed_max_mph ??
    todayWeather?.wind_pm_mph ??
    todayWeather?.wind_am_mph ??
    null;
  const windImpact = classifyWindImpact(windSpeedMph);
  const dryFlyWindImpact = classifyDryFlyWindImpact(windSpeedMph);
  const windDirection =
    backendAnalytics?.wind_direction ??
    degreesToCompass(backendAnalytics?.wind_direction_deg ?? todayWeather?.wind_direction_deg ?? null);
  const hatchLikelihood = deriveHatchLikelihood({
    date: now,
    tempF: backendAnalytics?.current_temp_f ?? river.water_temp_f,
    stabilityLabel: backendAnalytics?.stability_label ?? stability.label,
  });
  const dryFlyViability = deriveDryFlyViability({
    windImpact,
    hatchLikelihood,
    thermalStatus,
  });

  const missingInputs = [
    (backendAnalytics?.current_temp_f ?? river.water_temp_f) == null ? "temp" : null,
    !(backendAnalytics?.air_temp_f != null || todayWeather) ? "weather" : null,
    backendAnalytics?.flow_percentile == null && historyRows.length < 30 ? "historical percentile" : null,
    !(
      backendAnalytics?.forecast_day1_air_temp_f != null ||
      backendAnalytics?.forecast_day1_wind_mph != null ||
      backendAnalytics?.forecast_day1_precip_chance_pct != null ||
      forecastRows.length >= 3
    )
      ? "forecast"
      : null,
  ].filter((value): value is string => Boolean(value));

  const forecast = getForecastDays(forecastRows);
  if (backendAnalytics) {
    forecast.day1.airTempF = backendAnalytics.forecast_day1_air_temp_f ?? forecast.day1.airTempF;
    forecast.day1.windMph = backendAnalytics.forecast_day1_wind_mph ?? forecast.day1.windMph;
    forecast.day1.precipChancePct =
      backendAnalytics.forecast_day1_precip_chance_pct ?? forecast.day1.precipChancePct;
    forecast.day1.available = Boolean(
      forecast.day1.available ||
      backendAnalytics.forecast_day1_air_temp_f != null ||
      backendAnalytics.forecast_day1_wind_mph != null ||
      backendAnalytics.forecast_day1_precip_chance_pct != null
    );
    forecast.day2.airTempF = backendAnalytics.forecast_day2_air_temp_f ?? forecast.day2.airTempF;
    forecast.day2.windMph = backendAnalytics.forecast_day2_wind_mph ?? forecast.day2.windMph;
    forecast.day2.precipChancePct =
      backendAnalytics.forecast_day2_precip_chance_pct ?? forecast.day2.precipChancePct;
    forecast.day2.available = Boolean(
      forecast.day2.available ||
      backendAnalytics.forecast_day2_air_temp_f != null ||
      backendAnalytics.forecast_day2_wind_mph != null ||
      backendAnalytics.forecast_day2_precip_chance_pct != null
    );
    forecast.day3.airTempF = backendAnalytics.forecast_day3_air_temp_f ?? forecast.day3.airTempF;
    forecast.day3.windMph = backendAnalytics.forecast_day3_wind_mph ?? forecast.day3.windMph;
    forecast.day3.precipChancePct =
      backendAnalytics.forecast_day3_precip_chance_pct ?? forecast.day3.precipChancePct;
    forecast.day3.available = Boolean(
      forecast.day3.available ||
      backendAnalytics.forecast_day3_air_temp_f != null ||
      backendAnalytics.forecast_day3_wind_mph != null ||
      backendAnalytics.forecast_day3_precip_chance_pct != null
    );
  }
  forecast.fishingOutlook =
    backendAnalytics?.fishing_outlook ??
    (forecastRows.length >= 3 && windImpact
      ? dryFlyViability === "High"
        ? "Favorable weather signal with stable current conditions."
        : dryFlyViability === "Moderate"
        ? "Mixed weather signal; monitor wind and thermal window."
        : "Challenging near-term signal."
      : null);
  forecast.windOutlook = backendAnalytics?.wind_outlook ?? forecast.windOutlook;
  forecast.flowOutlook = backendAnalytics?.flow_outlook ?? null;

  return {
    hydrology: {
      currentFlowCfs: backendAnalytics?.current_flow_cfs ?? river.flow_cfs ?? null,
      medianFlowCfs: backendAnalytics?.median_flow_cfs ?? river.median_flow_cfs ?? null,
      flowRatio,
      change48hPct,
      flowPercentile: backendAnalytics?.flow_percentile ?? null,
      flowPercentileStatus:
        backendAnalytics?.flow_percentile_status ??
        (historyRows.length >= 30 ? null : "Insufficient history"),
      stabilityIndexRaw: backendAnalytics?.stability_index_raw ?? stability.raw,
      stabilityLabel: backendAnalytics?.stability_label ?? stability.label,
      gaugeHeightFt: currentGaugeHeightFt,
    },
    thermal: {
      currentWaterTempF: backendAnalytics?.current_temp_f ?? river.water_temp_f ?? null,
      tempSourceKind:
        backendAnalytics?.temp_source_kind === "NONE"
          ? "Unknown"
          : backendAnalytics?.temp_source_kind ?? (river.temp_source_kind === "NONE" ? "Unknown" : river.temp_source_kind ?? "Unknown"),
      tempObservedAt: backendAnalytics?.temp_observed_at ?? river.temp_observed_at ?? null,
      tempConfidence: backendAnalytics?.confidence_level ?? river.confidence_level ?? null,
      thermalTrendLabel: thermalTrend.label,
      thermalTrendDelta24hF: thermalTrend.delta24hF,
      thermalStatus,
      direction3Day: backendAnalytics?.temp_direction_3d ?? null,
    },
    weather: {
      airTempF: backendAnalytics?.air_temp_f ?? null,
      windSpeedMph,
      windDirection,
      gustMph: backendAnalytics?.gust_mph ?? todayWeather?.gust_mph ?? null,
      precipChancePct: backendAnalytics?.precip_chance_pct ?? todayWeather?.precip_probability_pct ?? river.precip_probability_pct ?? null,
      cloudCoverPct: backendAnalytics?.cloud_cover_pct ?? todayWeather?.cloud_cover_pct ?? null,
      highTempF: backendAnalytics?.daily_high_f ?? todayWeather?.air_temp_high_f ?? null,
      lowTempF: backendAnalytics?.daily_low_f ?? todayWeather?.air_temp_low_f ?? null,
      windImpact,
      dryFlyWindImpact,
    },
    forecast,
    biology: {
      hatchLikelihood,
      dryFlyViability,
      tacticalRead: deriveTacticalRead({
        stabilityLabel: backendAnalytics?.stability_label ?? stability.label,
        windImpact,
        thermalStatus,
        hatchLikelihood,
      }),
    },
    sourceTrust: {
      flowSourceSiteNo: backendAnalytics?.flow_source_site_no ?? river.flow_source_site_no ?? null,
      flowSourceSiteName: backendAnalytics?.flow_source_site_name ?? flowSourceSite?.station_name ?? null,
      tempSourceSiteNo: backendAnalytics?.temp_source_site_no ?? river.temp_source_site_no ?? null,
      tempSourceSiteName: backendAnalytics?.temp_source_site_name ?? tempSourceSite?.station_name ?? null,
      tempSourceKind:
        backendAnalytics?.temp_source_kind === "NONE"
          ? "Unknown"
          : backendAnalytics?.temp_source_kind ?? (river.temp_source_kind === "NONE" ? "Unknown" : river.temp_source_kind ?? "Unknown"),
      observationTimestamp:
        backendAnalytics?.observation_timestamp ??
        river.temp_observed_at ??
        river.source_flow_observed_at ??
        river.source_temp_observed_at ??
        null,
      lastHydrologyPullAt: backendAnalytics?.last_hydrology_pull_at ?? river.last_usgs_pull_at ?? river.source_flow_observed_at ?? null,
      overallConfidence: deriveOverallConfidence({
        tempConfidence: backendAnalytics?.confidence_level ?? river.confidence_level ?? null,
        tempObservedAt: backendAnalytics?.temp_observed_at ?? river.temp_observed_at ?? null,
        lastHydrologyPullAt: backendAnalytics?.last_hydrology_pull_at ?? river.last_usgs_pull_at ?? river.source_flow_observed_at ?? null,
        missingInputs,
      }),
      missingInputs,
    },
  };
}
