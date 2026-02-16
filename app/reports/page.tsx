import { Suspense } from "react";
import { Header } from "@/components/Header";
import {
  fetchPAIReports,
  fetchPAIShopNames,
  fetchPAIRivers,
  type PAIReport,
  type PAIReportsFilters,
} from "@/lib/pai";
import { ReportsFilters } from "./ReportsFilters";
import { ReportCard } from "./ReportCard";

export const revalidate = 300;

interface PageProps {
  searchParams: Promise<{
    river?: string;
    shop?: string;
    days?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const days = params.days ? parseInt(params.days, 10) : 30;
  const validDays = [7, 30, 90].includes(days) ? days : 30;
  const filters: PAIReportsFilters = {
    river: params.river || undefined,
    shop: params.shop || undefined,
    days: validDays,
  };
  const [reports, shopNames, riverNames] = await Promise.all([
    fetchPAIReports(filters),
    fetchPAIShopNames(),
    fetchPAIRivers(),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              PAI Reports
            </h1>
            <p className="text-slate-500 mt-1">
              Publicly available fly shop fishing reports and newsletters.
            </p>
          </div>

          <Suspense fallback={null}>
            <ReportsFilters
              rivers={riverNames}
              shops={shopNames}
              initialFilters={{ river: params.river, shop: params.shop, days: String(validDays) }}
            />
          </Suspense>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reports.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                <p className="text-slate-600 font-medium">No reports yet</p>
                <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
                  Add sources to <code className="text-xs bg-slate-200 px-1 rounded">pai_sources</code> and run{" "}
                  <code className="text-xs bg-slate-200 px-1 rounded">POST /api/ingest/pai</code> to populate reports.
                </p>
              </div>
            ) : (
              reports.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))
            )}
          </div>

          <footer className="pt-8 mt-8 border-t border-slate-200 text-sm text-slate-500">
            All content sourced from publicly available reports.
          </footer>
        </div>
      </main>
    </div>
  );
}
