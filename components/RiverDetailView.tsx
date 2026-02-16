"use client";

import Link from "next/link";
import type { FishabilityRow } from "@/lib/types";
import type { PAIReport } from "@/lib/pai";
import { TierPill } from "./TierPill";
import { StatChip } from "./StatChip";

interface RiverDetailViewProps {
  river: FishabilityRow;
  paiReports?: PAIReport[];
}

export function RiverDetailView({ river, paiReports = [] }: RiverDetailViewProps) {
  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{river.river_name}</h1>
          <p className="text-slate-500">{river.gauge_label}</p>
        </div>
        <div className="flex items-center gap-4">
          <TierPill tier={river.bite_tier} />
          <span className="text-4xl font-bold tabular-nums text-slate-900">
            {river.fishability_score_calc ?? "—"}
          </span>
          <span className="text-slate-500">fishability</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <StatChip label="Flow" value={river.flow_cfs} unit=" cfs" />
          <StatChip label="Median flow" value={river.median_flow_cfs} unit=" cfs" />
          <StatChip label="Flow ratio" value={river.flow_ratio_calc?.toFixed(1)} unit="x" />
          <StatChip label="48h change" value={river.change_48h_pct_calc?.toFixed(1)} unit="%" />
          <StatChip label="Water temp" value={river.water_temp_f} unit="°F" />
          <StatChip label="Wind AM" value={river.wind_am_mph} unit=" mph" />
          <StatChip label="Wind PM" value={river.wind_pm_mph} unit=" mph" />
        </div>
        {paiReports.length > 0 && (
          <div className="pt-4 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
              PAI Reports
            </h2>
            <ul className="space-y-2">
              {paiReports.map((r) => (
                <li key={r.id} className="text-sm">
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    {r.title}
                  </a>
                  <span className="text-slate-400 ml-2">— {r.shop_name}</span>
                  {r.published_at && (
                    <span className="text-slate-400 ml-2">
                      {new Date(r.published_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Link
              href="/reports"
              className="mt-2 inline-block text-sm text-slate-500 hover:text-slate-700"
            >
              View all PAI reports →
            </Link>
          </div>
        )}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-500">USGS site: {river.usgs_site_no}</p>
        </div>
      </div>
    </main>
  );
}
