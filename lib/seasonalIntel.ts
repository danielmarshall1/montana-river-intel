export interface SeasonalIntel {
  season: "Winter" | "Spring" | "Summer" | "Fall";
  likelyBugs: string;
  recommendedApproach: string;
}

export function getSeasonalIntel(date = new Date()): SeasonalIntel {
  const month = date.getMonth();

  if (month === 11 || month <= 1) {
    return {
      season: "Winter",
      likelyBugs: "Midges, Blue-Winged Olives (low activity windows)",
      recommendedApproach:
        "Fish slow seams and tailouts with small nymphs or midge dries during warmest hours.",
    };
  }

  if (month >= 2 && month <= 4) {
    return {
      season: "Spring",
      likelyBugs: "Skwala, Baetis, early caddis",
      recommendedApproach:
        "Target afternoon windows; mix dry-dropper with short nymph rigs as flows stabilize.",
    };
  }

  if (month >= 5 && month <= 7) {
    return {
      season: "Summer",
      likelyBugs: "PMD, caddis, stoneflies, terrestrials",
      recommendedApproach:
        "Cover pocket water and banks with attractor dries, then switch to nymphs when surface slows.",
    };
  }

  return {
    season: "Fall",
    likelyBugs: "Baetis, mahogany duns, midges",
    recommendedApproach:
      "Fish midday hatches and focus on softer edges with emergers, small dries, and light nymph rigs.",
  };
}
