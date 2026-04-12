"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Layers, Plus, Minus, Maximize2, Crosshair, ChevronLeft, X } from "lucide-react";
import { MapView } from "@/components/MapView";
import { fetchRiverGeom } from "@/lib/supabase";
import { fetchRiverGeojsonBrowser } from "@/lib/supabaseBrowser";
import { RIVER_FOCUS_POINTS } from "@/lib/river-focus-points";
import { deriveScoreBreakdown } from "@/lib/scoreBreakdown";
import { generateTodaysRead } from "@/lib/todaysRead";
import { buildDecisionCard, type DecisionCard } from "@/lib/decisionCard";
import type { RiverSegmentPoint } from "@/app/api/river-segments/route";
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

// ─── Tier helpers ───────────────────────────────────────────────────────────

function getTierColors(tier?: string | null) {
  if (tier === "HOT") {
    return { bg: "#1a3d0e", text: "#ffffff", dot: "#a3d977", label: "Hot", accent: "#2d5a1b" };
  }
  if (tier === "GOOD") {
    return { bg: "#dcf0d4", text: "#2d5a1b", dot: "#2d5a1b", label: "Good", accent: null };
  }
  if (tier === "FAIR") {
    return { bg: "#fef3c7", text: "#92400e", dot: "#d4900a", label: "Fair", accent: "#d4900a" };
  }
  if (tier === "TOUGH") {
    return { bg: "#fee2e2", text: "#991b1b", dot: "#dc2626", label: "Tough", accent: "#dc2626" };
  }
  return { bg: "#f3f4f6", text: "#6b7280", dot: "#9ca3af", label: "—" };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

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
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
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
  return { value: normalized.toFixed(1), normalized, percent, band, optimal: normalized >= 7.5 && normalized <= 9.2 };
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
  if (river.temp_status === "unavailable_at_gauge") return "Temp unavailable at gauge";
  return "Temp fresh";
}

function getConfidenceBadgeLabel(river: River | null | undefined): string {
  if (!river?.confidence_level) return "Confidence unavailable";
  return `${river.confidence_level} confidence`;
}

function formatDetailedTime(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Unavailable";
  return (
    dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Denver",
    }) + " MT"
  );
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

// ─── MetricRow / MetricsSection / DetailedMetricsContent ────────────────────

function MetricRow({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="mri-metric-row">
      <div className="min-w-0">
        <div className="mri-metric-label">{label}</div>
        {note ? <div className="mri-metric-note">{note}</div> : null}
      </div>
      <div className="mri-metric-value">{value}</div>
    </div>
  );
}

function MetricsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mri-metrics-section">
      <div className="mri-metrics-section-title">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DetailedMetricsContent({ analytics }: { analytics: RiverDetailAnalytics | null }) {
  if (!analytics) {
    return <div className="text-[11px] text-[var(--mri-text-muted)]">No metrics available.</div>;
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
        <MetricRow label="Current Water Temperature" value={formatMetricNumber(analytics.thermal.currentWaterTempF, { digits: 1, suffix: "°F" })} />
        <MetricRow label="Temperature Source Type" value={analytics.thermal.tempSourceKind ?? "Unknown"} />
        <MetricRow label="Temperature Observed At" value={formatDetailedTime(analytics.thermal.tempObservedAt)} />
        <MetricRow label="Temperature Confidence" value={analytics.thermal.tempConfidence ?? "Unavailable"} />
        <MetricRow label="Thermal Trend" value={formatTempTrend(analytics.thermal.thermalTrendLabel, analytics.thermal.thermalTrendDelta24hF)} />
        <MetricRow label="Thermal Status" value={analytics.thermal.thermalStatus ?? "Unavailable"} />
        <MetricRow label="3-Day Water Temp Direction" value={analytics.thermal.direction3Day ?? "Forecast not yet enabled"} />
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
        <MetricRow label="Precipitation Probability" value={formatMetricNumber(analytics.weather.precipChancePct, { digits: 0, suffix: "%" })} />
        <MetricRow label="Cloud Cover" value={formatMetricNumber(analytics.weather.cloudCoverPct, { digits: 0, suffix: "%" })} />
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
        <MetricRow label="Tomorrow Air Temp" value={analytics.forecast.day1.available ? formatMetricNumber(analytics.forecast.day1.airTempF, { digits: 0, suffix: "°F" }) : "Forecast not yet enabled"} />
        <MetricRow label="Tomorrow Wind" value={analytics.forecast.day1.available ? formatMetricNumber(analytics.forecast.day1.windMph, { digits: 0, suffix: " mph" }) : "Forecast not yet enabled"} />
        <MetricRow label="Tomorrow Precip Chance" value={analytics.forecast.day1.available ? formatMetricNumber(analytics.forecast.day1.precipChancePct, { digits: 0, suffix: "%" }) : "Forecast not yet enabled"} />
        <MetricRow label="Day 2 Air Temp" value={analytics.forecast.day2.available ? formatMetricNumber(analytics.forecast.day2.airTempF, { digits: 0, suffix: "°F" }) : "Forecast not yet enabled"} />
        <MetricRow label="Day 2 Wind" value={analytics.forecast.day2.available ? formatMetricNumber(analytics.forecast.day2.windMph, { digits: 0, suffix: " mph" }) : "Forecast not yet enabled"} />
        <MetricRow label="Day 2 Precip Chance" value={analytics.forecast.day2.available ? formatMetricNumber(analytics.forecast.day2.precipChancePct, { digits: 0, suffix: "%" }) : "Forecast not yet enabled"} />
        <MetricRow label="Day 3 Air Temp" value={analytics.forecast.day3.available ? formatMetricNumber(analytics.forecast.day3.airTempF, { digits: 0, suffix: "°F" }) : "Forecast not yet enabled"} />
        <MetricRow label="Day 3 Wind" value={analytics.forecast.day3.available ? formatMetricNumber(analytics.forecast.day3.windMph, { digits: 0, suffix: " mph" }) : "Forecast not yet enabled"} />
        <MetricRow label="Day 3 Precip Chance" value={analytics.forecast.day3.available ? formatMetricNumber(analytics.forecast.day3.precipChancePct, { digits: 0, suffix: "%" }) : "Forecast not yet enabled"} />
        <MetricRow label="3-Day Wind Outlook" value={analytics.forecast.windOutlook ?? "Forecast not yet enabled"} />
        <MetricRow label="3-Day Fishing Outlook" value={analytics.forecast.fishingOutlook ?? "Forecast model not yet enabled"} />
        <MetricRow label="3-Day Flow Outlook" value={analytics.forecast.flowOutlook ?? "Flow forecast not yet enabled"} />
      </MetricsSection>

      <MetricsSection title="Biology">
        <MetricRow label="Hatch Likelihood" value={analytics.biology.hatchLikelihood ?? "Unavailable"} note="Derived from season, temperature, and stability" />
        <MetricRow label="Dry Fly Viability" value={analytics.biology.dryFlyViability ?? "Unavailable"} />
        <MetricRow label="Tactical Read" value={analytics.biology.tacticalRead ?? "Unavailable"} />
      </MetricsSection>

      <MetricsSection title="Data Quality / Source Trust">
        <MetricRow label="Flow Source Site" value={formatSourceSite(analytics.sourceTrust.flowSourceSiteNo, analytics.sourceTrust.flowSourceSiteName)} />
        <MetricRow label="Temperature Source Site" value={formatSourceSite(analytics.sourceTrust.tempSourceSiteNo, analytics.sourceTrust.tempSourceSiteName)} />
        <MetricRow label="Temp Source Kind" value={analytics.sourceTrust.tempSourceKind ?? "Unknown"} />
        <MetricRow label="Observation Timestamp" value={analytics.sourceTrust.observationTimestamp ? formatDetailedTime(analytics.sourceTrust.observationTimestamp) : "Unavailable"} />
        <MetricRow label="Last Hydrology Pull" value={analytics.sourceTrust.lastHydrologyPullAt ? formatDetailedTime(analytics.sourceTrust.lastHydrologyPullAt) : "Unavailable"} />
        <MetricRow label="Data Confidence" value={analytics.sourceTrust.overallConfidence ?? "Unavailable"} />
        {(() => {
          const significant = analytics.sourceTrust.missingInputs.filter(m => m !== "historical percentile");
          return significant.length > 0
            ? <MetricRow label="Missing Inputs" value={significant.join(", ")} />
            : null;
        })()}
      </MetricsSection>
    </div>
  );
}

// ─── TrendChart ─────────────────────────────────────────────────────────────

type HistoryRow = {
  obs_date: string;
  flow_cfs: number | null;
  water_temp_f: number | null;
  fishability_score: number | null;
};

const TC_VB_W = 300;

function buildSmoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1);
    d += ` C${cx},${pts[i][1].toFixed(1)} ${cx},${pts[i + 1][1].toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

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

function fmtShortDate(d: string | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TrendChart({ historyRows }: { historyRows: HistoryRow[] }) {
  const rows = useMemo(
    () => [...historyRows].sort((a, b) => a.obs_date.localeCompare(b.obs_date)),
    [historyRows]
  );

  if (rows.length < 2) return null;

  const H1 = 44;
  const H2 = 52;
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
    <div className="mri-card p-3 space-y-3 overflow-hidden">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--mri-text-dim)]">14-Day Trends</div>

      {hasScore && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] text-[var(--mri-text-muted)]">Fishability</span>
            {lastRow?.fishability_score != null && (
              <span className="text-[10px] font-semibold" style={{ color: "#2d5a1b" }}>
                {Math.round(lastRow.fishability_score)} today
              </span>
            )}
          </div>
          <svg viewBox={`0 0 ${TC_VB_W} ${H1}`} width="100%" height={H1} preserveAspectRatio="none" style={{ display: "block" }}>
            {scoreAreaPath && <path d={scoreAreaPath} fill="#2d5a1b" fillOpacity="0.08" />}
            <path d={buildSmoothPath(scorePts)} fill="none" stroke="#2d5a1b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {scorePts.at(-1) && (
              <circle cx={scorePts.at(-1)![0]} cy={scorePts.at(-1)![1]} r="3" fill="#2d5a1b" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className="mt-0.5 flex justify-between text-[9px] text-[var(--mri-text-dim)]">
            <span>{firstDate}</span>
            {scoreMin !== scoreMax && <span>{Math.round(scoreMin)}–{Math.round(scoreMax)}</span>}
            <span>{lastDate}</span>
          </div>
        </div>
      )}

      {(hasFlow || hasTemp) && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] text-[var(--mri-text-muted)]">Flow &amp; Temp</span>
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              {hasFlow && lastRow?.flow_cfs != null && (
                <span style={{ color: "#5b9bd5" }}>{Math.round(lastRow.flow_cfs).toLocaleString()} cfs</span>
              )}
              {hasTemp && lastRow?.water_temp_f != null && (
                <span style={{ color: MRI_COLORS.warning }}>{lastRow.water_temp_f.toFixed(1)}°F</span>
              )}
            </div>
          </div>
          <svg viewBox={`0 0 ${TC_VB_W} ${H2}`} width="100%" height={H2} preserveAspectRatio="none" style={{ display: "block" }}>
            {hasFlow && <path d={buildSmoothPath(flowPts)} fill="none" stroke="#5b9bd5" strokeWidth="1.5" strokeOpacity="0.8" vectorEffect="non-scaling-stroke" />}
            {hasTemp && <path d={buildSmoothPath(tempPts)} fill="none" stroke={MRI_COLORS.warning} strokeWidth="1.5" strokeOpacity="0.8" vectorEffect="non-scaling-stroke" />}
            {hasFlow && flowPts.at(-1) && (
              <circle cx={flowPts.at(-1)![0]} cy={flowPts.at(-1)![1]} r="2.5" fill="#5b9bd5" vectorEffect="non-scaling-stroke" />
            )}
            {hasTemp && tempPts.at(-1) && (
              <circle cx={tempPts.at(-1)![0]} cy={tempPts.at(-1)![1]} r="2.5" fill={MRI_COLORS.warning} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className="mt-0.5 flex items-start justify-between text-[9px]">
            <div className="flex flex-col gap-0.5">
              {hasFlow && <span style={{ color: "#5b9bd5aa" }}>{Math.round(flowMin).toLocaleString()}–{Math.round(flowMax).toLocaleString()} cfs</span>}
              {hasTemp && <span style={{ color: `${MRI_COLORS.warning}99` }}>{tempMin.toFixed(0)}–{tempMax.toFixed(0)}°F</span>}
            </div>
            <div className="flex flex-col items-end text-[var(--mri-text-dim)]">
              <span>{firstDate}</span>
              <span>{lastDate}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RiverRow ────────────────────────────────────────────────────────────────

function RiverRow({
  river,
  selected,
  onSelect,
}: {
  river: River;
  selected: boolean;
  onSelect: () => void;
}) {
  const tc = getTierColors(river.bite_tier);
  const score = river.fishability_score_calc;

  const isHot = river.bite_tier === "HOT";

  return (
    <button
      onClick={onSelect}
      className={`mri-river-row ${selected ? "mri-river-row-selected" : ""}`}
      style={isHot ? { borderLeft: "2px solid #2d5a1b", paddingLeft: "calc(var(--mri-row-px, 12px) - 2px)" } : undefined}
    >
      <div
        className="mri-score-badge"
        style={{ background: tc.bg, color: tc.text, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}
      >
        <span>{score != null ? Math.round(score) : "—"}</span>
        {isHot && <span style={{ fontSize: 7, color: "#a3d977", fontWeight: 700, letterSpacing: "0.05em", lineHeight: 1.2 }}>HOT</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--mri-text)] truncate leading-tight">{river.river_name}</div>
        <div className="text-[10px] text-[var(--mri-text-dim)] truncate mt-0.5">{river.gauge_label ?? ""}</div>
      </div>
      <div className="text-right text-[11px] text-[var(--mri-text-muted)] flex-shrink-0">
        <div>{river.flow_cfs != null ? `${Number(river.flow_cfs).toLocaleString()} cfs` : "—"}</div>
        <div>{river.water_temp_f != null ? `${Number(river.water_temp_f).toFixed(1)}°F` : "—"}</div>
      </div>
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc.dot }} />
    </button>
  );
}

// ─── LayersPanel ─────────────────────────────────────────────────────────────

function LayersPanel({
  basemap,
  layerState,
  advancedOpen,
  onBasemap,
  onLayer,
  onReset,
  onClose,
  onToggleAdvanced,
}: {
  basemap: BasemapId;
  layerState: Record<LayerId, boolean>;
  advancedOpen: boolean;
  onBasemap: (id: BasemapId) => void;
  onLayer: (id: LayerId, v: boolean) => void;
  onReset: () => void;
  onClose: () => void;
  onToggleAdvanced: () => void;
}) {
  const coreLayers = useMemo(() => LAYER_REGISTRY.filter((l) => l.group === "Core" && !l.locked), []);
  const publicLandsLayers = useMemo(() => LAYER_REGISTRY.filter((l) => l.group === "Public Lands"), []);
  const advancedLayers = useMemo(() => LAYER_REGISTRY.filter((l) => l.group === "Advanced" && !l.locked), []);

  function LayerToggle({ layer }: { layer: (typeof LAYER_REGISTRY)[number] }) {
    return (
      <label className="flex items-start justify-between gap-2 text-[12px] text-[var(--mri-text-muted)] cursor-pointer">
        <span className="leading-tight">
          {layer.label}
          {layer.minZoomNote && <span className="block text-[10px] text-[var(--mri-text-dim)]">{layer.minZoomNote}</span>}
          {layer.comingSoon && <span className="block text-[10px] text-[var(--mri-text-dim)]">Coming soon</span>}
        </span>
        <input
          type="checkbox"
          checked={layerState[layer.id]}
          disabled={Boolean(layer.comingSoon)}
          onChange={(e) => onLayer(layer.id, e.target.checked)}
          className="mt-0.5 accent-[#2d5a1b] flex-shrink-0"
        />
      </label>
    );
  }

  return (
    <div className="mri-layers-panel w-[300px] p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[13px] font-semibold text-[var(--mri-text)]">Map Layers</div>
          <div className="text-[11px] text-[var(--mri-text-muted)]">Display controls</div>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-[11px] text-[var(--mri-text-muted)] hover:text-[var(--mri-text)]" onClick={onReset}>Reset</button>
          <button className="mri-rail-btn" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      <div className="mri-scroll max-h-[65vh] overflow-auto space-y-4">
        {/* Core */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)] mb-2">Core</div>
          <div className="mri-card p-2.5 space-y-2">
            {coreLayers.map((layer) => <LayerToggle key={layer.id} layer={layer} />)}
          </div>
        </div>

        {/* Basemap */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)] mb-2">Basemap</div>
          <div className="grid grid-cols-2 gap-1.5">
            {BASEMAP_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                disabled={!opt.enabled}
                className={[
                  "rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors",
                  basemap === opt.id
                    ? "border-[#2d5a1b] bg-[#dcf0d4] text-[#2d5a1b]"
                    : "border-[var(--mri-border)] bg-white text-[var(--mri-text-muted)] hover:bg-stone-50",
                  !opt.enabled ? "opacity-40 cursor-not-allowed" : "",
                ].join(" ")}
                onClick={() => onBasemap(opt.id)}
              >
                {opt.label}
                {!opt.enabled && opt.comingSoon ? (
                  <div className="text-[9px] text-[var(--mri-text-dim)]">Soon</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Public Lands */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)] mb-2">Public Lands</div>
          <div className="mri-card p-2.5 space-y-2">
            {publicLandsLayers.map((layer) => <LayerToggle key={layer.id} layer={layer} />)}
          </div>
        </div>

        {/* Advanced (collapsed) */}
        <div>
          <button
            className="w-full text-left text-[12px] font-medium text-[var(--mri-text-muted)] hover:text-[var(--mri-text)] py-1"
            onClick={onToggleAdvanced}
          >
            {advancedOpen ? "Advanced ↑" : "Advanced ↓"}
          </button>
          {advancedOpen && (
            <div className="mri-card p-2.5 space-y-2 mt-2">
              {advancedLayers.map((layer) => <LayerToggle key={layer.id} layer={layer} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AccessWeatherPanel ───────────────────────────────────────────────────────

type AccessWeatherPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  temp_f: number | null;
  wind_mph: number | null;
  wind_dir_deg: number | null;
  wind_direction: string | null;
  gust_mph: number | null;
  precip_chance_pct: number | null;
};

function WindArrow({ deg }: { deg: number }) {
  // Arrow points "from" — rotate so 0° (N wind, blowing south) points down
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ transform: `rotate(${deg}deg)`, flexShrink: 0 }}
      aria-hidden="true"
    >
      <line x1="7" y1="12" x2="7" y2="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <polyline points="4,5 7,2 10,5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccessWeatherSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="mri-card p-3 animate-pulse">
          <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
          <div className="flex gap-3">
            <div className="h-3 w-16 bg-gray-100 rounded" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// UUID regex — skip the fetch if we only have a slug
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AccessWeatherPanel({ riverId }: { riverId: string }) {
  const [points, setPoints] = useState<AccessWeatherPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isUuid = UUID_RE.test(riverId);

  useEffect(() => {
    if (!isUuid) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    fetch(`/api/access-weather?river_id=${encodeURIComponent(riverId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: AccessWeatherPoint[]) => {
        setPoints(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [riverId, isUuid]);

  if (!isUuid) return null;

  if (loading) {
    return (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)] mb-2">
          Conditions by Access Point
        </div>
        <AccessWeatherSkeleton />
      </div>
    );
  }

  if (error || points.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mri-text-dim)] mb-2">
        Conditions by Access Point
      </div>
      <div className="space-y-1.5">
        {points.map((pt) => {
          const showGust = pt.gust_mph != null && pt.wind_mph != null && pt.gust_mph > pt.wind_mph + 5;
          const showPrecip = pt.precip_chance_pct != null && pt.precip_chance_pct > 20;
          return (
            <div key={pt.id} className="mri-card px-3 py-2.5" style={{ minHeight: 48 }}>
              <div className="text-[12px] font-semibold text-[var(--mri-text)] leading-snug truncate mb-1.5">
                {pt.name}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Wind */}
                {pt.wind_mph != null && (
                  <div className="flex items-center gap-1 text-[11px] text-[var(--mri-text-muted)]">
                    {pt.wind_dir_deg != null && (
                      <span className="text-[var(--mri-text-dim)]">
                        <WindArrow deg={pt.wind_dir_deg} />
                      </span>
                    )}
                    <span className="font-medium text-[var(--mri-text)]">
                      {pt.wind_mph.toFixed(0)} mph
                    </span>
                    {pt.wind_direction && (
                      <span className="text-[var(--mri-text-dim)]">{pt.wind_direction}</span>
                    )}
                    {showGust && (
                      <span className="text-[var(--mri-text-dim)]">
                        · gusts {pt.gust_mph!.toFixed(0)}
                      </span>
                    )}
                  </div>
                )}
                {/* Temp */}
                {pt.temp_f != null && (
                  <div className="text-[11px] text-[var(--mri-text-muted)]">
                    <span className="font-medium text-[var(--mri-text)]">{pt.temp_f.toFixed(0)}°F</span>
                  </div>
                )}
                {/* Precip */}
                {showPrecip && (
                  <div className="text-[11px] text-[var(--mri-text-muted)]">
                    <span className="font-medium text-[var(--mri-text)]">{pt.precip_chance_pct}%</span> precip
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RiverStationStrip ───────────────────────────────────────────────────────

function StationStripSkeleton() {
  return (
    <div style={{ background: "var(--mri-surface)", border: "0.5px solid var(--mri-border)", borderRadius: 12, padding: "10px 12px", overflow: "hidden" }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "var(--mri-text-dim)", marginBottom: 10 }}>
        Conditions Along the River
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{ flex: 1, height: 1, background: "rgba(91,155,213,0.25)", position: "relative" as const }}>
                <div style={{ position: "absolute" as const, right: -3, top: -3, width: 0, height: 0, borderTop: "3.5px solid transparent", borderBottom: "3.5px solid transparent", borderLeft: "5px solid rgba(91,155,213,0.25)" }} />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, width: 72 }}>
              <div style={{ height: 8, width: 48, borderRadius: 4, background: "#e5e7eb" }} />
              <div style={{ height: 10, width: 32, borderRadius: 4, background: "#e5e7eb" }} />
              <div style={{ height: 8, width: 24, borderRadius: 4, background: "#f3f4f6" }} />
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function RiverStationStrip({ riverId }: { riverId: string }) {
  const [segments, setSegments] = useState<RiverSegmentPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSegments(null);
    fetch(`/api/river-segments?river_id=${encodeURIComponent(riverId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: RiverSegmentPoint[]) => {
        if (!cancelled) { setSegments(data); setLoading(false); }
      })
      .catch(() => {
        if (!cancelled) { setSegments([]); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [riverId]);

  if (loading) return <StationStripSkeleton />;
  if (!segments || segments.length < 2) return null;

  return (
    <div style={{ background: "var(--mri-surface)", border: "0.5px solid var(--mri-border)", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "var(--mri-text-dim)", marginBottom: 10 }}>
        Conditions Along the River
      </div>
      {/* Scrollable strip — horizontal scroll for rivers with many segments */}
      <div style={{ display: "flex", alignItems: "center", overflowX: "auto", paddingBottom: 2 }}>
        {segments.map((seg, i) => (
          <React.Fragment key={seg.site_no}>
            {/* Connector line between stations */}
            {i > 0 && (
              <div style={{ flexShrink: 0, position: "relative" as const, width: 24, height: 1, background: "rgba(91,155,213,0.30)" }}>
                <div style={{
                  position: "absolute" as const, right: -2, top: -3,
                  width: 0, height: 0,
                  borderTop: "3.5px solid transparent",
                  borderBottom: "3.5px solid transparent",
                  borderLeft: "5px solid rgba(91,155,213,0.40)",
                }} />
              </div>
            )}
            {/* Station column — flex-shrink: 0 prevents compression on many-station rivers */}
            <div style={{
              display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3,
              padding: "6px 4px",
              borderRadius: 8,
              minWidth: 60,
              flexShrink: 0,
              background: seg.is_primary ? "rgba(45,90,27,0.05)" : "transparent",
            }}>
              <div style={{ fontSize: 10, color: "var(--mri-text-muted)", textAlign: "center" as const, lineHeight: 1.2, width: 64, wordBreak: "break-word" as const }}>
                {seg.display_name}
              </div>
              {seg.is_primary && (
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2d5a1b" }} />
              )}
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mri-text)", lineHeight: 1 }}>
                {seg.flow_cfs != null ? `${Math.round(seg.flow_cfs).toLocaleString()}` : "—"}
              </div>
              <div style={{ fontSize: 9, color: "var(--mri-text-dim)", lineHeight: 1 }}>
                {seg.flow_cfs != null ? "cfs" : ""}
              </div>
              <div style={{ fontSize: 11, color: "var(--mri-text-muted)", lineHeight: 1 }}>
                {seg.water_temp_f != null ? `${seg.water_temp_f.toFixed(1)}°F` : "—"}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── DecisionCardUI ───────────────────────────────────────────────────────────

function GoIcon({ label }: { label: string }) {
  const excellent = label === "Excellent" || label === "Good";
  const color = excellent ? "#2d5a1b" : label === "Fair" ? "#d4900a" : "#dc2626";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      {excellent ? (
        <>
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <polyline points="5,8.5 7,10.5 11,6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
          <line x1="8" y1="5" x2="8" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.75" fill={color} />
        </>
      )}
    </svg>
  );
}

function AccessIcon({ icon }: { icon: DecisionCard["access"]["icon"] }) {
  if (icon === "caution") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <polygon points="8,2 15,14 1,14" stroke="#d4900a" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <line x1="8" y1="7" x2="8" y2="10.5" stroke="#d4900a" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="12.5" r="0.7" fill="#d4900a" />
      </svg>
    );
  }
  if (icon === "drift") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M2 10 Q5 6 8 9 Q11 12 14 8" stroke="#5b9bd5" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M3 8 L3 11 L9 11 L9 8 Q6 6 3 8Z" stroke="#5b9bd5" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "both") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="5" cy="3" r="1.5" stroke="#2d5a1b" strokeWidth="1.2" />
        <path d="M5 5 L5 10 M3 7 L7 7 M5 10 L3.5 13 M5 10 L6.5 13" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M10 8 Q12 6 14 8" stroke="#5b9bd5" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <path d="M9 9 L9 11.5 L15 11.5 L15 9 Q12 7.5 9 9Z" stroke="#5b9bd5" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
      </svg>
    );
  }
  // wade
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="3" r="1.5" stroke="#2d5a1b" strokeWidth="1.2" />
      <path d="M8 5 L8 10 M6 7 L10 7 M8 10 L6 13.5 M8 10 L10 13.5" stroke="#2d5a1b" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HatchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <ellipse cx="8" cy="9" rx="2" ry="3" stroke="#92400e" strokeWidth="1.2" />
      <path d="M8 6 Q5 4 2 5" stroke="#92400e" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 6 Q11 4 14 5" stroke="#92400e" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 8 Q5 7 3 8" stroke="#92400e" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <path d="M8 8 Q11 7 13 8" stroke="#92400e" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function ClarityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M8 2 Q10 6 10 9 A2 2 0 0 1 6 9 Q6 6 8 2Z" stroke="#5b9bd5" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function BestTimeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="5.5" stroke="#d4900a" strokeWidth="1.3" />
      <line x1="8" y1="5" x2="8" y2="8" stroke="#d4900a" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="8" x2="10.5" y2="9.5" stroke="#d4900a" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function DecisionCardRow({
  icon,
  label,
  detail,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 12px",
        borderBottom: last ? "none" : "0.5px solid var(--mri-border)",
        minHeight: 44,
      }}
    >
      <div style={{ marginTop: 2 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--mri-text)", lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--mri-text-muted)", marginTop: 2, lineHeight: 1.4 }}>{detail}</div>
      </div>
    </div>
  );
}

function DecisionCardUI({ card }: { card: DecisionCard }) {
  return (
    <div
      style={{
        background: "var(--mri-surface)",
        border: "0.5px solid var(--mri-border)",
        borderRadius: 12,
        boxShadow: "var(--mri-shadow-sm)",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--mri-text-dim)", padding: "8px 12px 4px" }}>
        Quick Read
      </div>
      <DecisionCardRow
        icon={<GoIcon label={card.go.label} />}
        label={card.go.label}
        detail={card.go.detail}
      />
      <DecisionCardRow
        icon={<AccessIcon icon={card.access.icon} />}
        label={card.access.label}
        detail={card.access.detail}
      />
      <DecisionCardRow
        icon={<HatchIcon />}
        label={card.hatch.label}
        detail={card.hatch.detail}
      />
      <DecisionCardRow
        icon={<ClarityIcon />}
        label={card.clarity.label}
        detail={card.clarity.detail}
      />
      <DecisionCardRow
        icon={<BestTimeIcon />}
        label={card.bestTime.label}
        detail={card.bestTime.detail}
        last
      />
    </div>
  );
}

// ─── RiverDetailContent ───────────────────────────────────────────────────────

function RiverDetailContent({
  selected,
  selectedFishIndex,
  todaysRead,
  historyRows,
  detailedAnalytics,
  breakdown,
  detailMetricsOpen,
  transparencyOpen,
  onToggleMetrics,
  onToggleTransparency,
  decisionCard,
}: {
  selected: River;
  selectedFishIndex: ReturnType<typeof getFishabilityIndex>;
  todaysRead: string;
  historyRows: HistoryRow[];
  detailedAnalytics: RiverDetailAnalytics | null;
  breakdown: ReturnType<typeof deriveScoreBreakdown> | null;
  detailMetricsOpen: boolean;
  transparencyOpen: boolean;
  onToggleMetrics: () => void;
  onToggleTransparency: () => void;
  decisionCard: DecisionCard | null;
}) {
  const tc = getTierColors(selected.bite_tier);
  const score = selected.fishability_score_calc;
  const riverId = selected.river_id;

  const isHot = selected.bite_tier === "HOT";

  return (
    <div className="space-y-3">
      {/* Decision Card — at top of detail panel */}
      {decisionCard && <DecisionCardUI card={decisionCard} />}

      {/* Station strip — multi-gauge longitudinal view */}
      <RiverStationStrip riverId={riverId} />

      {/* Tier accent bar — top of panel, visible for all tiers except GOOD */}
      {tc.accent && (
        <div style={{ height: 3, background: tc.accent, borderRadius: "2px 2px 0 0", marginBottom: -4 }} />
      )}
      {/* Score + tier */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div
            className="text-[56px] font-bold leading-none tracking-tight"
            style={{ color: isHot ? "#1a3d0e" : tc.text }}
          >
            {score != null ? Math.round(score) : "—"}
          </div>
          <div className="text-[11px] text-[var(--mri-text-dim)] mt-1">{formatUpdatedAgo(selected.updated_at)}</div>
        </div>
        <div className="flex-shrink-0 text-right">
          <span
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: tc.bg, color: tc.text }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: tc.dot }} />
            {tc.label}
          </span>
          <div className="mt-1 text-[10px] text-[var(--mri-text-dim)]">{selectedFishIndex.band}</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mri-score-bar-track">
        <div className="mri-score-bar-fill" style={{ width: `${score ?? 0}%`, background: tc.dot }} />
      </div>

      {/* 2x2 metric grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="mri-card p-3">
          <div className="text-[10px] font-medium text-[var(--mri-text-dim)] uppercase tracking-wide">Flow</div>
          <div className="text-[15px] font-semibold text-[var(--mri-text)] mt-1 leading-tight">
            {selected.flow_cfs != null ? `${Number(selected.flow_cfs).toLocaleString()} cfs` : "—"}
            {selected.flow_cfs != null && (
              <span className="ml-1 text-[12px] text-[var(--mri-text-muted)]">{getFlowTrendArrow(selected.change_48h_pct_calc)}</span>
            )}
          </div>
        </div>
        <div className="mri-card p-3">
          <div className="text-[10px] font-medium text-[var(--mri-text-dim)] uppercase tracking-wide">Temp</div>
          <div className="text-[15px] font-semibold text-[var(--mri-text)] mt-1 leading-tight">
            {selected.water_temp_f != null ? `${Number(selected.water_temp_f).toFixed(1)}°F` : "—"}
          </div>
          {selected.temp_status && (
            <div className="text-[10px] text-[var(--mri-text-dim)] mt-0.5">{getTempStatusLabel(selected)}</div>
          )}
        </div>
        <div className="mri-card p-3">
          <div className="text-[10px] font-medium text-[var(--mri-text-dim)] uppercase tracking-wide">Wind</div>
          <div className="text-[15px] font-semibold text-[var(--mri-text)] mt-1 leading-tight">
            {detailedAnalytics?.weather.windSpeedMph != null
              ? `${detailedAnalytics.weather.windSpeedMph.toFixed(0)} mph`
              : "—"}
          </div>
          {detailedAnalytics?.weather.windDirection && (
            <div className="text-[10px] text-[var(--mri-text-dim)] mt-0.5">{detailedAnalytics.weather.windDirection}</div>
          )}
        </div>
        <div className="mri-card p-3">
          <div className="text-[10px] font-medium text-[var(--mri-text-dim)] uppercase tracking-wide">Hatch</div>
          <div className="text-[13px] font-semibold text-[var(--mri-text)] mt-1 leading-tight">
            {detailedAnalytics?.biology.hatchLikelihood ?? "—"}
          </div>
        </div>
      </div>

      {/* Tactical read */}
      <div
        className="mri-card p-3"
        style={{ borderLeft: "3px solid #2d5a1b" }}
      >
        <div className="text-[10px] font-semibold text-[#2d5a1b] uppercase tracking-wide mb-1">Today&apos;s Read</div>
        <div className="text-[13px] text-[var(--mri-text-muted)] leading-relaxed">{todaysRead}</div>
      </div>

      {/* Hyperlocal access-point weather */}
      <AccessWeatherPanel riverId={riverId} />

      {/* 14-day trend chart */}
      <TrendChart historyRows={historyRows} />

      {/* Detailed metrics toggle */}
      <button
        className="w-full text-left text-[12px] font-medium text-[var(--mri-text-muted)] hover:text-[var(--mri-text)] py-2 border-t border-[var(--mri-border)] transition-colors"
        onClick={onToggleMetrics}
      >
        {detailMetricsOpen ? "Hide Detailed Metrics ↑" : "Detailed Metrics ↓"}
      </button>

      {detailMetricsOpen && (
        <div className="space-y-3">
          <DetailedMetricsContent analytics={detailedAnalytics} />
          <button
            className="w-full text-left text-[12px] font-medium text-[var(--mri-text-muted)] hover:text-[var(--mri-text)] py-1 transition-colors"
            onClick={onToggleTransparency}
          >
            {transparencyOpen ? "Hide score breakdown ↑" : "How this score is calculated ↓"}
          </button>
          {transparencyOpen && breakdown && (
            <div className="mri-card p-3 text-[11px]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div className="text-[var(--mri-text-muted)]">Flow Score</div>
                <div className="text-right font-semibold text-[var(--mri-text)]">{formatNum(breakdown.flowScore)}</div>
                <div className="text-[var(--mri-text-muted)]">Stability Score</div>
                <div className="text-right font-semibold text-[var(--mri-text)]">{formatNum(breakdown.stabilityScore)}</div>
                <div className="text-[var(--mri-text-muted)]">Thermal Score</div>
                <div className="text-right font-semibold text-[var(--mri-text)]">
                  {breakdown.thermalScore == null ? "Unavailable" : formatNum(breakdown.thermalScore)}
                </div>
                <div className="text-[var(--mri-text-muted)]">Wind Penalty</div>
                <div className="text-right font-semibold text-[var(--mri-text)]">{formatNum(breakdown.windPenalty)}</div>
                <div className="border-t border-[var(--mri-border)] pt-1.5 font-semibold text-[var(--mri-text)]">Total Score</div>
                <div className="border-t border-[var(--mri-border)] pt-1.5 text-right font-semibold text-[var(--mri-text)]">{formatNum(breakdown.totalScore)}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export default function OnxShell({
  rivers,
  stationGeojson,
  riverLinesGeojson: initialRiverLinesGeojson,
  dateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }),
}: {
  rivers: River[];
  stationGeojson?: GeoJSON.FeatureCollection<GeoJSON.Point, Record<string, unknown>> | null;
  riverLinesGeojson?: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> | null;
  dateLabel?: string;
}) {
  type MobileListSnap = "peek" | "mid" | "full";

  // Computed dynamically so peek always reveals ~280px of sheet on any screen height.
  const [peekSnap, setPeekSnap] = useState(0.62);

  const SHEET_SNAPS: Record<MobileListSnap, number> = {
    peek: peekSnap,
    mid: 0.40,
    full: 0.0,
  };
  const SNAP_TRANSITION = "transform 260ms ease-out";

  // ── Core UI state
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"All" | "Good" | "Fair" | "Tough">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionSeq, setSelectionSeq] = useState(0);

  // ── Mobile bottom sheet
  const [sheetSnap, setSheetSnap] = useState<MobileListSnap>("peek");
  const [sheetY, setSheetY] = useState<number>(0.62);
  const [isDragging, setIsDragging] = useState(false);
  const sheetDragRef = useRef<{ startY: number; startFraction: number } | null>(null);

  // ── Mobile detail sheet
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const mobileDetailDragRef = useRef<{ startY: number } | null>(null);

  // ── Desktop panels
  const [layersOpen, setLayersOpen] = useState(false);
  const [advancedLayersOpen, setAdvancedLayersOpen] = useState(false);

  // ── Detail panel expandables
  const [detailMetricsOpen, setDetailMetricsOpen] = useState(false);
  const [transparencyOpen, setTransparencyOpen] = useState(false);
  const [mobileDetailMetricsOpen, setMobileDetailMetricsOpen] = useState(false);
  const [mobileTransparencyOpen, setMobileTransparencyOpen] = useState(false);

  // ── Map / data state
  const [isMobile, setIsMobile] = useState(false);
  const [selectedGeojson, setSelectedGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [, setHistoryLoading] = useState(false);
  const [intradayRows, setIntradayRows] = useState<
    Array<{ observed_at: string; flow_cfs: number | null; water_temp_f: number | null; gage_height_ft: number | null }>
  >([]);
  const [, setIntradayLoading] = useState(false);
  const [weatherRows, setWeatherRows] = useState<RiverWeatherDay[]>([]);
  const [sourceSites, setSourceSites] = useState<Record<string, RiverSourceSiteSummary>>({});
  const [backendAnalytics, setBackendAnalytics] = useState<RiverDetailAnalyticsBackendRow | null>(null);

  const [basemap, setBasemap] = useState<BasemapId>("hybrid");
  const [layerState, setLayerState] = useState<Record<LayerId, boolean>>(createDefaultLayerState());

  // ── Derived state
  const basemapById = useMemo(
    () => Object.fromEntries(BASEMAP_OPTIONS.map((b) => [b.id, b])) as Record<BasemapId, (typeof BASEMAP_OPTIONS)[number]>,
    []
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rivers ?? [])
      .filter((r) => {
        const matchesSearch = !s || (r.river_name ?? "").toLowerCase().includes(s) || (r.gauge_label ?? "").toLowerCase().includes(s);
        const displayTier =
          r.bite_tier === "HOT" || r.bite_tier === "GOOD" ? "Good"
          : r.bite_tier === "FAIR" ? "Fair"
          : r.bite_tier === "TOUGH" ? "Tough"
          : "";
        return matchesSearch && (tier === "All" || displayTier === tier);
      })
      .sort((a, b) => (b.fishability_score_calc ?? -999) - (a.fishability_score_calc ?? -999));
  }, [rivers, search, tier]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return filtered.find((r) => r.river_id === selectedId) ?? rivers.find((r) => r.river_id === selectedId) ?? null;
  }, [filtered, rivers, selectedId]);

  const breakdown = useMemo(() => (selected ? deriveScoreBreakdown(selected) : null), [selected]);
  const selectedFishIndex = useMemo(() => getFishabilityIndex(selected?.fishability_score_calc ?? null), [selected]);
  const todaysRead = useMemo(() => generateTodaysRead(selected), [selected]);
  const decisionCard = useMemo(() => selected ? buildDecisionCard(selected) : null, [selected]);

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

  const latestPullAt = useMemo(() => {
    let latestMs = 0;
    for (const r of rivers) {
      // last_usgs_pull_at = coalesce(source_flow_observed_at, source_temp_observed_at, updated_at)
      // updated_at alone can lag behind the actual observation time when the row was
      // written in a prior session; prefer last_usgs_pull_at which always reflects the
      // most recent USGS observation timestamp for the river.
      const candidate = r.last_usgs_pull_at ?? r.updated_at ?? null;
      if (!candidate) continue;
      const ms = new Date(candidate).getTime();
      if (!Number.isNaN(ms) && ms > latestMs) latestMs = ms;
    }
    return latestMs > 0 ? new Date(latestMs).toISOString() : null;
  }, [rivers]);

  // ── Responsive detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // ── Dynamic peek snap: sheet reveals ~280px regardless of screen height
  // sheet is 90dvh; visible = (0.9 - sheetY) * vh = 280px → sheetY = 0.9 - 280/vh
  useEffect(() => {
    if (typeof window === "undefined") return;
    function update() {
      const vh = window.innerHeight || 812;
      const snap = Math.max(0.50, Math.min(0.78, 0.9 - 280 / vh));
      setPeekSnap(snap);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // When peekSnap updates (resize), re-sync position if sheet is at peek
  useEffect(() => {
    if (sheetSnap === "peek") setSheetY(peekSnap);
  }, [peekSnap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── River geometry fetch
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!selectedId) { setSelectedGeojson(null); return; }
      const river = filtered.find((r) => r.river_id === selectedId) ?? rivers.find((r) => r.river_id === selectedId);
      const key = river?.slug ?? river?.river_id ?? selectedId;
      const gj = await fetchRiverGeojsonBrowser(key);
      if (cancelled) return;
      if (gj) { setSelectedGeojson(gj); return; }
      const geom = await fetchRiverGeom(selectedId);
      if (cancelled) return;
      setSelectedGeojson(geom ? ({ type: "Feature", geometry: geom, properties: { river_id: selectedId } } as GeoJSON.Feature) : null);
    }
    run().catch(() => { if (!cancelled) setSelectedGeojson(null); });
    return () => { cancelled = true; };
  }, [selectedId, filtered, rivers]);

  // ── Data fetching effects
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selected?.river_id) { setBackendAnalytics(null); return; }
      const data =
        (await fetchRiverDetailAnalyticsByIdOrSlug(selected.river_id)) ??
        (selected.slug ? await fetchRiverDetailAnalyticsByIdOrSlug(selected.slug) : null);
      if (!cancelled) setBackendAnalytics(data);
    }
    load().catch(() => { if (!cancelled) setBackendAnalytics(null); });
    return () => { cancelled = true; };
  }, [selected?.river_id, selected?.slug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selected?.river_id) { setHistoryRows([]); return; }
      setHistoryLoading(true);
      const data = await fetchRiverHistory14d(selected.river_id);
      if (!cancelled) { setHistoryRows(data); setHistoryLoading(false); }
    }
    load().catch(() => { if (!cancelled) { setHistoryRows([]); setHistoryLoading(false); } });
    return () => { cancelled = true; };
  }, [selected?.river_id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selected?.river_id) { setIntradayRows([]); return; }
      setIntradayLoading(true);
      const data = await fetchRiverIntraday24h(selected.river_id);
      if (!cancelled) { setIntradayRows(data); setIntradayLoading(false); }
    }
    load().catch(() => { if (!cancelled) { setIntradayRows([]); setIntradayLoading(false); } });
    return () => { cancelled = true; };
  }, [selected?.river_id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selected?.river_id) { setWeatherRows([]); setSourceSites({}); return; }
      const [weather, sites] = await Promise.all([
        fetchRiverWeatherWindow(selected.river_id),
        fetchUsgsSiteSummaries(
          [selected.flow_source_site_no, selected.temp_source_site_no].filter((v): v is string => Boolean(v))
        ),
      ]);
      if (!cancelled) { setWeatherRows(weather); setSourceSites(sites); }
    }
    load().catch(() => { if (!cancelled) { setWeatherRows([]); setSourceSites({}); } });
    return () => { cancelled = true; };
  }, [selected?.river_id, selected?.flow_source_site_no, selected?.temp_source_site_no]);

  // ── localStorage layer persistence
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{ basemap: BasemapId; layerState: Record<LayerId, boolean> }>;
      if (parsed.basemap && basemapById[parsed.basemap]) setBasemap(parsed.basemap);
      if (parsed.layerState) {
        const defaults = createDefaultLayerState();
        const merged: Record<LayerId, boolean> = { ...defaults };
        for (const layer of LAYER_REGISTRY) {
          if (typeof parsed.layerState[layer.id] === "boolean") merged[layer.id] = parsed.layerState[layer.id];
        }
        setLayerState(merged);
      }
    } catch { /* ignore */ }
  }, [basemapById]);

  useEffect(() => {
    try { localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify({ basemap, layerState })); } catch { /* ignore */ }
  }, [basemap, layerState]);

  // ── When river selected on mobile, open detail sheet; reset metrics state
  useEffect(() => {
    if (selected) {
      setDetailMetricsOpen(false);
      setMobileDetailMetricsOpen(false);
      setTransparencyOpen(false);
      setMobileTransparencyOpen(false);
      if (isMobile) setMobileDetailOpen(true);
    } else {
      setMobileDetailOpen(false);
    }
  }, [selected?.river_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map controls
  function zoomIn() { mapRef.current?.zoomIn?.({ duration: 180 }); }
  function zoomOut() { mapRef.current?.zoomOut?.({ duration: 180 }); }

  function recenter() {
    mapRef.current?.flyTo?.({ center: [-109.75, 47.05], zoom: 6.15, duration: 450, pitch: 14, bearing: 0, essential: true });
  }

  function fitToRivers() {
    const map = mapRef.current;
    if (!map || !filtered.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    let hasAny = false;
    for (const r of filtered) {
      const lat = r.lat ?? (r as { latitude?: number }).latitude;
      const lng = r.lng ?? (r as { longitude?: number }).longitude;
      const coords: [number, number] | undefined = lat != null && lng != null ? [lng, lat] : RIVER_FOCUS_POINTS[r.river_id];
      if (!coords) continue;
      bounds.extend(coords);
      hasAny = true;
    }
    if (hasAny && !bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 450, essential: true });
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

  function selectRiver(riverId: string | null) {
    setSelectedId(riverId);
    if (riverId) setSelectionSeq((prev) => prev + 1);
  }

  // ── Mobile bottom sheet drag
  // Uses setPointerCapture so iOS Safari routes all pointer events to the handle
  // element — no document-level listeners, no passive/active conflict.
  function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Capture so pointermove/pointerup fire on this element even when the
    // finger moves outside it (required on iOS Safari).
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    sheetDragRef.current = { startY: e.clientY, startFraction: sheetY };
    setIsDragging(true);
    document.body.style.userSelect = "none";
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!sheetDragRef.current) return;
    const dy = e.clientY - sheetDragRef.current.startY;
    const h = window.innerHeight || 800;
    setSheetY(clamp(sheetDragRef.current.startFraction + dy / h, 0, 0.80));
  }

  function snapSheet() {
    sheetDragRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = "";
    setSheetY((current) => {
      const snaps = Object.entries(SHEET_SNAPS) as [MobileListSnap, number][];
      const nearest = snaps.reduce(
        (best, [k, v]) => Math.abs(current - v) < Math.abs(current - SHEET_SNAPS[best]) ? k : best,
        "mid" as MobileListSnap
      );
      setSheetSnap(nearest);
      return SHEET_SNAPS[nearest];
    });
  }

  // ── Mobile detail sheet drag-to-dismiss
  // Same pointer-capture pattern.
  function onDetailHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    mobileDetailDragRef.current = { startY: e.clientY };
    document.body.style.userSelect = "none";
  }

  function onDetailHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = mobileDetailDragRef.current?.startY ?? e.clientY;
    const dy = e.clientY - start;
    mobileDetailDragRef.current = null;
    document.body.style.userSelect = "";
    if (dy > 80) { setMobileDetailOpen(false); setSelectedId(null); }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden" style={{ background: "#f2f0eb" }}>

      {/* ── Map layer (always behind) ── */}
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
          rightPanelOpen={!isMobile && !!selected}
          drawerState="collapsed"
          selectionSeq={selectionSeq}
          onSelectRiver={(r) => selectRiver(r.river_id)}
          className="absolute inset-0"
          onMapReady={(m) => { mapRef.current = m; }}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT (< 640px)
      ══════════════════════════════════════════════════════════════════════════ */}

      {/* Mobile header */}
      <header className="absolute top-0 left-0 right-0 z-20 sm:hidden px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="mri-card flex items-center gap-3 px-3 py-2.5 min-h-[44px]">
          <div className="flex-shrink-0">
            <div className="text-[14px] font-bold text-[#2d5a1b] tracking-tight">MRI</div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rivers…"
            className="flex-1 bg-transparent text-[13px] text-[var(--mri-text)] placeholder:text-[var(--mri-text-dim)] outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="flex-shrink-0 text-[var(--mri-text-dim)]">
              <X size={14} />
            </button>
          )}
        </div>
        {/* Filter chips */}
        <div className="flex gap-1.5 mt-2 px-0.5">
          {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
            <button key={t} onClick={() => setTier(t)} className={`mri-chip ${tier === t ? "mri-chip-active" : ""}`}>
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Mobile bottom sheet — always visible, slides to snap points */}
      <section
        className="absolute bottom-0 left-0 right-0 z-20 sm:hidden"
        style={{
          height: "90dvh",
          transform: `translateY(${sheetY * 100}dvh)`,
          transition: isDragging ? "none" : SNAP_TRANSITION,
        }}
      >
        <div className="mri-sheet h-full rounded-t-2xl flex flex-col">
          {/* Handle — 44px touch target, pointer capture for iOS Safari */}
          <div
            className="flex-shrink-0 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: "none", minHeight: "44px" }}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={snapSheet}
            onPointerCancel={snapSheet}
          >
            <div className="mri-handle" />
          </div>

          {/* Sheet header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-1 pb-2 gap-2">
            <div className="text-[13px] font-semibold text-[var(--mri-text)] truncate">
              {filtered.length} rivers · {dateLabel}
            </div>
            <div className="text-[10px] text-[var(--mri-text-dim)] whitespace-nowrap flex-shrink-0">{formatPullTime(latestPullAt)}</div>
          </div>

          {/* River list */}
          <div className="mri-scroll flex-1 overflow-auto px-3 pb-[max(8px,env(safe-area-inset-bottom))]">
            {filtered.length === 0 ? (
              <div className="text-[13px] text-[var(--mri-text-muted)] text-center mt-8">No rivers match your filters</div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((r) => (
                  <RiverRow
                    key={r.river_id}
                    river={r}
                    selected={r.river_id === selectedId}
                    onSelect={() => {
                      selectRiver(r.river_id);
                      setSheetSnap("peek");
                      setSheetY(SHEET_SNAPS.peek);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Mobile detail sheet — slides up over list */}
      {mobileDetailOpen && selected && (
        <section className="absolute inset-0 z-30 sm:hidden" style={{ background: "#f2f0eb" }}>
          {/* Back bar — drag down to dismiss */}
          <div
            className="flex-shrink-0 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-[var(--mri-border)] bg-[#f2f0eb] select-none"
            style={{ touchAction: "none" }}
            onPointerDown={onDetailHandlePointerDown}
            onPointerUp={onDetailHandlePointerUp}
            onPointerCancel={onDetailHandlePointerUp}
          >
            <button
              className="flex items-center gap-1.5 text-[13px] font-medium text-[#2d5a1b] min-h-[44px] px-1 -ml-1"
              onClick={() => { setMobileDetailOpen(false); setSelectedId(null); }}
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
              Rivers
            </button>
            <div className="mri-handle" style={{ width: 28 }} />
            <div className="text-[11px] text-[var(--mri-text-dim)] w-16 text-right">{formatUpdatedAgo(selected.updated_at)}</div>
          </div>

          {/* Detail content */}
          <div className="mri-scroll overflow-auto h-[calc(100dvh-80px)] px-4 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            {/* River name */}
            <div className="mb-4">
              <div className="text-[22px] font-bold text-[var(--mri-text)] leading-tight">{selected.river_name}</div>
              <div className="text-[13px] text-[var(--mri-text-muted)] mt-0.5">{selected.gauge_label ?? ""}</div>
            </div>

            <RiverDetailContent
              selected={selected}
              selectedFishIndex={selectedFishIndex}
              todaysRead={todaysRead}
              historyRows={historyRows}
              detailedAnalytics={detailedAnalytics}
              breakdown={breakdown}
              detailMetricsOpen={mobileDetailMetricsOpen}
              transparencyOpen={mobileTransparencyOpen}
              onToggleMetrics={() => setMobileDetailMetricsOpen((v) => !v)}
              onToggleTransparency={() => setMobileTransparencyOpen((v) => !v)}
              decisionCard={decisionCard}
            />
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT (≥ 640px)
      ══════════════════════════════════════════════════════════════════════════ */}

      {/* Desktop left rail */}
      <aside className="absolute left-0 top-0 bottom-0 z-20 w-12 hidden sm:flex flex-col items-center py-4 gap-2 mri-rail">
        {/* Logo */}
        <div className="mb-1 text-center">
          <div className="text-[11px] font-bold text-[#2d5a1b] leading-tight">MRI</div>
        </div>

        <button
          className={`mri-rail-btn ${layersOpen ? "mri-rail-btn-active" : ""}`}
          title="Map layers"
          onClick={() => setLayersOpen((v) => !v)}
        >
          <Layers size={16} strokeWidth={2.5} />
        </button>

        <button className="mri-rail-btn" title="Zoom in" onClick={zoomIn}>
          <Plus size={16} strokeWidth={2.5} />
        </button>

        <button className="mri-rail-btn" title="Zoom out" onClick={zoomOut}>
          <Minus size={16} strokeWidth={2.5} />
        </button>

        <button className="mri-rail-btn" title="Fit to rivers" onClick={fitToRivers}>
          <Maximize2 size={15} strokeWidth={2.5} />
        </button>

        <button className="mri-rail-btn" title="Recenter Montana" onClick={recenter}>
          <Crosshair size={15} strokeWidth={2.5} />
        </button>
      </aside>

      {/* Desktop layers panel — floats next to left rail */}
      {layersOpen && (
        <div className="absolute left-14 top-4 z-30 hidden sm:block">
          <LayersPanel
            basemap={basemap}
            layerState={layerState}
            advancedOpen={advancedLayersOpen}
            onBasemap={setBasemapStyle}
            onLayer={setLayerEnabled}
            onReset={resetLayers}
            onClose={() => setLayersOpen(false)}
            onToggleAdvanced={() => setAdvancedLayersOpen((v) => !v)}
          />
        </div>
      )}

      {/* Desktop right sidebar */}
      <aside className="absolute top-0 right-0 bottom-0 z-20 w-[280px] hidden sm:flex flex-col mri-sidebar-right">

        {/* Sidebar header */}
        <div className="flex-shrink-0 px-3 pt-4 pb-3 border-b border-[var(--mri-border)]">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[12px] font-semibold text-[var(--mri-text)]">{filtered.length} rivers</div>
            <div className="text-[10px] text-[var(--mri-text-dim)]">{dateLabel}</div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rivers…"
            className="mri-input"
          />
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(["All", "Good", "Fair", "Tough"] as const).map((t) => (
              <button key={t} onClick={() => setTier(t)} className={`mri-chip ${tier === t ? "mri-chip-active" : ""}`}>
                {t}
              </button>
            ))}
          </div>
          {latestPullAt && (
            <div className="mt-2 text-[10px] text-[var(--mri-text-dim)]">
              Last pull {formatPullTime(latestPullAt)} MT
            </div>
          )}
        </div>

        {/* River list — fills remaining space above detail panel */}
        <div
          className="mri-scroll overflow-auto px-2 py-2"
          style={{ flex: selected ? "0 1 auto" : "1 1 0", minHeight: selected ? 80 : undefined }}
        >
          {filtered.length === 0 ? (
            <div className="text-[12px] text-[var(--mri-text-muted)] text-center mt-6">No rivers match</div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((r) => (
                <RiverRow
                  key={r.river_id}
                  river={r}
                  selected={r.river_id === selectedId}
                  onSelect={() => selectRiver(r.river_id === selectedId ? null : r.river_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel — pinned to bottom of sidebar */}
        {selected && (
          <div
            className="mri-scroll flex-shrink-0 overflow-auto border-t border-[var(--mri-border)] bg-white px-3 pt-3 pb-4"
            style={{ maxHeight: "62vh" }}
          >
            <div className="mb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-bold text-[var(--mri-text)] leading-tight">{selected.river_name}</div>
                  <div className="text-[11px] text-[var(--mri-text-muted)] mt-0.5">{selected.gauge_label ?? ""}</div>
                </div>
                <button
                  className="flex-shrink-0 mri-rail-btn mt-0.5"
                  onClick={() => { setSelectedId(null); }}
                  title="Close detail"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <RiverDetailContent
              selected={selected}
              selectedFishIndex={selectedFishIndex}
              todaysRead={todaysRead}
              historyRows={historyRows}
              detailedAnalytics={detailedAnalytics}
              breakdown={breakdown}
              detailMetricsOpen={detailMetricsOpen}
              transparencyOpen={transparencyOpen}
              onToggleMetrics={() => setDetailMetricsOpen((v) => !v)}
              onToggleTransparency={() => setTransparencyOpen((v) => !v)}
              decisionCard={decisionCard}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
