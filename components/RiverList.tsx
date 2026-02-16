"use client";

import type { FishabilityRow } from "@/lib/types";
import { RiverRow } from "./RiverRow";

interface RiverListProps {
  rivers: FishabilityRow[];
  selectedRiverId: string | null;
  onSelectRiver: (river: FishabilityRow) => void;
}

export function RiverList({
  rivers,
  selectedRiverId,
  onSelectRiver,
}: RiverListProps) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {rivers.length === 0 ? (
        <p className="text-slate-400 text-sm py-10 text-center">
          No river data available
        </p>
      ) : (
        rivers.map((river) => (
          <RiverRow
            key={river.river_id}
            river={river}
            isSelected={selectedRiverId === river.river_id}
            onSelect={() => onSelectRiver(river)}
          />
        ))
      )}
    </div>
  );
}
