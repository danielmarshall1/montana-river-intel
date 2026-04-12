import type { FishabilityRow } from "@/lib/types";

export interface DecisionCard {
  go: { label: string; detail: string };
  access: { label: string; detail: string; icon: "wade" | "drift" | "both" | "caution" };
  hatch: { label: string; detail: string };
  clarity: { label: string; detail: string };
  bestTime: { label: string; detail: string };
}

export function buildDecisionCard(river: FishabilityRow): DecisionCard {
  const score = river.fishability_score_calc;
  const flow = river.flow_cfs;
  const temp = river.water_temp_f;
  const change48h = river.change_48h_pct_calc;
  const windAm = river.wind_am_mph;
  const windPm = river.wind_pm_mph;
  const precip = river.precip_mm;
  const wadingThreshold = river.wading_threshold_cfs;

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

  if (flow == null) {
    access = { label: "Unknown", detail: "Flow data unavailable", icon: "caution" };
  } else if (wadingThreshold == null) {
    // No threshold configured — give generic read based on absolute flow
    if (flow < 500) {
      access = { label: "Wade only", detail: `Low water at ${Math.round(flow).toLocaleString()} cfs`, icon: rising ? "caution" : "wade" };
    } else if (flow < 2000) {
      access = { label: "Wade or drift", detail: `${Math.round(flow).toLocaleString()} cfs — both methods viable`, icon: rising ? "caution" : "both" };
    } else {
      access = { label: "Drift recommended", detail: `${Math.round(flow).toLocaleString()} cfs — drift boat preferred`, icon: rising ? "caution" : "drift" };
    }
  } else {
    const lo = wadingThreshold * 0.7;
    const hi = wadingThreshold * 1.3;
    if (flow < lo) {
      const detail = `Low water — wade carefully, fish are concentrated${rising ? " — rising fast, use caution" : ""}`;
      access = { label: "Wade only", detail, icon: rising ? "caution" : "wade" };
    } else if (flow < wadingThreshold) {
      const detail = `Good wading conditions at ${Math.round(flow).toLocaleString()} cfs${rising ? " — rising fast, use caution" : ""}`;
      access = { label: "Wade or drift", detail, icon: rising ? "caution" : "both" };
    } else if (flow < hi) {
      const detail = `Marginal wading at ${Math.round(flow).toLocaleString()} cfs — drift boat preferred${rising ? " — rising fast, use caution" : ""}`;
      access = { label: "Drift recommended", detail, icon: rising ? "caution" : "drift" };
    } else {
      const detail = `Too high to wade safely at ${Math.round(flow).toLocaleString()} cfs${rising ? " — rising fast, use caution" : ""}`;
      access = { label: "Drift boat only", detail, icon: rising ? "caution" : "drift" };
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
  if ((windPm ?? 0) > 20) {
    bestTime = { label: "Fish morning", detail: `Wind picks up afternoon — get out early` };
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
