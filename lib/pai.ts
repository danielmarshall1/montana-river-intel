import { createSupabaseClient } from "./supabase";

export interface PAIReport {
  id: string;
  shop_name: string;
  source_url: string;
  title: string;
  published_at: string | null;
  excerpt: string | null;
  rivers: string[] | null;
  flies: string[] | null;
  summary: string | null;
  created_at: string;
}

export interface PAIReportsFilters {
  river?: string;
  shop?: string;
  from?: string;
  to?: string;
  days?: number; // 7, 30, 90
}

function defaultDateRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function fetchPAIReports(
  filters?: PAIReportsFilters,
  limit = 200
): Promise<PAIReport[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];
  const range = defaultDateRange(filters?.days ?? 30);
  const from = filters?.from ?? range.from;
  const to = filters?.to ?? range.to;

  let q = supabase
    .from("pai_reports")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (filters?.river) {
    q = q.contains("rivers", [filters.river]);
  }
  if (filters?.shop) {
    q = q.eq("shop_name", filters.shop);
  }
  q = q.gte("published_at", from + "T00:00:00Z");
  q = q.lte("published_at", to + "T23:59:59Z");
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as PAIReport[];
}

/** Normalize app river name (e.g. "Madison River") to PAI dictionary form ("Madison"). */
function toPAIRiverKey(riverName: string): string {
  return riverName.replace(/ River$/i, "") || riverName;
}

export async function fetchPAIReportsByRiver(
  riverName: string,
  limit = 3
): Promise<PAIReport[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];
  const key = toPAIRiverKey(riverName);
  const { data, error } = await supabase
    .from("pai_reports")
    .select("*")
    .contains("rivers", [key])
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as PAIReport[];
}

export async function fetchPAIShopNames(): Promise<string[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pai_reports")
    .select("shop_name")
    .order("shop_name");
  if (error) return [];
  const names = Array.from(
    new Set((data ?? []).map((r: { shop_name: string }) => r.shop_name))
  );
  return names.sort();
}

/** Unique rivers from pai_reports (flatten rivers arrays). */
export async function fetchPAIRivers(): Promise<string[]> {
  const supabase = createSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pai_reports")
    .select("rivers");
  if (error) return [];
  const set = new Set<string>();
  for (const row of data ?? []) {
    const arr = (row as { rivers: string[] | null }).rivers;
    if (Array.isArray(arr)) {
      arr.forEach((r) => set.add(r));
    }
  }
  return Array.from(set).sort();
}
