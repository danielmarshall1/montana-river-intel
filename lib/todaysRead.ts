import type { FishabilityRow } from "@/lib/types";

export function generateTodaysRead(river: Partial<FishabilityRow> | null | undefined): string {
  if (!river) return "No current river read available.";

  const parts: string[] = [];
  const ratio = river.flow_ratio_calc;
  const change48h = river.change_48h_pct_calc;
  const windPm = river.wind_pm_mph;
  const tempF = river.water_temp_f;
  const precipMm = river.precip_mm;

  if (ratio != null) {
    if (ratio >= 0.85 && ratio <= 1.15) parts.push("Flow near seasonal median.");
    else if (ratio < 0.8) parts.push("Flow below seasonal median.");
    else if (ratio > 1.2) parts.push("Flow above seasonal median.");
  }

  if (change48h != null) {
    const absChange = Math.abs(change48h);
    if (absChange < 5) parts.push("Stable.");
    else if (absChange <= 15) parts.push("Moderate change.");
    else parts.push("Unstable.");
  }

  if (windPm != null) {
    if (windPm > 30) parts.push("High wind risk.");
    else if (windPm > 20) parts.push("Elevated PM wind.");
  }

  if (tempF != null && tempF > 66) {
    parts.push("Thermal stress possible.");
  }

  if (precipMm != null && precipMm >= 8) {
    parts.push("Notable precipitation.");
  }

  if (parts.length === 0) {
    return "Conditions are mixed with limited signal from current telemetry.";
  }

  return parts.join(" ");
}
