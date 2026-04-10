import type { FishabilityRow } from "@/lib/types";

export function generateTodaysRead(river: Partial<FishabilityRow> | null | undefined): string {
  if (!river) return "No current river read available.";

  const ratio = river.flow_ratio_calc;
  const change48h = river.change_48h_pct_calc;
  const windPm = river.wind_pm_mph;
  const tempF = river.water_temp_f;

  // Temperature-first base read
  let base: string;
  if (tempF == null) {
    base = "Water temperature unavailable — check flow and stability conditions before committing to a technique.";
  } else if (tempF < 42) {
    base = `Water at ${tempF.toFixed(1)}°F — fish are lethargic. Slow nymphs deep in the slowest water, midday only.`;
  } else if (tempF < 48) {
    base = `Water at ${tempF.toFixed(1)}°F and warming. Nymphing productive; watch for early midge activity midday.`;
  } else if (tempF < 54) {
    base = `Water at ${tempF.toFixed(1)}°F — prime early season range. PMDs and caddis likely midday; streamer fishing productive in early morning.`;
  } else if (tempF <= 62) {
    base = `Water at ${tempF.toFixed(1)}°F — optimal feeding temperature. Expect active surface feeding; match the hatch and fish the seams.`;
  } else {
    base = `Water at ${tempF.toFixed(1)}°F — thermal stress possible. Fish early morning only, target deep cold-water refugia.`;
  }

  // Flow and stability modifiers (up to 2)
  const modifiers: string[] = [];

  if (ratio != null && ratio > 1.3) {
    modifiers.push(`Flow running ${Math.round((ratio - 1) * 100)}% above median — fish edges and slower pockets.`);
  } else if (ratio != null && ratio < 0.7) {
    modifiers.push(`Flow running ${Math.round((1 - ratio) * 100)}% below median — fish are spooky, long leaders and fine tippet.`);
  }

  if (change48h != null && change48h > 15) {
    modifiers.push(`Rising ${change48h.toFixed(0)}% over 48h — fish pushing to banks as flow comes up.`);
  } else if (change48h != null && change48h < -15) {
    modifiers.push(`Dropping ${Math.abs(change48h).toFixed(0)}% over 48h — fish may be scattered as they adjust to falling water.`);
  }

  // Wind modifier (replaces a flow modifier if at limit)
  if (windPm != null && windPm > 20) {
    if (modifiers.length < 2) {
      modifiers.push(`Wind at ${windPm.toFixed(0)}mph — skip dry flies, go subsurface.`);
    } else {
      modifiers[1] = `Wind at ${windPm.toFixed(0)}mph — skip dry flies, go subsurface.`;
    }
  }

  if (modifiers.length === 0) return base;
  return `${base} ${modifiers.join(" ")}`;
}
