import type { BiteTier } from "@/lib/types";

const TIER_STYLES: Record<
  BiteTier,
  { bg: string; text: string; border: string }
> = {
  HOT: { bg: "bg-red-800", text: "text-white", border: "border-red-700" },
  GOOD: { bg: "bg-green-700", text: "text-white", border: "border-green-600" },
  FAIR: {
    bg: "bg-amber-500",
    text: "text-white",
    border: "border-amber-600",
  },
  TOUGH: {
    bg: "bg-slate-500",
    text: "text-white",
    border: "border-slate-600",
  },
};

interface TierPillProps {
  tier: BiteTier | null;
}

export function TierPill({ tier }: TierPillProps) {
  if (!tier) return null;
  const style = TIER_STYLES[tier] ?? TIER_STYLES.TOUGH;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}
    >
      {tier}
    </span>
  );
}
