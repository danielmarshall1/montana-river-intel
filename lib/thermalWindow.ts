import type { FishabilityRow } from "@/lib/types";

export type IntradayPoint = {
  observed_at: string;
  flow_cfs: number | null;
  water_temp_f: number | null;
  gage_height_ft: number | null;
};

export type ThermalSummary = {
  tempNowF: number | null;
  delta3hF: number | null;
  deltaSinceMorningF: number | null;
  min24hF: number | null;
  max24hF: number | null;
  state: "warming" | "cooling" | "stable" | "unknown";
  windowLabel: string;
};

function nearestIndex(points: IntradayPoint[], targetMs: number): number {
  let idx = -1;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const t = new Date(points[i].observed_at).getTime();
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - targetMs);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  return idx;
}

function finiteTemps(points: IntradayPoint[]): number[] {
  return points
    .map((p) => p.water_temp_f)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function summarizeThermalWindow(river: FishabilityRow | null, points: IntradayPoint[]): ThermalSummary {
  const temps = finiteTemps(points);
  if (!river || temps.length === 0) {
    return {
      tempNowF: river?.water_temp_f ?? null,
      delta3hF: null,
      deltaSinceMorningF: null,
      min24hF: null,
      max24hF: null,
      state: "unknown",
      windowLabel: "No intraday thermal signal",
    };
  }

  const nowTemp = temps[temps.length - 1] ?? null;
  const nowMs = Date.now();
  const i3h = nearestIndex(points, nowMs - 3 * 60 * 60 * 1000);
  const iMorning = nearestIndex(points, nowMs - 10 * 60 * 60 * 1000);

  const prev3h = i3h >= 0 ? points[i3h].water_temp_f : null;
  const prevMorning = iMorning >= 0 ? points[iMorning].water_temp_f : null;

  const delta3hF =
    typeof nowTemp === "number" && typeof prev3h === "number"
      ? Number((nowTemp - prev3h).toFixed(1))
      : null;
  const deltaSinceMorningF =
    typeof nowTemp === "number" && typeof prevMorning === "number"
      ? Number((nowTemp - prevMorning).toFixed(1))
      : null;

  const min24hF = Number(Math.min(...temps).toFixed(1));
  const max24hF = Number(Math.max(...temps).toFixed(1));

  let state: ThermalSummary["state"] = "stable";
  if (delta3hF == null) state = "unknown";
  else if (delta3hF >= 1.0) state = "warming";
  else if (delta3hF <= -1.0) state = "cooling";

  let windowLabel = "Neutral thermal window";
  if (typeof nowTemp === "number") {
    if (nowTemp >= 66) windowLabel = "Thermal stress risk";
    else if (nowTemp < 40) windowLabel = "Cold-water window";
    else if (state === "warming" && nowTemp >= 46 && nowTemp <= 62) windowLabel = "Prime warming window";
    else if (state === "cooling") windowLabel = "Cooling trend into evening";
  }

  return {
    tempNowF: nowTemp,
    delta3hF,
    deltaSinceMorningF,
    min24hF,
    max24hF,
    state,
    windowLabel,
  };
}

