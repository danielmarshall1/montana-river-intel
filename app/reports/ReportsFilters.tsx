"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface ReportsFiltersProps {
  rivers: string[];
  shops: string[];
  initialFilters: { river?: string; shop?: string; days?: string };
}

export function ReportsFilters({
  rivers,
  shops,
  initialFilters,
}: ReportsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilters(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/reports?${next.toString()}`);
  }

  const daysOptions = [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
  ];

  return (
    <form
      className="flex flex-wrap gap-4 items-end"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">
          River
        </span>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          value={initialFilters.river ?? ""}
          onChange={(e) => updateFilters({ river: e.target.value || undefined })}
        >
          <option value="">All rivers</option>
          {rivers.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">
          Shop
        </span>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          value={initialFilters.shop ?? ""}
          onChange={(e) => updateFilters({ shop: e.target.value || undefined })}
        >
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase">
          Date range
        </span>
        <select
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          value={initialFilters.days ?? "30"}
          onChange={(e) => updateFilters({ days: e.target.value })}
        >
          {daysOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
