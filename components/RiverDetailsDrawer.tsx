"use client";

import Link from "next/link";
import type { FishabilityRow } from "@/lib/types";
import { TierPill } from "./TierPill";
import { StatChip } from "./StatChip";

interface RiverDetailsDrawerProps {
  river: FishabilityRow | null;
  onClose: () => void;
}

export function RiverDetailsDrawer({ river, onClose }: RiverDetailsDrawerProps) {
  if (!river) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-soft-lg z-40 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900">{river.river_name}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <TierPill tier={river.bite_tier} />
          <span className="text-3xl font-bold tabular-nums text-slate-900">
            {river.fishability_score_calc ?? "—"}
          </span>
          <span className="text-slate-500 text-sm">fishability</span>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatChip label="Flow" value={river.flow_cfs} unit=" cfs" />
            <StatChip label="Flow ratio" value={river.flow_ratio_calc?.toFixed(1)} unit="x" />
            <StatChip label="48h change" value={river.change_48h_pct_calc?.toFixed(1)} unit="%" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <StatChip label="Water temp" value={river.water_temp_f} unit="°F" />
            <StatChip label="Wind AM" value={river.wind_am_mph} unit=" mph" />
            <StatChip label="Wind PM" value={river.wind_pm_mph} unit=" mph" />
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500">Gauge: {river.gauge_label}</p>
          <p className="text-xs text-slate-500">USGS {river.usgs_site_no}</p>
          <Link
            href={`/river/${river.river_id}`}
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View full details →
          </Link>
        </div>
      </div>
    </div>
  );
}
