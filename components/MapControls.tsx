"use client";

import { useState, useEffect } from "react";

const STORAGE_LABELS = "montana-river-map-labels";

interface MapControlsProps {
  map: any;
}

function getStoredLabels(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(STORAGE_LABELS);
  return v === null ? true : v === "true";
}

export function MapControls({ map }: MapControlsProps) {
  const [labelsOn, setLabelsOn] = useState(getStoredLabels);

  useEffect(() => {
    if (!map) return;

    // Apply labels
    const layers = map.getStyle()?.layers;
    if (Array.isArray(layers)) {
      for (const layer of layers) {
        if (layer.id.toLowerCase().includes("label")) {
          map.setLayoutProperty(
            layer.id,
            "visibility",
            labelsOn ? "visible" : "none"
          );
        }
      }
    }
  }, [map, labelsOn]);

  const toggleLabels = () => {
    const next = !labelsOn;
    setLabelsOn(next);
    localStorage.setItem(STORAGE_LABELS, String(next));
  };

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-30 flex flex-col gap-2 rounded-lg p-1.5">
      <label className="pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/5 text-sm text-slate-200 bg-slate-900/90 backdrop-blur-sm border border-white/10">
        <input
          type="checkbox"
          checked={labelsOn}
          onChange={toggleLabels}
          className="rounded border-slate-500 bg-slate-800 text-sky-500"
        />
        Labels
      </label>
    </div>
  );
}
