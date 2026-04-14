import type { FishabilityRow } from "@/lib/types";

export interface DecisionCard {
  go: { label: string; detail: string };
  access: { label: string; detail: string; icon: "wade" | "drift" | "both" | "caution" };
  hatch: { label: string; detail: string };
  clarity: { label: string; detail: string };
  bestTime: { label: string; detail: string };
}

/**
 * Build the 5-dimension decision card from a FishabilityRow.
 *
 * @param overrides.windMph       Live current wind speed (from v_river_detail_analytics)
 * @param overrides.cloudCoverPct Live cloud cover percentage (from weather_daily/analytics)
 * @param overrides.isTailwater   Whether river is a dam-regulated tailwater
 */
export function buildDecisionCard(
  river: FishabilityRow,
  overrides?: { windMph?: number | null; cloudCoverPct?: number | null; isTailwater?: boolean | null }
): DecisionCard {
  const score = river.fishability_score_calc;
  const flow = river.flow_cfs;
  const temp = river.water_temp_f;
  const change48h = river.change_48h_pct_calc;
  const windAm = river.wind_am_mph;
  const windPm = river.wind_pm_mph;
  const precip = river.precip_mm;
  const wadingThreshold = river.wading_threshold_cfs;

  // Effective wind: max of forecast am/pm and any live override
  const effectiveWind = Math.max(windAm ?? 0, windPm ?? 0, overrides?.windMph ?? 0);

  // Hatch context inputs
  const month = new Date().getMonth() + 1; // 1-12
  const cloudCoverPct = overrides?.cloudCoverPct ?? river.cloud_cover_pct ?? null;
  const overcast = (cloudCoverPct ?? 0) > 50;
  const isTailwater = overrides?.isTailwater ?? river.is_tailwater ?? false;

  console.log(
    "[buildDecisionCard]",
    river.river_name,
    { wind_am_mph: windAm, wind_pm_mph: windPm, liveWindOverride: overrides?.windMph, effectiveWind,
      month, temp, overcast, cloudCoverPct, isTailwater }
  );

  // ── GO ──────────────────────────────────────────────────────────────────────
  let go: DecisionCard["go"];
  if (score == null) {
    go = { label: "Unknown", detail: "Score unavailable" };
  } else if (score >= 82) {
    go = { label: "Excellent", detail: "Prime conditions — go today" };
  } else if (score >= 65) {
    go = { label: "Good", detail: "Solid conditions" };
  } else if (score >= 48) {
    go = { label: "Fair", detail: "Fishable but challenging" };
  } else {
    go = { label: "Tough", detail: "Consider waiting" };
  }

  // ── ACCESS ──────────────────────────────────────────────────────────────────
  let access: DecisionCard["access"];
  const rising = (change48h ?? 0) > 20;
  const highWind = effectiveWind > 20;
  const windNote = highWind ? " — high wind today" : "";

  if (flow == null) {
    access = { label: "Unknown", detail: "Flow data unavailable", icon: "caution" };
  } else if (wadingThreshold == null) {
    if (flow < 500) {
      access = { label: "Wading recommended", detail: `Low water at ${Math.round(flow).toLocaleString()} cfs${windNote}`, icon: rising ? "caution" : "wade" };
    } else if (flow < 2000) {
      access = { label: "Wade or float", detail: `${Math.round(flow).toLocaleString()} cfs — either works${windNote}`, icon: rising ? "caution" : "both" };
    } else {
      access = { label: "Float recommended", detail: `${Math.round(flow).toLocaleString()} cfs — floating preferred${windNote}`, icon: rising ? "caution" : "drift" };
    }
  } else {
    const lo = wadingThreshold * 0.7;
    const hi = wadingThreshold * 1.3;
    const risingNote = rising ? " — rising quickly, use caution if wading" : "";
    const caution = risingNote + windNote;
    if (flow < lo) {
      access = { label: "Wading recommended", detail: `Low water — wade carefully, fish are concentrated${caution}`, icon: rising ? "caution" : "wade" };
    } else if (flow < wadingThreshold) {
      access = { label: "Wade or float", detail: `Good wading conditions at ${Math.round(flow).toLocaleString()} cfs — either works${caution}`, icon: rising ? "caution" : "both" };
    } else if (flow < hi) {
      access = { label: "Float recommended", detail: `Marginal wading at ${Math.round(flow).toLocaleString()} cfs — floating preferred${caution}`, icon: rising ? "caution" : "drift" };
    } else {
      access = { label: "Float trip recommended", detail: `High water at ${Math.round(flow).toLocaleString()} cfs — floating safer than wading${caution}`, icon: rising ? "caution" : "drift" };
    }
  }

  // ── HATCH ───────────────────────────────────────────────────────────────────
  const hatch = deriveHatch({ month, temp, overcast, isTailwater, slug: river.slug });

  // ── CLARITY ─────────────────────────────────────────────────────────────────
  let clarity: DecisionCard["clarity"];
  const isRising = (change48h ?? 0) > 0;
  if (isRising && (change48h ?? 0) > 30) {
    clarity = { label: "Off color", detail: "Rising fast — expect turbid water, fish streamers" };
  } else if (isRising && (change48h ?? 0) > 15) {
    clarity = { label: "Slightly off", detail: "Clearing but still off — nymphs and streamers" };
  } else if ((precip ?? 0) > 5) {
    clarity = { label: "Off color", detail: "Recent precip — water likely turbid" };
  } else {
    clarity = { label: "Likely clear", detail: "Stable conditions suggest clear water" };
  }

  // ── BEST TIME ───────────────────────────────────────────────────────────────
  let bestTime: DecisionCard["bestTime"];
  if (effectiveWind > 20) {
    if ((windPm ?? 0) > (windAm ?? 0) || overrides?.windMph != null) {
      bestTime = { label: "Fish morning", detail: `Wind picks up — get out early (${Math.round(effectiveWind)} mph observed)` };
    } else {
      bestTime = { label: "Fish afternoon", detail: "Morning wind — wait for afternoon calm" };
    }
  } else if ((windAm ?? 0) > 20) {
    bestTime = { label: "Fish afternoon", detail: "Morning wind — wait for afternoon calm" };
  } else if (temp != null && temp < 45) {
    bestTime = { label: "Midday only", detail: "Cold water — fish active only during warmest hours" };
  } else if (temp != null && temp > 62) {
    bestTime = { label: "Early morning", detail: "Warm water — fish before 9am to avoid heat stress" };
  } else {
    bestTime = { label: "All day", detail: "Conditions favorable throughout the day" };
  }

  return { go, access, hatch, clarity, bestTime };
}

// ── Hatch intelligence ────────────────────────────────────────────────────────

function deriveHatch({
  month,
  temp,
  overcast,
  isTailwater,
  slug,
}: {
  month: number;
  temp: number | null;
  overcast: boolean;
  isTailwater: boolean;
  slug?: string;
}): { label: string; detail: string } {
  const tw = isTailwater;
  const isMissouri = slug === "missouri-toston";

  // Jan-Feb: midge only everywhere
  if (month <= 2) {
    return {
      label: "Midges",
      detail: "Size 22-26 midge larvae and pupae — fish slow and deep, midday only",
    };
  }

  // March
  if (month === 3) {
    if (tw) {
      return {
        label: "Midges/BWO",
        detail: "Midge fishing dominant. BWO possible on overcast days — size 18-20",
      };
    }
    if (temp != null && temp >= 44 && temp < 48 && overcast) {
      return {
        label: "Skwala/Midge",
        detail: "Skwala stonefly emerging — size 8-10 dry. Midges subsurface",
      };
    }
    return {
      label: "Midges",
      detail: "Midge fishing — size 22-24. Watch for early Skwala on warm afternoons",
    };
  }

  // April
  if (month === 4) {
    if (temp == null || temp < 42) {
      return {
        label: "Midges",
        detail: "Water too cold for active hatches — size 22-24 midges, fish slow water midday",
      };
    }
    if (temp < 46) {
      return overcast
        ? { label: "March Brown/BWO", detail: "March Brown and BWO possible on overcast days — size 14-20, nymph backup" }
        : { label: "BWO/Midge", detail: "BWO possible midday — size 18-20. Midges reliable subsurface" };
    }
    if (temp < 50) {
      return {
        label: "BWO/Skwala",
        detail: "BWO active midday — size 18-20. Skwala dry fly opportunity on warm afternoons, size 8-10",
      };
    }
    if (temp < 54) {
      return {
        label: "Mother's Day Caddis approaching",
        detail: "Caddis emerging — size 14-16. Watch for Mother's Day hatch window. BWO still active",
      };
    }
    return {
      label: "Caddis/BWO",
      detail: "Mother's Day Caddis likely — size 14-16, fish evening. BWO midday",
    };
  }

  // May
  if (month === 5) {
    if (tw) {
      return {
        label: "BWO/Caddis",
        detail: "BWO and early Caddis — tailwater fishing best in state right now while freestones blow out",
      };
    }
    if (temp == null || temp < 50) {
      return {
        label: "BWO/Midge",
        detail: "BWO on overcast days — high water limits dry fly. Nymphing most effective",
      };
    }
    if (temp < 55) {
      return {
        label: "Caddis/BWO",
        detail: "Mother's Day Caddis and BWO — fish the windows between runoff pulses, size 14-18",
      };
    }
    if (temp < 58) {
      return {
        label: "Salmonfly approaching",
        detail: "Salmonfly nymphs moving to banks — size 4-8 nymph near structure. Hatch imminent",
      };
    }
    return {
      label: "Salmonfly",
      detail: "Salmonfly hatch — size 4-8, fish the banks. Golden Stone also emerging",
    };
  }

  // June
  if (month === 6) {
    if (tw) {
      return {
        label: "PMD/Caddis",
        detail: "PMD and Caddis active — size 14-18. Best dry fly fishing in Montana right now",
      };
    }
    if (temp == null || temp < 55) {
      return {
        label: "Salmonfly/Golden Stone",
        detail: "Salmonfly and Golden Stone — size 4-10, fish the banks and structure",
      };
    }
    if (temp < 60) {
      return {
        label: "Golden Stone/PMD",
        detail: "Golden Stone and early PMD — size 8-18. Yellow Sally nymphs active",
      };
    }
    return {
      label: "PMD/Caddis/Yellow Sally",
      detail: "PMD, Caddis, Yellow Sally all active — match what's on the water, size 10-18",
    };
  }

  // July
  if (month === 7) {
    if (temp == null || temp < 58) {
      return {
        label: "PMD/Caddis",
        detail: "PMD midday, Caddis evening — size 14-18, fish the seams",
      };
    }
    if (temp < 64) {
      return {
        label: "Peak hatches",
        detail: "PMD mornings, Trico dawn (size 20-24), Caddis evening, Hoppers afternoon — size 8-18",
      };
    }
    if (temp <= 68) {
      return {
        label: "Hoppers/Terrestrials",
        detail: "Hopper season — size 8-12, fish the banks. PMD and Caddis still active morning/evening",
      };
    }
    return {
      label: "Evening only",
      detail: "Thermal stress — fish Caddis and PMD evening only after water cools below 65°F",
    };
  }

  // August
  if (month === 8) {
    if (temp == null || temp < 62) {
      return {
        label: "PMD/Trico/Caddis",
        detail: "Trico mornings (size 20-24), PMD midday, Caddis evening — prime late summer",
      };
    }
    if (temp <= 68) {
      return {
        label: "Hoppers/Trico",
        detail: "Hopper/Dropper dominant — size 8-12 on banks. Trico dawn, Caddis dusk",
      };
    }
    return {
      label: "Early morning only",
      detail: "Heat stress — fish Trico at dawn (size 20-24), off water by 10am",
    };
  }

  // September
  if (month === 9) {
    if (temp == null || temp < 50) {
      return overcast
        ? { label: "Baetis/BWO", detail: "Blue Winged Olives on overcast days — size 18-20. Best fall fishing" }
        : { label: "Baetis/Midge", detail: "BWO possible midday, midges reliable — size 18-22" };
    }
    if (temp < 58) {
      return {
        label: "Mahogany Dun/Baetis",
        detail: "Mahogany Dun and BWO — size 14-20. Outstanding fall dry fly conditions",
      };
    }
    return {
      label: "Terrestrials/Baetis",
      detail: "Hoppers still working, BWO midday — prime September fishing",
    };
  }

  // October
  if (month === 10) {
    if (temp == null || temp < 46) {
      if (isMissouri) {
        return {
          label: "October Caddis/BWO",
          detail: "Missouri October Caddis — strongest in Montana, size 8-10. BWO on overcast days",
        };
      }
      return overcast
        ? { label: "BWO/October Caddis", detail: "Blue Winged Olives on overcast days — size 18-20. October Caddis size 8-10 possible" }
        : { label: "BWO/Midge", detail: "BWO midday on overcast days — size 18-22. Midge reliable" };
    }
    if (temp < 54) {
      return {
        label: "BWO/Mahogany",
        detail: "Best BWO fishing of the year — size 16-20 on overcast days. Mahogany Dun possible",
      };
    }
    return {
      label: "BWO/October Caddis",
      detail: isMissouri
        ? "BWO and October Caddis — Missouri October Caddis strongest in MT, size 8-10. Exceptional fall conditions"
        : "BWO and October Caddis — size 8-20. Exceptional fall conditions",
    };
  }

  // Nov-Dec
  return {
    label: "Midges",
    detail: "Midge fishing only — size 22-26, fish slow deep water, midday warmth essential",
  };
}
