"use client";

import { useState, useEffect, useMemo } from "react";
import type { FishabilityRow } from "@/lib/types";
import { fetchRiverGeom } from "@/lib/supabase";
import { MapView } from "./MapView";
import PageHeader from "./PageHeader";
import RiverCard from "./RiverCard";
import { RiverDetailsDrawer } from "./RiverDetailsDrawer";

function biteTierToDisplay(tier: FishabilityRow["bite_tier"]): "Good" | "Fair" | "Tough" {
  if (tier === "HOT" || tier === "GOOD") return "Good";
  if (tier === "FAIR") return "Fair";
  return "Tough";
}

interface MainViewProps {
  rivers: FishabilityRow[];
}

export function MainView({ rivers }: MainViewProps) {
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const [drawerRiver, setDrawerRiver] = useState<FishabilityRow | null>(null);
  const [selectedRiverGeojson, setSelectedRiverGeojson] = useState<GeoJSON.GeoJSON | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [sort, setSort] = useState<"best" | "name">("best");

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    []
  );

  const filteredRivers = useMemo(() => {
    const s = search.trim().toLowerCase();

    let list = rivers.filter((r) => {
      const matchesSearch =
        !s ||
        (r.river_name ?? "").toLowerCase().includes(s) ||
        (r.gauge_label ?? "").toLowerCase().includes(s);

      const displayTier = biteTierToDisplay(r.bite_tier);
      const matchesTier = tierFilter === "All" || displayTier === tierFilter;

      return matchesSearch && matchesTier;
    });

    if (sort === "best") {
      list = [...list].sort(
        (a, b) => (b.fishability_score_calc ?? -999) - (a.fishability_score_calc ?? -999)
      );
    } else {
      list = [...list].sort((a, b) =>
        (a.river_name ?? "").localeCompare(b.river_name ?? "")
      );
    }

    return list;
  }, [rivers, search, tierFilter, sort]);

  useEffect(() => {
    if (!selectedRiverId) {
      setSelectedRiverGeojson(null);
      return;
    }
    fetchRiverGeom(selectedRiverId).then((geom) => {
      if (geom) {
        setSelectedRiverGeojson(geom as GeoJSON.GeoJSON);
      } else {
        setSelectedRiverGeojson(null);
      }
    });
  }, [selectedRiverId]);

  const handleSelectRiver = (river: FishabilityRow) => {
    setSelectedRiverId(river.river_id);
    setDrawerRiver(river);
  };

  const handleCloseDrawer = () => {
    setDrawerRiver(null);
    setSelectedRiverId(null);
  };

  const selectedRiver = rivers.find((r) => r.river_id === selectedRiverId) ?? null;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-8">
      <div className="p-4 md:p-6 space-y-8">
        <PageHeader
          dateLabel={dateLabel}
          riverCount={rivers.length}
          search={search}
          setSearch={setSearch}
          tierFilter={tierFilter}
          setTierFilter={setTierFilter}
          sort={sort}
          setSort={(v) => setSort(v as "best" | "name")}
        />

        {/* Map - premium container */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="h-[520px]">
            <MapView
              rivers={rivers}
              selectedRiver={selectedRiver}
              selectedRiverId={selectedRiverId}
              selectedRiverGeojson={selectedRiverGeojson}
              onSelectRiver={handleSelectRiver}
            />
          </div>
        </div>

        {/* Rivers by fishability - responsive grid */}
        <h2 className="mt-8 mb-3 text-xl font-semibold text-slate-900">
          Rivers by fishability
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRivers.map((r) => (
            <RiverCard
              key={r.river_id}
              river={r.river_name}
              subtitle={r.gauge_label || undefined}
              tier={biteTierToDisplay(r.bite_tier)}
              score={r.fishability_score_calc}
              flowCfs={r.flow_cfs}
              ratio={r.flow_ratio_calc}
              tempF={r.water_temp_f}
              windAm={r.wind_am_mph}
              windPm={r.wind_pm_mph}
              onClick={() => handleSelectRiver(r)}
            />
          ))}
        </div>
        {filteredRivers.length === 0 && (
          <p className="py-10 text-center text-slate-500">No rivers match your filters</p>
        )}
      </div>

      {/* Details drawer */}
      {drawerRiver && (
        <RiverDetailsDrawer river={drawerRiver} onClose={handleCloseDrawer} />
      )}
    </div>
  );
}
