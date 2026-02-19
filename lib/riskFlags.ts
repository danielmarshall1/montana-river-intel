import type { FishabilityRow } from "@/lib/types";

export function riskFlags(river: Partial<FishabilityRow> | null | undefined): string[] {
  if (!river) return [];
  const flags: string[] = [];

  const change = river.change_48h_pct_calc;
  const precipMm = river.precip_mm;
  const precipProb = river.precip_probability_pct;
  const tempF = river.water_temp_f;

  if (change != null && Math.abs(change) >= 15) {
    flags.push("Unstable flows");
  }
  if ((precipMm != null && precipMm >= 10) || (precipProb != null && precipProb >= 70)) {
    flags.push("Runoff risk");
  }
  if (tempF != null && tempF >= 66) {
    flags.push("Thermal advisory");
  }
  return flags;
}
