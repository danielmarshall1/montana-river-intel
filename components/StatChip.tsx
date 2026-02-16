interface StatChipProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}

export function StatChip({ label, value, unit }: StatChipProps) {
  const display = value != null && value !== "" ? `${value}${unit ?? ""}` : "—";
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{display}</span>
    </div>
  );
}
