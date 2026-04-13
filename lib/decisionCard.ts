import type { FishabilityRow } from "@/lib/types";

export interface DecisionCard {
  go: { label: string; detail: string };
  access: { label: string; detail: string; icon: "wade" | "drift" | "both" | "caution" };
  hatch: { label: string; detail: string };
  clarity: { label: string; detail: string };
  bestTime: { label: string; detail: string };
}

/**
 * Build the 5-dimension decision card from a FishabilityRow.
 *
 * @param overrides.windMph  Live current wind speed (e.g. from v_river_detail_analytics).
 *   When provided it is used in addition to the forecast wind_am_mph / wind_pm_mph fields,
 *   ensuring the card reflects the actual observed wind rather than only the daily forecast.
 */
export function buildDecisionCard(
  river: FishabilityRow,
  overrides?: { windMph?: number | null }
): DecisionCard {
  const score = river.fishability_score_calc;
  const flow = river.flow_cfs;
  const temp = river.water_temp_f;
  const change48h = river.change_48h_pct_calc;
  const windAm = river.wind_am_mph;
  const windPm = river.wind_pm_mph;
  const precip = river.precip_mm;
  const wadingThreshold = river.wading_threshold_cfs;

  // Effective wind: max of forecast am/pm and any live override (e.g. current observed wind)
  const effectiveWind = Math.max(windAm ?? 0, windPm ?? 0, overrides?.windMph ?? 0);

  console.log(
    "[buildDecisionCard]",
    river.river_name,
    { wind_am_mph: windAm, wind_pm_mph: windPm, liveWindOverride: overrides?.windMph, effectiveWind }
  );

  // ── GO ──────────────────────────────────────────────────────────────────────
  let go: DecisionCard["go"];
  if (score == null) {
    go = { label: "Unknown", detail: "Score unavailable" };
  } else if (score >= 85) {
    go = { label: "Excellent", detail: "Prime conditions — go today" };
  } else if (score >= 70) {
    go = { label: "Good", detail: "Solid conditions" };
  } else if (score >= 55) {
    go = { label: "Fair", detail: "Fishable but challenging" };
  } else {
    go = { label: "Tough", detail: "Consider waiting" };
  }

  // ── ACCESS ──────────────────────────────────────────────────────────────────
  let access: DecisionCard["access"];
  const rising = (change48h ?? 0) > 20;
  const highWind = effectiveWind > 20;
  const windNote = highWind ? " — high wind today" : "";

  if (flow == null) {
    access = { label: "Unknown", detail: "Flow data unavailable", icon: "caution" };
  } else if (wadingThreshold == null) {
    // No threshold configured — give generic read based on absolute flow
    if (flow < 500) {
      access = { label: "Wading recommended", detail: `Low water at ${Math.round(flow).toLocaleString()} cfs${windNote}`, icon: rising ? "caution" : "wade" };
    } else if (flow < 2000) {
      access = { label: "Wade or float", detail: `${Math.round(flow).toLocaleString()} cfs — either works${windNote}`, icon: rising ? "caution" : "both" };
    } else {
      access = { label: "Float recommended", detail: `${Math.round(flow).toLocaleString()} cfs — floating preferred${windNote}`, icon: rising ? "caution" : "drift" };
    }
  } else {
    const lo = wadingThreshold * 0.7;
    const hi = wadingThreshold * 1.3;
    const risingNote = rising ? " — rising quickly, use caution if wading" : "";
    const caution = risingNote + windNote;
    if (flow < lo) {
      access = { label: "Wading recommended", detail: `Low water — wade carefully, fish are concentrated${caution}`, icon: rising ? "caution" : "wade" };
    } else if (flow < wadingThreshold) {
      access = { label: "Wade or float", detail: `Good wading conditions at ${Math.round(flow).toLocaleString()} cfs — either works${caution}`, icon: rising ? "caution" : "both" };
    } else if (flow < hi) {
      access = { label: "Float recommended", detail: `Marginal wading at ${Math.round(flow).toLocaleString()} cfs — floating preferred${caution}`, icon: rising ? "caution" : "drift" };
    } else {
      access = { label: "Float trip recommended", detail: `High water at ${Math.round(flow).toLocaleString()} cfs — floating safer than wading${caution}`, icon: rising ? "caution" : "drift" };
    }
  }

  // ── HATCH ───────────────────────────────────────────────────────────────────
  let hatch: DecisionCard["hatch"];
  if (temp == null) {
    hatch = { label: "Unknown", detail: "Temperature data unavailable" };
  } else if (temp < 42) {
    hatch = { label: "Unlikely", detail: "Water too cold for active hatches — midges possible" };
  } else if (temp < 48) {
    hatch = { label: "Midges", detail: "Midge activity possible midday, size 20–24" };
  } else if (temp < 52) {
    hatch = { label: "BWO likely", detail: "Blue Winged Olives likely midday — size 18–20, overcast preferred" };
  } else if (temp < 58) {
    hatch = { label: "PMD/Caddis", detail: "PMDs and Caddis active — size 16–18, fish the seams" };
  } else if (temp <= 65) {
    hatch = { label: "Peak hatches", detail: "Multiple hatches possible — match what's on the water" };
  } else {
    hatch = { label: "Evening only", detail: "Fish early morning or evening, avoid midday heat stress" };
  }

  // ── CLARITY ─────────────────────────────────────────────────────────────────
  let clarity: DecisionCard["clarity"];
  const isRising = (change48h ?? 0) > 0;
  if (isRising && (change48h ?? 0) > 30) {
    clarity = { label: "Off color", detail: "Rising fast — expect turbid water, fish streamers" };
  } else if (isRising && (change48h ?? 0) > 15) {
    clarity = { label: "Slightly off", detail: "Clearing but still off — nymphs and streamers" };
  } else if ((precip ?? 0) > 5) {
    clarity = { label: "Off color", detail: "Recent precip — water likely turbid" };
  } else {
    clarity = { label: "Likely clear", detail: "Stable conditions suggest clear water" };
  }

  // ── BEST TIME ───────────────────────────────────────────────────────────────
  let bestTime: DecisionCard["bestTime"];
  if (effectiveWind > 20) {
    // Use the time-of-day split only if we have forecast breakdown; otherwise generic
    if ((windPm ?? 0) > (windAm ?? 0) || overrides?.windMph != null) {
      bestTime = { label: "Fish morning", detail: `Wind picks up — get out early (${Math.round(effectiveWind)} mph observed)` };
    } else {
      bestTime = { label: "Fish afternoon", detail: "Morning wind — wait for afternoon calm" };
    }
  } else if ((windAm ?? 0) > 20) {
    bestTime = { label: "Fish afternoon", detail: "Morning wind — wait for afternoon calm" };
  } else if (temp != null && temp < 45) {
    bestTime = { label: "Midday only", detail: "Cold water — fish active only during warmest hours" };
  } else if (temp != null && temp > 62) {
    bestTime = { label: "Early morning", detail: "Warm water — fish before 9am to avoid heat stress" };
  } else {
    bestTime = { label: "All day", detail: "Conditions favorable throughout the day" };
  }

  return { go, access, hatch, clarity, bestTime };
}
