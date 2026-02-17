import type { FishabilityRow } from "@/lib/types";

export interface ScoreBreakdown {
  flowScore: number | null;
  stabilityScore: number | null;
  thermalScore: number | null;
  windPenalty: number | null;
  totalScore: number | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function deriveScoreBreakdown(river: FishabilityRow): ScoreBreakdown {
  const ratio = river.flow_ratio_calc;
  const change48h = river.change_48h_pct_calc;
  const temp = river.water_temp_f;
  const windAvg =
    river.wind_am_mph != null && river.wind_pm_mph != null
      ? (river.wind_am_mph + river.wind_pm_mph) / 2
      : river.wind_am_mph ?? river.wind_pm_mph ?? null;

  const flowScore =
    ratio == null || ratio <= 0
      ? null
      : Math.round(clamp(30 - Math.abs(Math.log2(ratio)) * 14, 0, 30));

  const stabilityScore =
    change48h == null
      ? null
      : Math.round(clamp(25 - Math.abs(change48h) * 0.8, 0, 25));

  const thermalScore =
    temp == null
      ? null
      : Math.round(clamp(25 - Math.abs(temp - 56) * 1.2, 0, 25));

  const windPenalty =
    windAvg == null
      ? null
      : Math.round(clamp(windAvg * 1.2, 0, 20));

  return {
    flowScore,
    stabilityScore,
    thermalScore,
    windPenalty,
    totalScore: river.fishability_score_calc ?? null,
  };
}
