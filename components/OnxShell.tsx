"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Plus, Minus, Maximize2, Crosshair, Layers, List, X } from "lucide-react";
import { MapView } from "@/components/MapView";
import { fetchRiverGeom } from "@/lib/supabase";
import { fetchRiverGeojsonBrowser } from "@/lib/supabaseBrowser";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import { deriveScoreBreakdown } from "@/lib/scoreBreakdown";
import { generateTodaysRead } from "@/lib/todaysRead";
import { MRI_COLORS } from "@/lib/theme";
import { getFlowTrendArrow } from "@/lib/trend";
import {
  fetchRiverDetailAnalyticsByIdOrSlug,
  fetchRiverHistory14d,
  fetchRiverIntraday24h,
  fetchRiverWeatherWindow,
  fetchUsgsSiteSummaries,
} from "@/lib/supabase";
import { buildRiverDetailAnalytics } from "@/lib/riverAnalytics";
import {
  BASEMAP_OPTIONS,
  DEFAULT_BASEMAP,
  LAYER_GROUP_ORDER,
  LAYER_REGISTRY,
  LAYERS_STORAGE_KEY,
  createDefaultLayerState,
  type BasemapId,
  type LayerId,
} from "@/src/map/layers/registry";
import type {
  FishabilityRow,
  RiverDetailAnalyticsBackendRow,
  RiverDetailAnalytics,
  RiverSourceSiteSummary,
  RiverWeatherDay,
} from "@/lib/types";

type River = FishabilityRow;

function TierPill({ tier }: { tier?: string }) {
  const dotColor =
    tier === "Good" || tier === "HOT" || tier === "GOOD"
      ? MRI_COLORS.good
      : tier === "Fair" || tier === "FAIR"
      ? MRI_COLORS.fair
      : MRI_COLORS.tough;
  const label =
    tier === "HOT" || tier === "GOOD"
      ? "Good"
      : tier === "FAIR"
      ? "Fair"
      : tier === "TOUGH"
      ? "Tough"
      : tier ?? "—";

  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/90">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
      {label}
    </span>
  );
}

function formatNum(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

function formatPullTime(value: string | null | undefined): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Denver",
  });
}

function formatUpdatedAgo(value: string | null | undefined): string {
  if (!value) return "Updated recently";
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return "Updated recently";
  const diffMin = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `Updated ${h}h ago`;
  const d = Math.floor(h / 24);
  return `Updated ${d}d ago`;
}

function getFishabilityIndex(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) {
    return { value: "—", normalized: null as number | null, percent: 0, band: "Unavailable", optimal: false };
  }
  const normalized = Math.max(0, Math.min(10, Number(score) / 10));
  const percent = Math.max(0, Math.min(100, normalized * 10));
  const band = normalized >= 8.5 ? "Excellent" : normalized >= 6.5 ? "Good" : normalized >= 4 ? "Fair" : "Poor";
  return {
    value: normalized.toFixed(1),
    normalized,
    percent,
    band,
    optimal: normalized >= 7.5 && normalized <= 9.2,
  };
}

function getTempStatusLabel(river: River | null | undefined): string {
  if (!river) return "Temp status unavailable";
  if (river.temp_status === "available_stale") {
    const mins = river.temp_age_minutes;
    if (mins != null && Number.isFinite(mins)) {
      const h = Math.floor(mins / 60);
      return h > 0 ? `Temp stale (${h}h old)` : `Temp stale (${mins}m old)`;
    }
    return "Temp stale";
  }
  if (river.temp_status === "unavailable_at_gauge") {
    return "Temp not available at this gauge";
  }
  return "Temp fresh";
}

function getTempSourceLabel(river: River | null | undefined): string {
  if (!river) return "—";
  const kind = river.temp_source_kind ?? "NONE";
  const site = river.temp_source_site_no ?? "—";
  if (kind === "NONE") return "No temp source";
  return `${kind} • Site ${site}`;
}

function getConfidenceBadgeLabel(river: River | null | undefined): string {
  if (!river?.confidence_level) return "Confidence unavailable";
  return `${river.confidence_level} confidence`;
}

function getConfidenceBadgeClass(level: River["confidence_level"]): string {
  if (level === "High") {
    return "border-[rgba(110,150,125,0.34)] bg-[rgba(79,103,87,0.18)] text-[#c2d5c6]";
  }
  if (level === "Moderate") {
    return "border-[rgba(173,126,78,0.34)] bg-[rgba(134,97,57,0.18)] text-[#d8be97]";
  }
  return "border-[var(--mri-border)] bg-[rgba(21,31,35,0.7)] text-[var(--mri-text-dim)]";
}

function formatDetailedTime(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Unavailable";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Denver",
  }) + " MT";
}

function formatMetricNumber(
  value: number | null | undefined,
  opts?: { digits?: number; suffix?: string; prefix?: string }
): string {
  if (value == null || Number.isNaN(value)) return "Unavailable";
  const digits = opts?.digits ?? 0;
  return `${opts?.prefix ?? ""}${Number(value).toFixed(digits)}${opts?.suffix ?? ""}`;
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "Unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(1)}%`;
}

function formatTempTrend(label: string | null, delta: number | null): string {
  if (!label) return "Unavailable";
  if (delta == null || Number.isNaN(delta)) return label;
  const sign = delta > 0 ? "+" : "";
  return `${label} (${sign}${delta.toFixed(1)}°F / 24h)`;
}

function metricNoteAboveMedian(flowRatio: number | null): string | null {
  if (flowRatio == null || Number.isNaN(flowRatio)) return null;
  if (flowRatio > 1.05) return "Above median";
  if (flowRatio < 0.95) return "Below median";
  return "Near median";
}

function metricNote48hChange(change48hPct: number | null): string | null {
  if (change48hPct == null || Number.isNaN(change48hPct)) return null;
  if (change48hPct > 5) return "Stable rise";
  if (change48hPct < -5) return "Falling";
  return "Relatively stable";
}

function getRiverTrustLine(river: River): string {
  const change = river.change_48h_pct_calc;
  if (change == null || Number.isNaN(change)) return "Trend unavailable";
  if (change > 5) return `Rising flow (${formatSignedPercent(change)})`;
  if (change < -5) return `Falling flow (${formatSignedPercent(change)})`;
  return `Stable flow (${formatSignedPercent(change)})`;
}

function formatSourceSite(siteNo: string | null | undefined, siteName: string | null | undefined): string {
  if (!siteNo && !siteName) return "Unavailable";
  if (siteNo && siteName) return `${siteNo} • ${siteName}`;
  return siteNo ?? siteName ?? "Unavailable";
}

function MetricRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-white/6 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-white/76">{label}</div>
        {note ? <div className="mt-0.5 text-[10px] leading-4 text-white/40">{note}</div> : null}
      </div>
      <div className="max-w-[180px] text-right text-[11px] font-semibold text-white/92">{value}</div>
    </div>
  );
}

function MetricsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-[rgba(180,198,209,0.1)] bg-[rgba(16,24,27,0.58)] p-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/42">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DetailedMetricsContent({
  analytics,
}: {
  analytics: RiverDetailAnalytics | null;
}) {
  if (!analytics) {
    return <div className="text-[11px] text-[var(--mri-text-dim)]">No metrics available.</div>;
  }

  return (
    <div className="space-y-3">
      <MetricsSection title="Hydrology">
        <MetricRow label="Current Flow (cfs)" value={formatMetricNumber(analytics.hydrology.currentFlowCfs, { suffix: " CFS" })} />
        <MetricRow label="Median Flow" value={formatMetricNumber(analytics.hydrology.medianFlowCfs, { suffix: " CFS" })} />
        <MetricRow
          label="Flow Ratio"
          value={analytics.hydrology.flowRatio != null ? `${analytics.hydrology.flowRatio.toFixed(2)}x median` : "Unavailable"}
          note={metricNoteAboveMedian(analytics.hydrology.flowRatio)}
        />
        <MetricRow
          label="48h Flow Change"
          value={formatSignedPercent(analytics.hydrology.change48hPct)}
          note={metricNote48hChange(analytics.hydrology.change48hPct)}
        />
        <MetricRow
          label="Flow Percentile for Date"
          value={
            analytics.hydrology.flowPercentile != null
              ? `${Math.round(analytics.hydrology.flowPercentile)}th percentile`
              : analytics.hydrology.flowPercentileStatus ?? "Insufficient history"
          }
        />
        <MetricRow
          label="Stability Index"
          value={analytics.hydrology.stabilityLabel ?? "Unavailable"}
          note={
            analytics.hydrology.stabilityIndexRaw != null
              ? `CV ${analytics.hydrology.stabilityIndexRaw.toFixed(3)}`
              : "Insufficient recent flow history"
          }
        />
        <MetricRow
          label="Stage / Gauge Height"
          value={formatMetricNumber(analytics.hydrology.gaugeHeightFt, { digits: 1, suffix: " ft" })}
        />
      </MetricsSection>

      <MetricsSection title="Thermal">
        <MetricRow
          label="Current Water Temperature"
          value={formatMetricNumber(analytics.thermal.currentWaterTempF, { digits: 1, suffix: "°F" })}
        />
        <MetricRow label="Temperature Source Type" value={analytics.thermal.tempSourceKind ?? "Unknown"} />
        <MetricRow label="Temperature Observed At" value={formatDetailedTime(analytics.thermal.tempObservedAt)} />
        <MetricRow label="Temperature Confidence" value={analytics.thermal.tempConfidence ?? "Unavailable"} />
        <MetricRow
          label="Thermal Trend"
          value={formatTempTrend(analytics.thermal.thermalTrendLabel, analytics.thermal.thermalTrendDelta24hF)}
        />
        <MetricRow label="Thermal Status" value={analytics.thermal.thermalStatus ?? "Unavailable"} />
        <MetricRow
          label="3-Day Water Temp Direction"
          value={analytics.thermal.direction3Day ?? "Forecast not yet enabled"}
        />
      </MetricsSection>

      <MetricsSection title="Weather">
        <MetricRow label="Current Air Temperature" value={formatMetricNumber(analytics.weather.airTempF, { digits: 0, suffix: "°F" })} />
        <MetricRow
          label="Wind Speed"
          value={formatMetricNumber(analytics.weather.windSpeedMph, { digits: 1, suffix: " mph" })}
          note={analytics.weather.windSpeedMph != null ? "Using current MRI weather signal" : null}
        />
        <MetricRow label="Wind Direction" value={analytics.weather.windDirection ?? "Unavailable"} />
        <MetricRow label="Gusts" value={formatMetricNumber(analytics.weather.gustMph, { digits: 0, suffix: " mph" })} />
        <MetricRow
          label="Precipitation Probability"
          value={formatMetricNumber(analytics.weather.precipChancePct, { digits: 0, suffix: "%" })}
        />
        <MetricRow
          label="Cloud Cover"
          value={formatMetricNumber(analytics.weather.cloudCoverPct, { digits: 0, suffix: "%" })}
        />
        <MetricRow
          label="Daily High / Low"
          value={
            analytics.weather.highTempF != null || analytics.weather.lowTempF != null
              ? `${analytics.weather.highTempF != null ? Math.round(analytics.weather.highTempF) : "—"}° / ${analytics.weather.lowTempF != null ? Math.round(analytics.weather.lowTempF) : "—"}°`
              : "Unavailable"
          }
        />
        <MetricRow label="Wind Fishing Impact" value={analytics.weather.windImpact ?? "Unavailable"} />
        <MetricRow label="Dry Fly Wind Impact" value={analytics.weather.dryFlyWindImpact ?? "Unavailable"} />
      </MetricsSection>

      <MetricsSection title="Forecast">
        <MetricRow
          label="Tomorrow Air Temp"
          value={analytics.forecast.day1.available ? formatMetricNumber(analytics.forecast.day1.airTempF, { digits: 0, suffix: "°F" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Tomorrow Wind"
          value={analytics.forecast.day1.available ? formatMetricNumber(analytics.forecast.day1.windMph, { digits: 0, suffix: " mph" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Tomorrow Precip Chance"
          value={analytics.forecast.day1.available ? formatMetricNumber(analytics.forecast.day1.precipChancePct, { digits: 0, suffix: "%" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Day 2 Air Temp"
          value={analytics.forecast.day2.available ? formatMetricNumber(analytics.forecast.day2.airTempF, { digits: 0, suffix: "°F" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Day 2 Wind"
          value={analytics.forecast.day2.available ? formatMetricNumber(analytics.forecast.day2.windMph, { digits: 0, suffix: " mph" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Day 2 Precip Chance"
          value={analytics.forecast.day2.available ? formatMetricNumber(analytics.forecast.day2.precipChancePct, { digits: 0, suffix: "%" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Day 3 Air Temp"
          value={analytics.forecast.day3.available ? formatMetricNumber(analytics.forecast.day3.airTempF, { digits: 0, suffix: "°F" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Day 3 Wind"
          value={analytics.forecast.day3.available ? formatMetricNumber(analytics.forecast.day3.windMph, { digits: 0, suffix: " mph" }) : "Forecast not yet enabled"}
        />
        <MetricRow
          label="Day 3 Precip Chance"
          value={analytics.forecast.day3.available ? formatMetricNumber(analytics.forecast.day3.precipChancePct, { digits: 0, suffix: "%" }) : "Forecast not yet enabled"}
        />
        <MetricRow label="3-Day Wind Outlook" value={analytics.forecast.windOutlook ?? "Forecast not yet enabled"} />
        <MetricRow label="3-Day Fishing Outlook" value={analytics.forecast.fishingOutlook ?? "Forecast model not yet enabled"} />
        <MetricRow label="3-Day Flow Outlook" value={analytics.forecast.flowOutlook ?? "Flow forecast not yet enabled"} />
      </MetricsSection>

      <MetricsSection title="Biology">
        <MetricRow
          label="Hatch Likelihood"
          value={analytics.biology.hatchLikelihood ?? "Unavailable"}
          note="Derived from season, temperature, and stability"
        />
        <MetricRow label="Dry Fly Viability" value={analytics.biology.dryFlyViability ?? "Unavailable"} />
        <MetricRow label="Tactical Read" value={analytics.biology.tacticalRead ?? "Unavailable"} />
      </MetricsSection>

      <MetricsSection title="Data Quality / Source Trust">
        <MetricRow
          label="Flow Source Site"
          value={formatSourceSite(analytics.sourceTrust.flowSourceSiteNo, analytics.sourceTrust.flowSourceSiteName)}
        />
        <MetricRow
          label="Temperature Source Site"
          value={formatSourceSite(analytics.sourceTrust.tempSourceSiteNo, analytics.sourceTrust.tempSourceSiteName)}
        />
        <MetricRow label="Temp Source Kind" value={analytics.sourceTrust.tempSourceKind ?? "Unknown"} />
        <MetricRow
          label="Observation Timestamp"
          value={analytics.sourceTrust.observationTimestamp ? formatDetailedTime(analytics.sourceTrust.observationTimestamp) : "Unavailable"}
        />
        <MetricRow
          label="Last Hydrology Pull"
          value={analytics.sourceTrust.lastHydrologyPullAt ? formatDetailedTime(analytics.sourceTrust.lastHydrologyPullAt) : "Unavailable"}
        />
        <MetricRow label="Data Confidence" value={analytics.sourceTrust.overallConfidence ?? "Unavailable"} />
        <MetricRow
          label="Missing Inputs"
          value={analytics.sourceTrust.missingInputs.length ? analytics.sourceTrust.missingInputs.join(", ") : "None"}
        />
      </MetricsSection>
    </div>
  );
}

// ─── TrendChart ────────────────────────────────────────────────────────────

type HistoryRow = {
  obs_date: string;
  flow_cfs: number | null;
  water_temp_f: number | null;
  fishability_score: number | null;
};

const TC_VB_W = 300; // SVG viewBox coordinate width

/** Smooth cubic bezier through the given points (horizontal control handles). */
function buildSmoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1);
    d += ` C${cx},${pts[i][1].toFixed(1)} ${cx},${pts[i + 1][1].toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/** Map data rows onto SVG coordinate space, skipping null values. */
function toChartPts(
  rows: HistoryRow[],
  key: "fishability_score" | "flow_cfs" | "water_temp_f",
  vbH: number,
  padX: number,
  padY: number
): { pts: [number, number][]; min: number; max: number } {
  const n = rows.length;
  if (n === 0) return { pts: [], min: 0, max: 0 };
  const vals = rows.map((r) => r[key] as number | null);
  const valid = vals.filter((v): v is number => v != null);
  if (valid.length < 2) return { pts: [], min: 0, max: 0 };
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const range = hi - lo || 1;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (v == null) continue;
    const x = padX + (i / (n - 1)) * (TC_VB_W - 2 * padX);
    const y = padY + (1 - (v - lo) / range) * (vbH - 2 * padY);
    pts.push([x, y]);
  }
  return { pts, min: lo, max: hi };
}

/** Parse a YYYY-MM-DD date string without timezone shift. */
function fmtShortDate(d: string | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function TrendChart({ historyRows }: { historyRows: HistoryRow[] }) {
  const rows = useMemo(
    () => [...historyRows].sort((a, b) => a.obs_date.localeCompare(b.obs_date)),
    [historyRows]
  );

  if (rows.length < 2) return null;

  const H1 = 44; // score sparkline viewBox height
  const H2 = 52; // flow/temp viewBox height
  const PX = 4;
  const PY = 4;

  const { pts: scorePts, min: scoreMin, max: scoreMax } = toChartPts(rows, "fishability_score", H1, PX, PY);
  const { pts: flowPts, min: flowMin, max: flowMax } = toChartPts(rows, "flow_cfs", H2, PX, PY);
  const { pts: tempPts, min: tempMin, max: tempMax } = toChartPts(rows, "water_temp_f", H2, PX, PY);

  const hasScore = scorePts.length >= 2;
  const hasFlow = flowPts.length >= 2;
  const hasTemp = tempPts.length >= 2;

  if (!hasScore && !hasFlow && !hasTemp) return null;

  const lastRow = rows.at(-1);
  const firstDate = fmtShortDate(rows[0]?.obs_date);
  const lastDate = fmtShortDate(lastRow?.obs_date);

  const scoreAreaPath =
    scorePts.length >= 2
      ? `${buildSmoothPath(scorePts)} L${scorePts.at(-1)![0].toFixed(1)},${(H1 - PY).toFixed(1)} L${scorePts[0][0].toFixed(1)},${(H1 - PY).toFixed(1)} Z`
      : "";

  return (
    <div className="rounded-[18px] border border-[rgba(180,198,209,0.07)] bg-[rgba(12,19,22,0.72)] p-3 space-y-3.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/32">14-Day Trends</div>

      {/* Fishability score sparkline */}
      {hasScore && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] text-white/46">Fishability</span>
            {lastRow?.fishability_score != null && (
              <span className="text-[10px] font-semibold" style={{ color: MRI_COLORS.riverSelected }}>
                {Math.round(lastRow.fishability_score)} today
              </span>
            )}
          </div>
          <svg
            viewBox={`0 0 ${TC_VB_W} ${H1}`}
            width="100%"
            height={H1}
            preserveAspectRatio="none"
            style={{ display: "block" }}
          >
            {/* Area fill */}
            {scoreAreaPath && (
              <path d={scoreAreaPath} fill={MRI_COLORS.riverSelected} fillOpacity="0.09" />
            )}
            {/* Line */}
            <path
              d={buildSmoothPath(scorePts)}
              fill="none"
              stroke={MRI_COLORS.riverSelected}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* End dot */}
            {scorePts.at(-1) && (
              <circle
                cx={scorePts.at(-1)![0]}
                cy={scorePts.at(-1)![1]}
                r="3"
                fill={MRI_COLORS.riverSelected}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <div className="mt-0.5 flex justify-between text-[9px] text-white/24">
            <span>{firstDate}</span>
            {scoreMin !== scoreMax && (
              <span>
                {Math.round(scoreMin)}–{Math.round(scoreMax)}
              </span>
            )}
            <span>{lastDate}</span>
          </div>
        </div>
      )}

      {/* Flow + Temp dual-line, each on its own normalized Y scale */}
      {(hasFlow || hasTemp) && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] text-white/46">Flow &amp; Temp</span>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              {hasFlow && lastRow?.flow_cfs != null && (
                <span style={{ color: "#4aa3ff" }}>
                  {Math.round(lastRow.flow_cfs).toLocaleString()} cfs
                </span>
              )}
              {hasTemp && lastRow?.water_temp_f != null && (
                <span style={{ color: MRI_COLORS.warning }}>
                  {lastRow.water_temp_f.toFixed(1)}°F
                </span>
              )}
            </div>
          </div>
          <svg
            viewBox={`0 0 ${TC_VB_W} ${H2}`}
            width="100%"
            height={H2}
            preserveAspectRatio="none"
            style={{ display: "block" }}
          >
            {hasFlow && (
              <path
                d={buildSmoothPath(flowPts)}
                fill="none"
                stroke="#4aa3ff"
                strokeWidth="1.5"
                strokeOpacity="0.72"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {hasTemp && (
              <path
                d={buildSmoothPath(tempPts)}
                fill="none"
                stroke={MRI_COLORS.warning}
                strokeWidth="1.5"
                strokeOpacity="0.72"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {hasFlow && flowPts.at(-1) && (
              <circle
                cx={flowPts.at(-1)![0]}
                cy={flowPts.at(-1)![1]}
                r="2.5"
                fill="#4aa3ff"
                fillOpacity="0.9"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {hasTemp && tempPts.at(-1) && (
              <circle
                cx={tempPts.at(-1)![0]}
                cy={tempPts.at(-1)![1]}
                r="2.5"
                fill={MRI_COLORS.warning}
                fillOpacity="0.9"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* Range labels (left) + date range (right) */}
          <div className="mt-0.5 flex items-start justify-between text-[9px]">
            <div className="flex flex-col gap-0.5">
              {hasFlow && (
                <span style={{ color: "#4aa3ff55" }}>
                  {Math.round(flowMin).toLocaleString()}–{Math.round(flowMax).toLocaleString()} cfs
                </span>
              )}
              {hasTemp && (
                <span style={{ color: `${MRI_COLORS.warning}66` }}>
                  {tempMin.toFixed(0)}–{tempMax.toFixed(0)}°F
                </span>
              )}
            </div>
            <div className="flex flex-col items-end text-white/24">
              <span>{firstDate}</span>
              <span>{lastDate}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── River tray card ────────────────────────────────────────────────────────

function DesktopTrayCard({
  river,
  selected,
  onSelect,
}: {
  river: River;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`mri-drawer-card mri-tray-card shrink-0 text-left active:translate-y-[1px] ${
        selected ? "mri-drawer-card-selected" : ""
      }`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">{river.river_name}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/50">{river.gauge_label ?? ""}</div>
          </div>
          <div className="text-right">
            <div className="text-[24px] font-semibold leading-none tracking-[-0.02em] text-white">
              {river.fishability_score_calc ?? "—"}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/40">Score</div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <TierPill
            tier={
              river.bite_tier === "HOT" || river.bite_tier === "GOOD"
                ? "Good"
                : river.bite_tier === "FAIR"
                ? "Fair"
                : river.bite_tier === "TOUGH"
                ? "Tough"
                : undefined
            }
          />
          <div className="flex items-center gap-3 text-[11px] text-white/72">
            <span>
              {river.flow_cfs ?? "—"}
              <span className="ml-1 text-white/38">{getFlowTrendArrow(river.change_48h_pct_calc)}</span>
            </span>
            <span>{river.water_temp_f != null ? `${Number(river.water_temp_f).toFixed(1)}°` : "—"}</span>
          </div>
        </div>
        <div className="mt-2 text-[10px] font-medium tracking-[0.01em] text-white/58">{getRiverTrustLine(river)}</div>
      </div>
    </button>
  );
}

export default function OnxShell({
  rivers,
  stationGeojson,
  riverLinesGeojson: initialRiverLinesGeojson,
  dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
}: {
  rivers: River[];
  stationGeojson?: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> | null;
  riverLinesGeojson?: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> | null;
  dateLabel?: string;
}) {
  type TopPanel = "none" | "layers" | "detail";
  type DrawerSnap = "collapsed" | "mid" | "expanded";
  type MobileSurface = "map" | "list" | "detail" | "tools";
  type MobileListSnap = "peek" | "mid" | "full";
  const DRAWER_SNAP_Y: Record<DrawerSnap, number> = {
    collapsed: 0.94,
    mid: 0.76,
    expanded: 0.46,
  };
  const MOBILE_LIST_SNAP_Y: Record<MobileListSnap, number> = {
    peek: 0.78,
    mid: 0.46,
    full: 0.08,
  };
  const SNAP_TRANSITION = "transform 260ms ease-in-out";

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"All" | "Good" | "Fair" | "Tough">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionSeq, setSelectionSeq] = useState(0);
  const [drawerSnap, setDrawerSnap] = useState<DrawerSnap>("collapsed");
  const [sheetY, setSheetY] = useState<number>(DRAWER_SNAP_Y.collapsed);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startSheetY: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("map");
  const [mobileListSnap, setMobileListSnap] = useState<MobileListSnap>("peek");
  const [mobileSheetY, setMobileSheetY] = useState<number>(MOBILE_LIST_SNAP_Y.peek);
  const [isMobileDragging, setIsMobileDragging] = useState(false);
  const mobileDragRef = useRef<{ startY: number; startSheetY: number } | null>(null);
  const mobileDetailDragRef = useRef<{ startY: number } | null>(null);

  const [selectedGeojson, setSelectedGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [openTopPanel, setOpenTopPanel] = useState<TopPanel>("none");
  const [transparencyOpen, setTransparencyOpen] = useState(false);
  const [detailMetricsOpen, setDetailMetricsOpen] = useState(false);
  const [mobileDetailMetricsOpen, setMobileDetailMetricsOpen] = useState(false);
  const [advancedLayersOpen, setAdvancedLayersOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    Array<{ obs_date: string; flow_cfs: number | null; water_temp_f: number | null; fishability_score: number | null }>
  >([]);
  const [, setHistoryLoading] = useState(false);
  const [intradayRows, setIntradayRows] = useState<
    Array<{ observed_at: string; flow_cfs: number | null; water_temp_f: number | null; gage_height_ft: number | null }>
  >([]);
  const [, setIntradayLoading] = useState(false);
  const [weatherRows, setWeatherRows] = useState<RiverWeatherDay[]>([]);
  const [sourceSites, setSourceSites] = useState<Record<string, RiverSourceSiteSummary>>({});
  const [backendAnalytics, setBackendAnalytics] = useState<RiverDetailAnalyticsBackendRow | null>(null);

  const [basemap, setBasemap] = useState<BasemapId>("hybrid");
  const [layerState, setLayerState] = useState<Record<LayerId, boolean>>(
    createDefaultLayerState()
  );

  const basemapById = useMemo(
    () => Object.fromEntries(BASEMAP_OPTIONS.map((b) => [b.id, b])) as Record<BasemapId, (typeof BASEMAP_OPTIONS)[number]>,
    []
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rivers ?? [])
      .filter((r) => {
        const matchesSearch =
          !s ||
          (r.river_name ?? "").toLowerCase().includes(s) ||
          (r.gauge_label ?? "").toLowerCase().includes(s);

        const displayTier =
          r.bite_tier === "HOT" || r.bite_tier === "GOOD"
            ? "Good"
            : r.bite_tier === "FAIR"
            ? "Fair"
            : r.bite_tier === "TOUGH"
            ? "Tough"
            : "";

        return matchesSearch && (tier === "All" || displayTier === tier);
      })
      .sort(
        (a, b) =>
          (b.fishability_score_calc ?? -999) - (a.fishability_score_calc ?? -999)
      );
  }, [rivers, search, tier]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      filtered.find((r) => r.river_id === selectedId) ??
      rivers.find((r) => r.river_id === selectedId) ??
      null
    );
  }, [filtered, rivers, selectedId]);

  const breakdown = useMemo(() => (selected ? deriveScoreBreakdown(selected) : null), [selected]);
  const selectedFishIndex = useMemo(
    () => getFishabilityIndex(selected?.fishability_score_calc ?? null),
    [selected]
  );
  const todaysRead = useMemo(() => generateTodaysRead(selected), [selected]);
  const detailedAnalytics = useMemo(
    () =>
      buildRiverDetailAnalytics({
        river: selected,
        historyRows,
        intradayRows,
        weatherRows,
        flowSourceSite: selected?.flow_source_site_no ? sourceSites[selected.flow_source_site_no] ?? null : null,
        tempSourceSite: selected?.temp_source_site_no ? sourceSites[selected.temp_source_site_no] ?? null : null,
        backendAnalytics,
      }),
    [selected, historyRows, intradayRows, weatherRows, sourceSites, backendAnalytics]
  );
  const topRivers = useMemo(
    () => filtered.filter((r) => (r.fishability_score_calc ?? null) != null).slice(0, 5),
    [filtered]
  );
  const latestPullAt = useMemo(() => {
    let latestMs = 0;
    for (const r of rivers) {
      const candidate =
        r.source_flow_observed_at ?? r.source_temp_observed_at ?? r.updated_at ?? null;
      if (!candidate) continue;
      const ms = new Date(candidate).getTime();
      if (!Number.isNaN(ms) && ms > latestMs) latestMs = ms;
    }
    return latestMs > 0 ? new Date(latestMs).toISOString() : null;
  }, [rivers]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!selectedId) {
        setSelectedGeojson(null);
        return;
      }
      const river =
        filtered.find((r) => r.river_id === selectedId) ??
        rivers.find((r) => r.river_id === selectedId);
      const key = river?.slug ?? river?.river_id ?? selectedId;

      const gj = await fetchRiverGeojsonBrowser(key);
      if (cancelled) return;
      if (gj) {
        setSelectedGeojson(gj);
        return;
      }

      const geom = await fetchRiverGeom(selectedId);
      if (cancelled) return;
      setSelectedGeojson(
        geom
          ? ({
              type: "Feature",
              geometry: geom,
              properties: { river_id: selectedId },
            } as GeoJSON.Feature)
          : null
      );
    }

    run().catch(() => {
      if (!cancelled) setSelectedGeojson(null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, filtered, rivers]);

  function setMobileSurfaceState(next: MobileSurface, opts?: { listSnap?: MobileListSnap }) {
    setOpenTopPanel("none");
    setTransparencyOpen(false);
    if (next === "list" && opts?.listSnap) {
      setMobileListSnap(opts.listSnap);
      setMobileSheetY(MOBILE_LIST_SNAP_Y[opts.listSnap]);
    }
    setMobileSurface(next);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      if (mobile) {
        setMobileSurface((prev) => {
          if (prev === "map") {
            setMobileListSnap("peek");
            setMobileSheetY(MOBILE_LIST_SNAP_Y.peek);
            return "list";
          }
          return prev;
        });
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (selected) {
      setDetailMetricsOpen(false);
      setMobileDetailMetricsOpen(false);
      if (isMobile) {
        setMobileSurfaceState("detail");
        return;
      }
      setOpenTopPanel((prev) => (prev === "layers" ? prev : "detail"));
      return;
    }
    if (isMobile && mobileSurface === "detail") {
      setMobileSurfaceState("list", { listSnap: "peek" });
    }
    if (openTopPanel === "detail") {
      setOpenTopPanel("none");
    }
    setTransparencyOpen(false);
  }, [selected, openTopPanel, isMobile, mobileSurface]);

  useEffect(() => {
    let cancelled = false;
    async function loadBackendAnalytics() {
      if (!selected?.river_id) {
        setBackendAnalytics(null);
        return;
      }
      const data =
        (await fetchRiverDetailAnalyticsByIdOrSlug(selected.river_id)) ??
        (selected.slug ? await fetchRiverDetailAnalyticsByIdOrSlug(selected.slug) : null);
      if (!cancelled) {
        setBackendAnalytics(data);
      }
    }
    loadBackendAnalytics().catch(() => {
      if (!cancelled) {
        setBackendAnalytics(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.river_id, selected?.slug]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!selected?.river_id) {
        setHistoryRows([]);
        return;
      }
      setHistoryLoading(true);
      const data = await fetchRiverHistory14d(selected.river_id);
      if (!cancelled) {
        setHistoryRows(data);
        setHistoryLoading(false);
      }
    }
    loadHistory().catch(() => {
      if (!cancelled) {
        setHistoryRows([]);
        setHistoryLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.river_id]);

  useEffect(() => {
    let cancelled = false;
    async function loadIntraday() {
      if (!selected?.river_id) {
        setIntradayRows([]);
        return;
      }
      setIntradayLoading(true);
      const data = await fetchRiverIntraday24h(selected.river_id);
      if (!cancelled) {
        setIntradayRows(data);
        setIntradayLoading(false);
      }
    }
    loadIntraday().catch(() => {
      if (!cancelled) {
        setIntradayRows([]);
        setIntradayLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.river_id]);

  useEffect(() => {
    let cancelled = false;
    async function loadWeatherAndSites() {
      if (!selected?.river_id) {
        setWeatherRows([]);
        setSourceSites({});
        return;
      }

      const [weather, sites] = await Promise.all([
        fetchRiverWeatherWindow(selected.river_id),
        fetchUsgsSiteSummaries(
          [selected.flow_source_site_no, selected.temp_source_site_no].filter(
            (value): value is string => Boolean(value)
          )
        ),
      ]);

      if (!cancelled) {
        setWeatherRows(weather);
        setSourceSites(sites);
      }
    }

    loadWeatherAndSites().catch(() => {
      if (!cancelled) {
        setWeatherRows([]);
        setSourceSites({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selected?.river_id, selected?.flow_source_site_no, selected?.temp_source_site_no]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<{
        basemap: BasemapId;
        layerState: Record<LayerId, boolean>;
      }>;

      if (parsed.basemap && basemapById[parsed.basemap]) {
        setBasemap(parsed.basemap);
      }

      if (parsed.layerState) {
        const defaults = createDefaultLayerState();
        const merged: Record<LayerId, boolean> = { ...defaults };
        for (const layer of LAYER_REGISTRY) {
          if (typeof parsed.layerState[layer.id] === "boolean") {
            merged[layer.id] = parsed.layerState[layer.id];
          }
        }
        setLayerState(merged);
      }
    } catch {
      /* ignore localStorage parse issues */
    }
  }, [basemapById]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LAYERS_STORAGE_KEY,
        JSON.stringify({ basemap, layerState })
      );
    } catch {
      /* ignore write issues */
    }
  }, [basemap, layerState]);

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
  }

  function onSheetPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;

    dragRef.current = { startY: y, startSheetY: sheetY };
    setIsDragging(true);
    document.body.style.userSelect = "none";

    const onMove = (e2: PointerEvent | TouchEvent) => {
      const y2 =
        "touches" in e2
          ? (e2 as TouchEvent).touches[0]?.clientY
          : (e2 as PointerEvent).clientY;
      if (y2 == null || !dragRef.current) return;
      const dy = y2 - dragRef.current.startY;
      setSheetY(clamp(dragRef.current.startSheetY + dy / 320, 0, 1));
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsDragging(false);
      document.body.style.userSelect = "";
      setSheetY((current) => {
        const snaps: DrawerSnap[] = ["expanded", "mid", "collapsed"];
        const nearest = snaps.reduce(
          (best, next) =>
            Math.abs(current - DRAWER_SNAP_Y[next]) < Math.abs(current - DRAWER_SNAP_Y[best])
              ? next
              : best,
          "mid" as DrawerSnap
        );
        setDrawerSnap(nearest);
        return DRAWER_SNAP_Y[nearest];
      });

      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onUp);
  }

  function zoomIn() {
    mapRef.current?.zoomIn?.({ duration: 180 });
  }

  function zoomOut() {
    mapRef.current?.zoomOut?.({ duration: 180 });
  }

  function recenter() {
    mapRef.current?.flyTo?.({
      center: [-109.75, 47.05],
      zoom: 6.15,
      duration: 450,
      pitch: 14,
      bearing: 0,
      essential: true,
    });
  }

  function fitToRivers() {
    const map = mapRef.current;
    if (!map || !filtered.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    let hasAny = false;

    for (const r of filtered) {
      const lat = r.lat ?? (r as { latitude?: number }).latitude;
      const lng = r.lng ?? (r as { longitude?: number }).longitude;
      const coords: [number, number] | undefined =
        lat != null && lng != null ? [lng, lat] : RIVER_FOCUS_POINTS[r.river_id];

      if (!coords) continue;
      bounds.extend(coords);
      hasAny = true;
    }

    if (hasAny && !bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, duration: 450, essential: true });
    }
  }

  function setBasemapStyle(next: BasemapId) {
    const option = basemapById[next];
    if (!option?.enabled) return;
    setBasemap(next);
  }

  function setLayerEnabled(layerId: LayerId, enabled: boolean) {
    setLayerState((prev) => ({ ...prev, [layerId]: enabled }));
  }

  function resetLayers() {
    setLayerState(createDefaultLayerState());
    setBasemap(DEFAULT_BASEMAP);
  }

  function toggleTopPanel(panel: TopPanel) {
    if (isMobile) {
      setMobileSurfaceState(panel === "layers" ? "tools" : panel === "detail" ? "detail" : "list");
      return;
    }
    setOpenTopPanel((prev) => (prev === panel ? "none" : panel));
  }

  function selectRiver(riverId: string | null) {
    setSelectedId(riverId);
    if (riverId) {
      setSelectionSeq((prev) => prev + 1);
      if (isMobile) {
        setMobileSurfaceState("detail");
      } else {
        setOpenTopPanel("detail");
      }
    }
  }

  function onMobileListPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;
    mobileDragRef.current = { startY: y, startSheetY: mobileSheetY };
    setIsMobileDragging(true);
    document.body.style.userSelect = "none";

    const onMove = (e2: PointerEvent | TouchEvent) => {
      const y2 =
        "touches" in e2
          ? (e2 as TouchEvent).touches[0]?.clientY
          : (e2 as PointerEvent).clientY;
      if (y2 == null || !mobileDragRef.current) return;
      const dy = y2 - mobileDragRef.current.startY;
      setMobileSheetY(clamp(mobileDragRef.current.startSheetY + dy / 420, 0, 1));
    };

    const onUp = () => {
      mobileDragRef.current = null;
      setIsMobileDragging(false);
      document.body.style.userSelect = "";
      setMobileSheetY((current) => {
        const snaps: MobileListSnap[] = ["full", "mid", "peek"];
        const nearest = snaps.reduce(
          (best, next) =>
            Math.abs(current - MOBILE_LIST_SNAP_Y[next]) < Math.abs(current - MOBILE_LIST_SNAP_Y[best])
              ? next
              : best,
          "mid" as MobileListSnap
        );
        setMobileListSnap(nearest);
        return MOBILE_LIST_SNAP_Y[nearest];
      });

      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onUp);
  }

  function onMobileDetailPointerDown(e: React.PointerEvent | React.TouchEvent) {
    const y = "touches" in e ? e.touches[0]?.clientY : (e as React.PointerEvent).clientY;
    if (y == null) return;
    mobileDetailDragRef.current = { startY: y };
    document.body.style.userSelect = "none";

    const onMove = (_: PointerEvent | TouchEvent) => {
      // no-op; we only need swipe distance on release
    };

    const onUp = (e2: PointerEvent | TouchEvent) => {
      const y2 =
        "changedTouches" in e2
          ? (e2 as TouchEvent).changedTouches[0]?.clientY
          : (e2 as PointerEvent).clientY;
      const start = mobileDetailDragRef.current?.startY ?? 0;
      const dy = (y2 ?? start) - start;
      mobileDetailDragRef.current = null;
      document.body.style.userSelect = "";
      if (dy > 90) {
        setMobileSurfaceState("list", { listSnap: "peek" });
      }
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onUp);
  }

  const layersOpen = !isMobile && openTopPanel === "layers";
  const detailsOpen = !isMobile && openTopPanel === "detail";

  useEffect(() => {
    if (!isMobile && detailsOpen && drawerSnap !== "collapsed") {
      setDrawerSnap("collapsed");
      setSheetY(DRAWER_SNAP_Y.collapsed);
    }
  }, [detailsOpen, drawerSnap, isMobile]);

  const groupedLayers = useMemo(
    () =>
      LAYER_GROUP_ORDER.map((group) => ({
        group,
        layers: LAYER_REGISTRY.filter((layer) => layer.group === group),
      })),
    []
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapView
          rivers={filtered}
          selectedRiver={selected}
          selectedRiverName={selected?.river_name ?? null}
          selectedRiverId={selectedId}
          selectedRiverGeojson={selectedGeojson}
          riverLinesGeojson={initialRiverLinesGeojson ?? null}
          activeStationsGeojson={stationGeojson ?? null}
          basemap={basemap}
          layerState={layerState}
          rightPanelOpen={detailsOpen}
          drawerState={isMobile ? "collapsed" : drawerSnap}
          selectionSeq={selectionSeq}
          onSelectRiver={(r) => selectRiver(r.river_id)}
          className="absolute inset-0"
          onMapReady={(m) => {
            mapRef.current = m;
          }}
        />
      </div>

      <aside className="absolute left-4 top-4 z-20 hidden w-[68px] sm:block">
        <div className="mri-control-strip overflow-hidden rounded-[20px]">
          <div className="border-b border-white/8 px-3 py-2.5">
            <div className="text-[15px] font-semibold leading-tight text-white">MRI</div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/56">Montana</div>
          </div>
          <div className="flex flex-col gap-1.5 p-2">
            <button className="onx-iconbtn mri-railbtn" title="Layers" onClick={() => toggleTopPanel("layers")}>
              <Layers size={18} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn mri-railbtn" title="Zoom in" onClick={zoomIn}>
              <Plus size={16} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn mri-railbtn" title="Zoom out" onClick={zoomOut}>
              <Minus size={16} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn mri-railbtn" title="Fit to rivers" onClick={fitToRivers}>
              <Maximize2 size={16} strokeWidth={2.5} />
            </button>
            <button className="onx-iconbtn mri-railbtn" title="Recenter Montana" onClick={recenter}>
              <Crosshair size={16} strokeWidth={2.5} />
            </button>
            <button
              className="onx-iconbtn mri-railbtn"
              title="Toggle list"
              onClick={() => {
                const next = drawerSnap === "collapsed" ? "mid" : "collapsed";
                setDrawerSnap(next);
                setSheetY(DRAWER_SNAP_Y[next]);
              }}
            >
              <List size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </aside>

      <header className="absolute left-4 right-4 top-4 z-20 sm:hidden">
        <div className="onx-glass rounded-xl px-3 py-2">
          <div className="text-[11px] font-medium text-white/84">{dateLabel}</div>
          <div className="text-[10px] text-white/52">Last pull {formatPullTime(latestPullAt)} MT</div>
        </div>
      </header>

      <header className="absolute left-4 right-4 top-4 z-20 hidden sm:block sm:left-[96px] sm:right-[394px]">
        <div className="mri-control-strip rounded-[22px] px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="hidden min-w-[184px] shrink-0 lg:block">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/42">Montana River Intelligence</div>
              <div className="mt-0.5 text-[12px] text-white/72">{dateLabel} • {filtered.length} rivers • Last pull {formatPullTime(latestPullAt)} MT</div>
            </div>
            <div className="flex-1 rounded-2xl border border-white/8 bg-black/12 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/34">River Search</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Montana rivers..."
                className="mt-0.5 mri-topbar-input"
              />
            </div>
            <div className="hidden shrink-0 sm:block">
              <div className="text-right text-[10px] leading-tight text-white/45">Status</div>
              <div className="mt-0.5 text-right text-[11px] font-medium text-white/76">Focused on Montana</div>
            </div>
            <div className="shrink-0">
              <button
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] font-medium text-white/62 transition hover:border-white/18 hover:text-white/88"
                onClick={() => {
                  setSearch("");
                  setTier("All");
                  selectRiver(null);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`mri-chip ${tier === t ? "mri-chip-active" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="absolute right-4 top-4 z-30 hidden items-start gap-2 sm:flex">
        <button
          className={`onx-iconbtn mri-railbtn ${layersOpen ? "ring-2 ring-white/20" : ""}`}
          title="Layers"
          onClick={() => toggleTopPanel("layers")}
        >
          <Layers size={16} strokeWidth={2.5} />
        </button>

        <div
          className={[
            "mri-fade w-[min(360px,calc(100vw-1.5rem))]",
            layersOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        >
          <div className="onx-card rounded-2xl p-4">
            <div className="mri-scroll max-h-[70vh] overflow-auto pr-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Layers</div>
                  <div className="text-[11px] text-slate-500">Map display controls</div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="text-[11px] font-medium text-[var(--mri-text-dim)] hover:text-[var(--mri-text-muted)]"
                    onClick={resetLayers}
                  >
                    Reset
                  </button>
                  <button
                    className="text-[11px] font-medium text-[var(--mri-text-dim)] hover:text-[var(--mri-text-muted)]"
                    onClick={() => setOpenTopPanel("none")}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                Basemap
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {BASEMAP_OPTIONS.map((option) => {
                  const selectedBasemap = basemap === option.id;
                  return (
                    <button
                      key={option.id}
                      disabled={!option.enabled}
                      className={[
                        "rounded-lg border px-2 py-1.5 text-xs font-medium",
                        selectedBasemap
                          ? "border-[var(--mri-border-strong)] bg-[rgba(78,122,146,0.3)] text-[var(--mri-text)]"
                          : "border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] text-[var(--mri-text-muted)]",
                        !option.enabled ? "cursor-not-allowed opacity-55" : "hover:bg-[rgba(26,37,43,0.82)]",
                      ].join(" ")}
                      onClick={() => setBasemapStyle(option.id)}
                    >
                      <div>{option.label}</div>
                      {!option.enabled && option.comingSoon ? (
                        <div className="text-[10px] text-[var(--mri-text-dim)]">Coming soon</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                  Core Layers
                </div>
                <div className="mt-2 space-y-2 rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] p-2.5 text-xs text-[var(--mri-text-muted)]">
                  {groupedLayers
                    .flatMap((g) => g.layers)
                    .filter((layer) => layer.id === "mri_river_lines" || layer.id === "mri_selected_highlight")
                    .map((layer) => (
                      <label key={layer.id} className="flex items-start justify-between gap-3">
                        <span>{layer.label}</span>
                        <input
                          type="checkbox"
                          checked={layerState[layer.id]}
                          onChange={(e) => setLayerEnabled(layer.id, e.target.checked)}
                        />
                      </label>
                    ))}
                </div>
              </div>

              <div className="mt-4">
                <button
                  className="w-full rounded-lg border border-[var(--mri-border)] bg-[rgba(20,29,32,0.72)] px-2.5 py-2 text-left text-xs font-medium text-[var(--mri-text)] hover:bg-[rgba(26,37,43,0.82)]"
                  onClick={() => setAdvancedLayersOpen((v) => !v)}
                >
                  {advancedLayersOpen ? "Hide Advanced Layers" : "Advanced Layers"}
                </button>
              </div>

              {advancedLayersOpen
                ? groupedLayers.map(({ group, layers }) => (
                    <div key={group} className="mt-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">
                        {group}
                      </div>
                      <div className="mt-2 space-y-2 rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] p-2.5 text-xs text-[var(--mri-text-muted)]">
                        {layers
                          .filter(
                            (layer) =>
                              !layer.locked &&
                              layer.id !== "mri_river_lines" &&
                              layer.id !== "mri_selected_highlight"
                          )
                          .map((layer) => (
                            <label key={layer.id} className="flex items-start justify-between gap-3">
                              <span className="leading-tight">
                                <span className="block">{layer.label}</span>
                                {layer.minZoomNote ? (
                                  <span className="text-[10px] text-[var(--mri-text-dim)]">{layer.minZoomNote}</span>
                                ) : null}
                                {layer.comingSoon ? (
                                  <span className="text-[10px] text-[var(--mri-text-dim)]">Coming soon</span>
                                ) : null}
                              </span>
                              <input
                                type="checkbox"
                                checked={layerState[layer.id]}
                                disabled={Boolean(layer.comingSoon)}
                                onChange={(e) => setLayerEnabled(layer.id, e.target.checked)}
                              />
                            </label>
                          ))}
                      </div>
                    </div>
                  ))
                : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className={[
          "absolute bottom-6 right-4 z-20 flex flex-col gap-2 sm:hidden",
          mobileSurface === "detail" || mobileSurface === "tools" ? "pointer-events-none opacity-0" : "opacity-100",
        ].join(" ")}
      >
        <button
          className="onx-glass min-h-11 rounded-xl px-3 text-xs font-semibold text-white active:translate-y-[1px]"
          onClick={() => setMobileSurfaceState(mobileSurface === "tools" ? "list" : "tools")}
        >
          Map Tools
        </button>
        <button
          className="onx-glass min-h-11 rounded-xl px-3 text-xs font-semibold text-white active:translate-y-[1px]"
          onClick={() => setMobileSurfaceState(mobileSurface === "list" ? "map" : "list", { listSnap: "mid" })}
        >
          Rivers
        </button>
      </div>

      <section className="absolute right-4 top-[108px] z-20 hidden w-[360px] sm:block">
        {detailsOpen ? (
          <div className="onx-card max-h-[calc(100vh-132px)] overflow-hidden rounded-[28px] p-5 transition-all duration-150 ease-in-out">
            <div className="flex items-center justify-between">
              <div>
                <div className="mri-surface-label">Instrument Panel</div>
                <div className="mt-1 text-[13px] font-medium text-white/76">Selected river intelligence</div>
              </div>
              <button
                className="text-[11px] text-[var(--mri-text-dim)] hover:text-[var(--mri-text-muted)]"
                onClick={() => setOpenTopPanel("none")}
              >
                Collapse
              </button>
            </div>

            {selected ? (
              <>
                <div className="mri-scroll mt-3 max-h-[calc(100vh-220px)] overflow-auto pr-1">
                <div className="space-y-5">
                  <div>
                    <div className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--mri-text)]">{selected.river_name}</div>
                    <div className="mt-1 text-[12px] text-[var(--mri-text-muted)]">{selected.gauge_label ?? ""}</div>
                    <div className="mt-2 text-[11px] text-[var(--mri-text-dim)]">
                      {formatUpdatedAgo(selected.source_flow_observed_at ?? selected.source_temp_observed_at ?? selected.updated_at)}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[rgba(180,198,209,0.12)] bg-[rgba(18,27,31,0.72)] p-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="mri-surface-label">Fishability Score</div>
                        <div className="mt-2 text-[64px] font-semibold leading-none tracking-[-0.03em] text-[var(--mri-text)]">
                          {selected.fishability_score_calc ?? "—"}
                        </div>
                      </div>
                      <TierPill
                        tier={
                          selected.bite_tier === "HOT" || selected.bite_tier === "GOOD"
                            ? "Good"
                            : selected.bite_tier === "FAIR"
                            ? "Fair"
                            : selected.bite_tier === "TOUGH"
                            ? "Tough"
                            : undefined
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-[rgba(180,198,209,0.1)] bg-[rgba(17,25,28,0.62)] px-4 py-3 text-[12px] leading-5 text-[var(--mri-text-muted)]">
                    <span className="font-medium text-[var(--mri-text)]">Today&apos;s Read</span>
                    <div className="mt-1">{todaysRead}</div>
                  </div>

                  <div className="rounded-xl border border-[var(--mri-border)] bg-[rgba(23,34,40,0.64)] p-3">
                    <div className="flex items-end justify-between">
                      <div className="text-[36px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
                        {selectedFishIndex.value}
                        <span className="ml-1 text-[26px] font-medium text-[var(--mri-text-dim)]">/ 10.0</span>
                      </div>
                      {selectedFishIndex.optimal ? (
                        <span className="rounded border border-[rgba(173,190,202,0.32)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--mri-text-muted)]">
                          Optimal
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <div className="mri-fish-scale-track">
                        <div className="mri-fish-scale-fill" style={{ width: `${selectedFishIndex.percent}%` }} />
                        {selectedFishIndex.normalized != null ? (
                          <div className="mri-fish-scale-marker" style={{ left: `${selectedFishIndex.percent}%` }} />
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-4 text-[10px] uppercase tracking-[0.1em] text-[var(--mri-text-dim)]">
                        <span>Poor</span>
                        <span className="text-center">Fair</span>
                        <span className="text-center">Good</span>
                        <span className="text-right">Excellent</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-[var(--mri-border)] pt-4">
                    <div className="rounded-[18px] border border-[rgba(180,198,209,0.08)] bg-[rgba(16,24,27,0.56)] p-3">
                      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--mri-text-dim)]">Flow</div>
                      <div className="mt-1 text-[17px] font-medium text-[var(--mri-text)]">
                        {selected.flow_cfs ?? "Flow not available at this gauge"}
                        <span className="ml-1 text-xs text-[var(--mri-text-dim)]">
                          {getFlowTrendArrow(selected.change_48h_pct_calc)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-[rgba(180,198,209,0.08)] bg-[rgba(16,24,27,0.56)] p-3">
                      <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--mri-text-dim)]">Temp</div>
                      <div className="mt-1 text-[17px] font-medium text-[var(--mri-text)]">
                        {selected.water_temp_f != null
                          ? `${Number(selected.water_temp_f).toFixed(1)}°F`
                          : "Temp not available at this gauge"}
                      </div>
                      <div className="mt-1 text-[10px] leading-4 text-[var(--mri-text-dim)]">
                        {selected.temp_observed_at
                          ? `Observed ${formatPullTime(selected.temp_observed_at)} MT`
                          : selected.temp_reason ?? "No observed water temperature"}
                      </div>
                    </div>
                  </div>

                  <TrendChart historyRows={historyRows} />

                  <button
                    className="w-full rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.72)] px-3 py-2 text-left text-xs font-medium text-[var(--mri-text-muted)] hover:bg-[rgba(26,37,43,0.82)]"
                    onClick={() => setDetailMetricsOpen((v) => !v)}
                  >
                    {detailMetricsOpen ? "Hide Detailed Metrics" : "Detailed Metrics"}
                  </button>

                  {detailMetricsOpen ? (
                    <div className="space-y-4 border-t border-[var(--mri-border)] pt-4 text-xs text-[var(--mri-text-muted)]">
                      <DetailedMetricsContent analytics={detailedAnalytics} />

                      <button
                        className="w-full rounded-lg border border-[var(--mri-border)] bg-[rgba(21,31,35,0.74)] px-2 py-1.5 text-left text-xs font-medium text-[var(--mri-text)] hover:bg-[rgba(26,37,43,0.82)]"
                        onClick={() => setTransparencyOpen((v) => !v)}
                      >
                        How this score is calculated
                      </button>

                      {transparencyOpen && breakdown ? (
                        <div className="rounded-lg bg-[rgba(21,31,35,0.66)] p-2 text-[11px] text-[var(--mri-text-muted)]">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <div>Flow Score</div>
                            <div className="text-right font-semibold">{formatNum(breakdown.flowScore)}</div>
                            <div>Stability Score</div>
                            <div className="text-right font-semibold">{formatNum(breakdown.stabilityScore)}</div>
                            <div>Thermal Score</div>
                            <div className="text-right font-semibold">
                              {breakdown.thermalScore == null ? "Unavailable" : formatNum(breakdown.thermalScore)}
                            </div>
                            <div>Wind Penalty</div>
                            <div className="text-right font-semibold">{formatNum(breakdown.windPenalty)}</div>
                            <div className="border-t border-[var(--mri-border)] pt-1 font-semibold text-[var(--mri-text)]">Total Score</div>
                            <div className="border-t border-[var(--mri-border)] pt-1 text-right font-semibold text-[var(--mri-text)]">
                              {formatNum(breakdown.totalScore)}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-sm font-semibold text-[var(--mri-text)]">Montana River Intel</div>
                <div className="text-xs text-[var(--mri-text-muted)]">
                  Tap a river in the list to preview details here.
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            className="mri-control-strip rounded-full px-3.5 py-2 text-[11px] font-medium text-white/86 transition-colors duration-150 ease-in-out hover:text-white active:translate-y-[1px]"
            onClick={() => setOpenTopPanel("detail")}
          >
            Open Detail Panel
          </button>
        )}
      </section>

      {isMobile && mobileSurface === "tools" ? (
        <section className="absolute inset-0 z-30 sm:hidden">
          <button
            className="absolute inset-0 bg-black/45"
            aria-label="Close map tools"
            onClick={() => setMobileSurfaceState("list", { listSnap: "peek" })}
          />
          <div className="onx-card absolute inset-x-0 bottom-0 rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-150 ease-in-out">
            <div className="mx-auto mb-3 h-1.5 w-14 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35" style={{ touchAction: "none" }} />
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--mri-text)]">Map Tools</div>
              <button className="rounded-md p-2 text-[var(--mri-text-muted)]" onClick={() => setMobileSurfaceState("list", { listSnap: "peek" })}>
                <X size={18} />
              </button>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">Basemap</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {BASEMAP_OPTIONS.map((option) => (
                <button
                  key={`m-${option.id}`}
                  disabled={!option.enabled}
                  className={[
                    "min-h-11 rounded-lg border px-2 py-1.5 text-xs font-medium",
                    basemap === option.id
                      ? "border-[var(--mri-border-strong)] bg-[rgba(78,122,146,0.3)] text-[var(--mri-text)]"
                      : "border-[var(--mri-border)] bg-[rgba(20,29,32,0.72)] text-[var(--mri-text-muted)]",
                    !option.enabled ? "cursor-not-allowed opacity-55" : "",
                  ].join(" ")}
                  onClick={() => setBasemapStyle(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">Core Layers</div>
            <div className="mt-2 space-y-2 rounded-xl border border-[var(--mri-border)] bg-[rgba(20,29,32,0.74)] p-3 text-xs text-[var(--mri-text-muted)]">
              {groupedLayers
                .flatMap((g) => g.layers)
                .filter((layer) => layer.id === "mri_river_lines" || layer.id === "mri_selected_highlight")
                .map((layer) => (
                  <label key={`ml-${layer.id}`} className="flex items-center justify-between">
                    <span>{layer.label}</span>
                    <input
                      type="checkbox"
                      checked={layerState[layer.id]}
                      onChange={(e) => setLayerEnabled(layer.id, e.target.checked)}
                    />
                  </label>
                ))}
            </div>
          </div>
        </section>
      ) : null}

      {isMobile && mobileSurface === "detail" ? (
        <section className="absolute inset-0 z-20 bg-black/45 sm:hidden">
          <div className="onx-card absolute inset-x-0 bottom-0 max-h-[92vh] overflow-auto rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-150 ease-in-out">
            <div
              className="mx-auto mb-2 h-1.5 w-14 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35"
              onPointerDown={onMobileDetailPointerDown}
              onTouchStart={onMobileDetailPointerDown}
              style={{ touchAction: "none" }}
            />
            <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)]">River Detail</div>
              <button
                className="min-h-11 rounded-md px-3 text-xs font-semibold text-slate-600"
                onClick={() => setMobileSurfaceState("list", { listSnap: "peek" })}
              >
                Close
              </button>
            </div>
            {selected ? (
              <>
                <div className="text-xl font-semibold text-[var(--mri-text)]">{selected.river_name}</div>
                <div className="text-sm text-[var(--mri-text-muted)]">{selected.gauge_label ?? ""}</div>
                <div className="mt-1 text-xs text-[var(--mri-text-dim)]">
                  {formatUpdatedAgo(selected.source_flow_observed_at ?? selected.source_temp_observed_at ?? selected.updated_at)}
                </div>
                <div className="mt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        selected.temp_status === "available_fresh"
                          ? "border-[rgba(110,150,125,0.4)] bg-[rgba(79,103,87,0.2)] text-[#b4ccb9]"
                          : selected.temp_status === "available_stale"
                          ? "border-[rgba(176,112,63,0.42)] bg-[rgba(176,112,63,0.2)] text-[#d7b089]"
                          : "border-[var(--mri-border)] bg-[rgba(21,31,35,0.7)] text-[var(--mri-text-dim)]",
                      ].join(" ")}
                    >
                      {getTempStatusLabel(selected)}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        getConfidenceBadgeClass(selected.confidence_level ?? null),
                      ].join(" ")}
                    >
                      {getConfidenceBadgeLabel(selected)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 text-[56px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
                  {selected.fishability_score_calc ?? "—"}
                </div>
                <div className="mt-2">
                  <TierPill
                    tier={
                      selected.bite_tier === "HOT" || selected.bite_tier === "GOOD"
                        ? "Good"
                        : selected.bite_tier === "FAIR"
                        ? "Fair"
                        : selected.bite_tier === "TOUGH"
                        ? "Tough"
                        : undefined
                    }
                  />
                </div>
                <div className="mt-2 text-xs text-[var(--mri-text-muted)]">{todaysRead}</div>

                <div className="mt-3 rounded-xl border border-[var(--mri-border)] bg-[rgba(23,34,40,0.64)] p-3">
                  <div className="flex items-end justify-between">
                    <div className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-[var(--mri-text)]">
                      {selectedFishIndex.value}
                      <span className="ml-1 text-[22px] font-medium text-[var(--mri-text-dim)]">/ 10.0</span>
                    </div>
                    {selectedFishIndex.optimal ? (
                      <span className="rounded border border-[rgba(173,190,202,0.32)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--mri-text-muted)]">
                        Optimal
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <div className="mri-fish-scale-track">
                      <div className="mri-fish-scale-fill" style={{ width: `${selectedFishIndex.percent}%` }} />
                      {selectedFishIndex.normalized != null ? (
                        <div className="mri-fish-scale-marker" style={{ left: `${selectedFishIndex.percent}%` }} />
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-4 text-[10px] uppercase tracking-[0.1em] text-[var(--mri-text-dim)]">
                      <span>Poor</span>
                      <span className="text-center">Fair</span>
                      <span className="text-center">Good</span>
                      <span className="text-right">Excellent</span>
                    </div>
                  </div>
                </div>

                <div className="my-4 h-px bg-[var(--mri-border)]" />
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--mri-text-dim)]">Flow</div>
                    <div className="font-medium text-[var(--mri-text)]">
                      {selected.flow_cfs ?? "Flow not available at this gauge"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--mri-text-dim)]">Temp</div>
                    <div className="font-medium text-[var(--mri-text)]">
                      {selected.water_temp_f != null
                        ? `${Number(selected.water_temp_f).toFixed(1)}°F`
                        : "Temp not available at this gauge"}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--mri-text-dim)]">
                      {selected.temp_observed_at
                        ? `Observed ${formatPullTime(selected.temp_observed_at)} MT`
                        : selected.temp_reason ?? "No observed water temperature"}
                    </div>
                  </div>
                </div>

                <button
                  className="mt-4 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-left text-xs font-medium text-white/85"
                  onClick={() => setMobileDetailMetricsOpen((v) => !v)}
                >
                  {mobileDetailMetricsOpen ? "Hide Detailed Metrics" : "Detailed Metrics"}
                </button>

                {mobileDetailMetricsOpen ? (
                  <div className="mt-4 space-y-3 border-t border-[var(--mri-border)] pt-4 text-xs text-[var(--mri-text-muted)]">
                    <DetailedMetricsContent analytics={detailedAnalytics} />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-[var(--mri-text-muted)]">Select a river to view details.</div>
            )}
          </div>
        </section>
      ) : null}

      {isMobile && mobileSurface === "list" ? (
        <section
          className="absolute inset-x-0 bottom-0 z-10 sm:hidden"
          style={{
            transform: `translateY(${mobileSheetY * 92}%)`,
            transition: isMobileDragging ? "none" : SNAP_TRANSITION,
          }}
        >
          <div className="rounded-t-3xl border border-white/10 bg-[#0b1220]/94 backdrop-blur-md">
            <div
              className={`mx-auto mt-2 h-1.5 w-14 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35 ${isMobileDragging ? "select-none" : ""}`}
              onPointerDown={onMobileListPointerDown}
              onTouchStart={onMobileListPointerDown}
              style={{ touchAction: "none" }}
            />
            <div className="flex items-center justify-between px-4 pt-3">
              <div className="text-sm font-semibold text-white">Rivers ({filtered.length})</div>
              <button
                className="min-h-11 rounded-md px-3 text-xs font-semibold text-white/80"
                onClick={() => {
                  if (mobileListSnap === "peek") {
                    setMobileListSnap("mid");
                    setMobileSheetY(MOBILE_LIST_SNAP_Y.mid);
                  } else {
                    setMobileListSnap("peek");
                    setMobileSheetY(MOBILE_LIST_SNAP_Y.peek);
                  }
                }}
              >
                {mobileListSnap === "peek" ? "Expand" : "Peek"}
              </button>
            </div>
            <div className="px-4 pt-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rivers..."
                className="mri-topbar-input"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
                  <button key={`m-tier-${t}`} onClick={() => setTier(t)} className={`mri-chip min-h-11 ${tier === t ? "mri-chip-active" : ""}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`mri-scroll max-h-[65vh] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 ${
                mobileListSnap === "full" ? "overflow-auto" : "overflow-hidden"
              }`}
            >
              {topRivers.length > 0 ? (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">Top Rivers Today</div>
                  <div className="mb-3 flex gap-2 overflow-auto">
                    {topRivers.map((r) => (
                      <button
                        key={`m-top-${r.river_id}`}
                        onClick={() => selectRiver(r.river_id)}
                        className={[
                          "min-h-11 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs active:translate-y-[1px]",
                          r.river_id === selectedId
                            ? "border-white/50 bg-white/20 text-white"
                            : "border-white/20 bg-white/10 text-white/85",
                        ].join(" ")}
                      >
                        #{r.fishability_rank ?? "—"} {r.river_name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                {filtered.map((r) => (
                  <button
                    key={`m-r-${r.river_id}`}
                    onClick={() => selectRiver(r.river_id)}
                    className={`mri-drawer-card w-full text-left active:translate-y-[1px] ${r.river_id === selectedId ? "mri-drawer-card-selected" : ""}`}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{r.river_name}</div>
                          <div className="text-xs text-white/60">{r.gauge_label ?? ""}</div>
                        </div>
                        <TierPill
                          tier={
                            r.bite_tier === "HOT" || r.bite_tier === "GOOD"
                              ? "Good"
                              : r.bite_tier === "FAIR"
                              ? "Fair"
                              : r.bite_tier === "TOUGH"
                              ? "Tough"
                              : undefined
                          }
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/88">
                        <div><div className="mri-kv-label">Score</div><div className="font-semibold">{r.fishability_score_calc ?? "—"}</div></div>
                        <div><div className="mri-kv-label">Flow</div><div className="font-semibold">{r.flow_cfs ?? "—"}</div></div>
                        <div><div className="mri-kv-label">Temp</div><div className="font-semibold">{r.water_temp_f != null ? `${Number(r.water_temp_f).toFixed(1)}°` : "—"}</div></div>
                      </div>
                      <div className="mt-2 text-[10px] font-medium tracking-[0.01em] text-white/58">{getRiverTrustLine(r)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div
        className="absolute bottom-0 left-0 right-0 z-10 hidden sm:block"
        style={{
          transform: `translateY(${sheetY * 92}%)`,
          transition: isDragging ? "none" : SNAP_TRANSITION,
        }}
      >
        <div className={`mx-auto max-w-6xl px-3 pb-3 ${detailsOpen ? "sm:pr-[384px]" : ""}`}>
          <div className="mri-control-strip overflow-hidden rounded-[28px]">
            <div
              className={`mx-auto mt-2 h-1.5 w-14 flex-shrink-0 cursor-grab rounded-full bg-white/45 ring-1 ring-white/35 active:cursor-grabbing ${isDragging ? "select-none" : ""}`}
              onPointerDown={onSheetPointerDown}
              onTouchStart={onSheetPointerDown}
              title="Drag to expand/collapse"
              style={{ touchAction: "none" }}
            />
            <div className="flex items-center justify-between px-4 pt-3">
              <div>
                <div className="mri-surface-label">Top Rivers Today</div>
                <div className="mt-1 text-[13px] font-medium text-white/82">Fast scan of Montana conditions</div>
              </div>
              <button
                className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] font-medium text-white/72 transition hover:border-white/18 hover:text-white"
                onClick={() => {
                  const next = drawerSnap === "collapsed" ? "mid" : "collapsed";
                  setDrawerSnap(next);
                  setSheetY(DRAWER_SNAP_Y[next]);
                }}
              >
                {drawerSnap === "collapsed" ? "Open Tray" : "Collapse"}
              </button>
            </div>

            {topRivers.length > 0 ? (
              <div className="px-4 pt-2">
                <div className="flex gap-1.5 overflow-auto pb-1">
                  {topRivers.map((r) => (
                    <button
                      key={`top-${r.river_id}`}
                      onClick={() => selectRiver(r.river_id)}
                      className={[
                        "whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition active:translate-y-[1px]",
                        r.river_id === selectedId
                          ? "border-white/50 bg-white/20 text-white"
                          : "border-white/20 bg-white/10 text-white/85 hover:bg-white/15",
                      ].join(" ")}
                    >
                      #{r.fishability_rank ?? "—"} {r.river_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="px-3 pb-3 pt-2">
              <div
                className={`mri-scroll pr-1 transition-[max-height] duration-200 ease-in-out ${
                  drawerSnap === "expanded" ? "overflow-auto" : "overflow-hidden"
                }`}
                style={{
                  maxHeight: drawerSnap === "expanded" ? "34vh" : drawerSnap === "mid" ? "17vh" : "96px",
                }}
              >
                <div className="flex gap-2 overflow-auto pb-1">
                  {filtered.map((r) => (
                    <DesktopTrayCard
                      key={r.river_id}
                      river={r}
                      selected={r.river_id === selectedId}
                      onSelect={() => selectRiver(r.river_id)}
                    />
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-white/70">
                    No rivers match your search/filter.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
