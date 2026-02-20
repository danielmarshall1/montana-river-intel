import type { FishabilityRow } from "@/lib/types";
import type { ThermalSummary } from "@/lib/thermalWindow";

export type HatchIntel = {
  likelyBugs: string;
  confidence: "Low" | "Moderate" | "High";
  bestWindow: string;
  approach: string;
};

function seasonForMonth(month: number): "winter" | "spring" | "summer" | "fall" {
  if (month === 11 || month <= 1) return "winter";
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  return "fall";
}

export function generateHatchIntel(
  river: FishabilityRow | null,
  thermal: ThermalSummary,
  date = new Date()
): HatchIntel {
  const season = seasonForMonth(date.getMonth());
  const stability = Math.abs(Number(river?.change_48h_pct_calc ?? 0));
  const ratio = Number(river?.flow_ratio_calc ?? 1);
  const temp = thermal.tempNowF ?? river?.water_temp_f ?? null;

  let likelyBugs = "Midges";
  let bestWindow = "Late morning to early afternoon";
  let approach = "Work softer seams with small nymphs and emergers.";

  if (season === "spring") {
    likelyBugs = "Skwala, Baetis, early Caddis";
    bestWindow = "Midday through late afternoon";
    approach = "Start nymphing, then shift to dries when rises begin.";
  } else if (season === "summer") {
    likelyBugs = "PMD, Caddis, Stones, Terrestrials";
    bestWindow = "Early morning and evening, with midday caddis windows";
    approach = "Cover banks and pocket water; switch between dry-dropper and nymph rigs.";
  } else if (season === "fall") {
    likelyBugs = "Baetis, Mahogany Dun, Midges";
    bestWindow = "Late morning through mid-afternoon";
    approach = "Focus transition water with small mayfly patterns and light nymphs.";
  }

  if (temp != null && temp >= 66) {
    bestWindow = "Early morning only";
    approach = "Prioritize cooler periods and shorten handling time.";
  } else if (thermal.state === "warming") {
    bestWindow = "As water warms into afternoon";
  }

  let confidence: HatchIntel["confidence"] = "Moderate";
  if (stability >= 15 || ratio > 1.35 || ratio < 0.7) confidence = "Low";
  else if (stability <= 6 && ratio >= 0.85 && ratio <= 1.15 && temp != null && temp >= 44 && temp <= 64) {
    confidence = "High";
  }

  return {
    likelyBugs,
    confidence,
    bestWindow,
    approach,
  };
}

