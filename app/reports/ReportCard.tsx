import type { PAIReport } from "@/lib/pai";

interface ReportCardProps {
  report: PAIReport;
}

export function ReportCard({ report }: ReportCardProps) {
  const date = report.published_at
    ? new Date(report.published_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col gap-2 h-full">
        <span className="text-xs font-medium text-slate-500 uppercase">
          {report.shop_name}
        </span>
        <h2 className="font-semibold text-slate-900 line-clamp-2">
          {report.title}
        </h2>
        {date && (
          <time dateTime={report.published_at!} className="text-sm text-slate-500">
            {date}
          </time>
        )}
        {report.rivers && report.rivers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {report.rivers.map((r) => (
              <span
                key={r}
                className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                {r}
              </span>
            ))}
          </div>
        )}
        {report.flies && report.flies.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {report.flies.slice(0, 8).map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
              >
                {f}
              </span>
            ))}
            {report.flies.length > 8 && (
              <span className="text-xs text-slate-400">
                +{report.flies.length - 8} more
              </span>
            )}
          </div>
        )}
        {(report.summary || report.excerpt) && (
          <p className="text-sm text-slate-600 line-clamp-3 flex-1">
            {report.summary ?? report.excerpt}
          </p>
        )}
        <a
          href={report.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
        >
          View full report →
        </a>
      </div>
    </article>
  );
}
