"use client";

type Props = {
  dateLabel: string;
  riverCount: number;
  search: string;
  setSearch: (v: string) => void;
  tierFilter: string;
  setTierFilter: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
};

export default function PageHeader({
  dateLabel,
  riverCount,
  search,
  setSearch,
  tierFilter,
  setTierFilter,
  sort,
  setSort,
}: Props) {
  return (
    <div className="mb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Montana River Intel
          </h1>
          <div className="text-sm text-slate-500">
            {dateLabel} • {riverCount} rivers
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rivers..."
            className="h-10 w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500"
          />

          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option>All</option>
            <option>Good</option>
            <option>Fair</option>
            <option>Tough</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
          >
            <option value="best">Sort: Best</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Legend:</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          Good
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
          Fair
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
          Tough
        </span>
      </div>
    </div>
  );
}
