export type TrendArrow = "↑" | "↓" | "→";

export function getFlowTrendArrow(change48hPct: number | null | undefined): TrendArrow {
  if (change48hPct == null || Number.isNaN(change48hPct)) return "→";
  if (change48hPct > 5) return "↑";
  if (change48hPct < -5) return "↓";
  return "→";
}
