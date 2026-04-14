import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 3600; // 1 hour

export type FlyShopReportResponse = {
  id: string;
  shop_name: string;
  report_url: string;
  scraped_at: string;
  report_date: string | null;
  overall_conditions: "excellent" | "good" | "fair" | "poor" | "unfishable" | null;
  water_clarity: "clear" | "slightly_off" | "off_color" | "blown" | null;
  primary_hatch: string | null;
  salmonfly_status:
    | "not_started"
    | "pre_hatch"
    | "starting"
    | "peak"
    | "trailing"
    | "done"
    | "not_applicable"
    | null;
  salmonfly_section: string | null;
  recommended_flies: string[];
  tactical_notes: string | null;
  confidence_score: number | null;
};

export async function GET(req: NextRequest) {
  const river_id = req.nextUrl.searchParams.get("river_id");
  if (!river_id) {
    return NextResponse.json({ error: "river_id required" }, { status: 400 });
  }

  const sb = createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Most recent report within last 10 days
  const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("fly_shop_reports")
    .select(
      `id, scraped_at, report_date,
       overall_conditions, water_clarity, primary_hatch,
       salmonfly_status, salmonfly_section, recommended_flies,
       tactical_notes, confidence_score,
       fly_shop_sources!inner(shop_name, report_url)`
    )
    .eq("river_id", river_id)
    .gte("scraped_at", cutoff)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(null);
  }

  const source = data.fly_shop_sources as unknown as { shop_name: string; report_url: string };

  const result: FlyShopReportResponse = {
    id: data.id,
    shop_name: source.shop_name,
    report_url: source.report_url,
    scraped_at: data.scraped_at,
    report_date: data.report_date,
    overall_conditions: data.overall_conditions,
    water_clarity: data.water_clarity,
    primary_hatch: data.primary_hatch,
    salmonfly_status: data.salmonfly_status,
    salmonfly_section: data.salmonfly_section,
    recommended_flies: data.recommended_flies ?? [],
    tactical_notes: data.tactical_notes,
    confidence_score: data.confidence_score,
  };

  return NextResponse.json(result);
}
