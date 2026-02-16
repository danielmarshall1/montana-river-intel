"use client";

type Props = {
  river: string;
  subtitle?: string;
  tier: "Good" | "Fair" | "Tough";
  score?: number | null;
  flowCfs?: number | null;
  ratio?: number | null;
  tempF?: number | null;
  windAm?: number | null;
  windPm?: number | null;
  onClick?: () => void;
};

function tierStyles(tier: Props["tier"]) {
  if (tier === "Good") return "bg-green-100 text-green-800 border-green-200";
  if (tier === "Fair") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
}

export default function RiverCard({
  river,
  subtitle,
  tier,
  score,
  flowCfs,
  ratio,
  tempF,
  windAm,
  windPm,
  onClick,
}: Props) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold leading-tight text-gray-900">
              {river}
            </div>
            {subtitle ? (
              <div className="text-sm text-slate-500">{subtitle}</div>
            ) : null}
          </div>

          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${tierStyles(tier)}`}
          >
            {tier}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-gray-50 p-2">
            <div className="text-xs text-slate-500">Fishability</div>
            <div className="font-semibold text-gray-900">{score ?? "—"}</div>
          </div>

          <div className="rounded-lg bg-gray-50 p-2">
            <div className="text-xs text-slate-500">Flow (cfs)</div>
            <div className="font-semibold text-gray-900">{flowCfs ?? "—"}</div>
          </div>

          <div className="rounded-lg bg-gray-50 p-2">
            <div className="text-xs text-slate-500">Flow ratio</div>
            <div className="font-semibold text-gray-900">
              {ratio != null ? `${ratio.toFixed(2)}x` : "—"}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-2">
            <div className="text-xs text-slate-500">Temp</div>
            <div className="font-semibold text-gray-900">
              {tempF != null ? `${tempF.toFixed(1)}°F` : "—"}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Wind AM {windAm != null ? `${windAm.toFixed(1)} mph` : "—"} • Wind PM{" "}
          {windPm != null ? `${windPm.toFixed(1)} mph` : "—"}
        </div>
      </div>
    </div>
  );
}
