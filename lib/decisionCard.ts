import type { FishabilityRow, RiverRegulation } from "@/lib/types";

export interface DecisionCard {
  go: { label: string; detail: string };
  access: { label: string; detail: string; icon: "wade" | "drift" | "both" | "caution" };
  hatch: { label: string; detail: string };
  clarity: { label: string; detail: string };
  bestTime: { label: string; detail: string };
  bestWindow: { label: string; reason: string; urgency: "low" | "medium" | "high" };
  regulation: { type: string; description: string; sourceUrl: string | null } | null;
}

/**
 * Build the 5-dimension decision card from a FishabilityRow.
 *
 * @param overrides.windMph       Live current wind speed (from v_river_detail_analytics)
 * @param overrides.cloudCoverPct Live cloud cover percentage (from weather_daily/analytics)
 * @param overrides.isTailwater   Whether river is a dam-regulated tailwater
 * @param overrides.regulations   Active regulations for this river today
 */
export function buildDecisionCard(
  river: FishabilityRow,
  overrides?: {
    windMph?: number | null;
    cloudCoverPct?: number | null;
    isTailwater?: boolean | null;
    regulations?: RiverRegulation[] | null;
    /** Primary hatch from a fly shop report — overrides the temp-derived hatch label */
    flyShopHatch?: string | null;
  }
): DecisionCard {
  const score = river.fishability_score_calc;
  const flow = river.flow_cfs;
  const temp = river.water_temp_f;
  const change48h = river.change_48h_pct_calc;
  const windAm = river.wind_am_mph;
  const windPm = river.wind_pm_mph;
  const precip = river.precip_mm;
  const wadingThreshold = river.wading_threshold_cfs;
  const driftOptimalMin = river.drift_optimal_min_cfs;

  // Effective wind: max of forecast am/pm and any live override
  const effectiveWind = Math.max(windAm ?? 0, windPm ?? 0, overrides?.windMph ?? 0);

  // Hatch context inputs
  const cloudCoverPct = overrides?.cloudCoverPct ?? river.cloud_cover_pct ?? null;
  const overcast = (cloudCoverPct ?? 0) > 50;
  const isTailwater = overrides?.isTailwater ?? river.is_tailwater ?? false;

  // Elevation-adjusted effective date for hatch timing.
  // High-elevation rivers run 1-3 weeks behind low-elevation rivers at the same temp
  // because cold nights slow insect development regardless of water temperature.
  const elevationFt = river.elevation_ft ?? null;
  const elevationOffsetWeeks = elevationHatchOffset(elevationFt);
  const effectiveDate = new Date();
  effectiveDate.setDate(effectiveDate.getDate() - elevationOffsetWeeks * 7);
  const month = effectiveDate.getMonth() + 1; // 1-12, elevation-adjusted
  const dayOfMonth = effectiveDate.getDate();

  console.log(
    "[buildDecisionCard]",
    river.river_name,
    { wind_am_mph: windAm, wind_pm_mph: windPm, liveWindOverride: overrides?.windMph, effectiveWind,
      elevation_ft: elevationFt, elevationOffsetWeeks, effectiveMonth: month, actualMonth: new Date().getMonth() + 1,
      temp, overcast, cloudCoverPct, isTailwater }
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
  const rapidRise = (change48h ?? 0) > 25;
  const rising = (change48h ?? 0) > 20;
  const highWind = effectiveWind > 20;
  const windNote = highWind ? " — high wind today" : "";

  // Wade-only: drift_optimal_min_cfs is null but wading_threshold_cfs is set
  const isWadeOnly = driftOptimalMin == null && wadingThreshold != null;

  if (flow == null) {
    access = { label: "Unknown", detail: "Flow data unavailable", icon: "caution" };
  } else if (rapidRise) {
    access = {
      label: "Rising fast",
      detail: `Flow up ${Math.round(change48h ?? 0)}% in 48hrs — wading dangerous, conditions changing`,
      icon: "caution",
    };
  } else if (isWadeOnly) {
    // Wade-only river — never show float language
    const risingNote = rising ? " — rising, use caution" : "";
    const caution = risingNote + windNote;
    const lo = wadingThreshold! * 0.7;
    if (flow < lo) {
      access = { label: "Wading recommended", detail: `Good wading at ${Math.round(flow).toLocaleString()} cfs — fish are concentrated in lower flows${caution}`, icon: rising ? "caution" : "wade" };
    } else if (flow < wadingThreshold!) {
      access = { label: "Wading recommended", detail: `Good wading at ${Math.round(flow).toLocaleString()} cfs${caution}`, icon: rising ? "caution" : "wade" };
    } else {
      access = { label: "High for wading", detail: `${Math.round(flow).toLocaleString()} cfs — above typical wading threshold, use caution${caution}`, icon: "caution" };
    }
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
  const derivedHatch = deriveHatch({ month, temp, overcast, isTailwater, slug: river.slug, elevationOffsetWeeks });
  const hatch: DecisionCard["hatch"] = overrides?.flyShopHatch
    ? { label: `${overrides.flyShopHatch} (confirmed)`, detail: derivedHatch.detail }
    : derivedHatch;

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

  // ── BEST TIME (simplified — bestWindow carries the detail) ─────────────────
  let bestTime: DecisionCard["bestTime"];
  if ((windPm ?? 0) > 18 && (windPm ?? 0) > (windAm ?? 0)) {
    bestTime = { label: "Morning", detail: "Wind picks up in the afternoon" };
  } else if ((windAm ?? 0) > 18 && (windPm ?? 0) < 12) {
    bestTime = { label: "Afternoon", detail: "Morning wind settles by afternoon" };
  } else if (temp != null && temp < 45) {
    bestTime = { label: "Midday", detail: "Cold water — fish active only during peak warmth" };
  } else if (temp != null && temp > 68) {
    bestTime = { label: "Dawn only", detail: "Thermal stress — off water by 9am" };
  } else if (temp != null && temp > 62) {
    bestTime = { label: "Morning or evening", detail: "Avoid midday heat" };
  } else {
    bestTime = { label: "All day", detail: "Conditions favorable throughout" };
  }

  // ── BEST WINDOW ─────────────────────────────────────────────────────────────
  const bestWindow = deriveBestWindow({ temp, windAm, windPm, month, elevationFt });

  // ── REGULATION ──────────────────────────────────────────────────────────────
  // Priority: closed > hoot_owl > hours_restricted > catch_release
  const regs = overrides?.regulations ?? [];
  const regPriority = ["closed", "hoot_owl", "hours_restricted", "catch_release"];
  const activeReg = regPriority
    .map((type) => regs.find((r) => r.regulation_type === type))
    .find(Boolean) ?? null;

  const regulation = activeReg
    ? { type: activeReg.regulation_type, description: activeReg.description, sourceUrl: activeReg.source_url }
    : null;

  return { go, access, hatch, clarity, bestTime, bestWindow, regulation };
}

// ── Best window ───────────────────────────────────────────────────────────────

function deriveBestWindow({
  temp,
  windAm,
  windPm,
  month,
  elevationFt,
}: {
  temp: number | null;
  windAm: number | null;
  windPm: number | null;
  month: number;
  elevationFt: number | null;
}): DecisionCard["bestWindow"] {
  const highElev = (elevationFt ?? 0) > 5500;
  const elevSuffix = highElev ? " — high elevation, water warms later in the day" : "";

  // Heat stress — trumps everything
  if (temp != null && temp > 68) {
    return {
      label: "Before 9am only",
      reason: "Thermal stress — fish at first light, off water by 9am",
      urgency: "high",
    };
  }

  // Warm water — July/August zone
  if (temp != null && temp >= 62) {
    return {
      label: "Morning or evening",
      reason: "Midday heat stress — fish before 10am or after 6pm",
      urgency: "high",
    };
  }

  // Cold water — April/May
  if (temp != null && temp < 45 && month >= 3 && month <= 5) {
    const windowLabel = highElev ? "Best 12pm–4pm" : "Best 11am–3pm";
    return {
      label: windowLabel,
      reason: `Cold water — trout most active during peak warmth${elevSuffix}`,
      urgency: "high",
    };
  }

  // Wind: PM worse than AM
  if ((windPm ?? 0) > 18 && (windPm ?? 0) > (windAm ?? 0)) {
    return {
      label: "Fish morning",
      reason: "Wind picks up afternoon — get out early",
      urgency: "medium",
    };
  }

  // Wind: AM worse, PM clears
  if ((windAm ?? 0) > 18 && (windPm ?? 0) < 12) {
    return {
      label: "Fish afternoon",
      reason: "Morning wind settles by afternoon",
      urgency: "medium",
    };
  }

  // Optimal — any mild cold water modifier
  if (temp != null && temp < 48) {
    const windowLabel = highElev ? "Best 12pm–4pm" : "Best 11am–3pm";
    return {
      label: windowLabel,
      reason: `Cool water — fish most active midday${elevSuffix}`,
      urgency: "medium",
    };
  }

  return {
    label: "All day",
    reason: "Good conditions throughout",
    urgency: "low",
  };
}

// ── Hatch intelligence ────────────────────────────────────────────────────────

function elevationHatchOffset(elevationFt: number | null): number {
  if (elevationFt == null) return 0;
  if (elevationFt > 6000) return 3;
  if (elevationFt > 5000) return 2;
  if (elevationFt >= 3500) return 1;
  return 0;
}

function deriveHatch({
  month,
  temp,
  overcast,
  isTailwater,
  slug,
  elevationOffsetWeeks,
}: {
  month: number;
  temp: number | null;
  overcast: boolean;
  isTailwater: boolean;
  slug?: string;
  elevationOffsetWeeks?: number;
}): { label: string; detail: string } {
  const elevNote =
    elevationOffsetWeeks == null || elevationOffsetWeeks === 0
      ? ""
      : elevationOffsetWeeks >= 3
      ? " — high elevation delays hatches ~3 weeks vs lower rivers"
      : elevationOffsetWeeks === 2
      ? " — moderate-high elevation, hatches run ~2 weeks behind lower rivers"
      : " — moderate elevation, hatches run ~1 week behind lower rivers";

  const result = deriveHatchInner({ month, temp, overcast, isTailwater, slug });
  if (elevNote) result.detail += elevNote;
  return result;
}

function deriveHatchInner({
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
