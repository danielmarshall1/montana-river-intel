"use client";

import type { FishabilityRow } from "@/lib/types";
import { TierPill } from "./TierPill";

interface RiverRowProps {
  river: FishabilityRow;
  isSelected?: boolean;
  onSelect: () => void;
}

export function RiverRow({ river, isSelected, onSelect }: RiverRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl transition-all duration-200 border-l-[3px] pl-4 pr-4 py-3.5 ${
        isSelected
          ? "bg-sky-500/15 border-l-sky-400 border border-sky-400/30 shadow-sm"
          : "bg-white/[0.04] border-l-transparent border border-transparent hover:bg-white/[0.08] hover:border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-white truncate">
            {river.river_name}
          </p>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {river.gauge_label}
          </p>
        </div>
        <TierPill tier={river.bite_tier} />
      </div>
      <div className="mt-3 flex items-baseline gap-4">
        <span
          className={`text-2xl font-bold tabular-nums ${
            isSelected ? "text-sky-300" : "text-white"
          }`}
        >
          {river.fishability_score_calc ?? "—"}
        </span>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="tabular-nums">
            {river.flow_cfs != null ? `${river.flow_cfs} cfs` : "—"}
          </span>
          {river.flow_ratio_calc != null && (
            <span className="tabular-nums">
              {river.flow_ratio_calc.toFixed(1)}x
            </span>
          )}
          {river.change_48h_pct_calc != null && (
            <span
              className={`tabular-nums ${
                river.change_48h_pct_calc >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {river.change_48h_pct_calc >= 0 ? "+" : ""}
              {river.change_48h_pct_calc.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span>Temp {river.water_temp_f != null ? `${river.water_temp_f}°F` : "—"}</span>
        <span>
          Wind {river.wind_am_mph ?? "—"}/{river.wind_pm_mph ?? "—"} mph
        </span>
      </div>
    </button>
  );
}
