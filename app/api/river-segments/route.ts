import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 1800; // 30 minutes

type SegmentRow = {
  id: string;
  site_no: string;
  display_name: string;
  sequence_order: number;
  is_primary: boolean;
};

export interface RiverSegmentPoint {
  site_no: string;
  display_name: string;
  sequence_order: number;
  is_primary: boolean;
  flow_cfs: number | null;
  water_temp_f: number | null;
  observed_at: string | null;
}

async function fetchUsgsIv(siteNo: string): Promise<{ flow_cfs: number | null; water_temp_f: number | null; observed_at: string | null }> {
  try {
    const url = `https://waterservices.usgs.gov/nwis/iv/?sites=${siteNo}&parameterCd=00060,00010&format=json&siteStatus=active`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return { flow_cfs: null, water_temp_f: null, observed_at: null };
    const data = await res.json();
    const series: unknown[] = data?.value?.timeSeries ?? [];

    let flow_cfs: number | null = null;
    let water_temp_f: number | null = null;
    let observed_at: string | null = null;

    for (const ts of series) {
      const t = ts as { variable: { variableCode: { value: string }[] }; values: { value: { value: string; dateTime: string }[] }[] };
      const code = t.variable?.variableCode?.[0]?.value;
      const latest = t.values?.[0]?.value?.at(-1);
      if (!latest || latest.value === "-999999" || latest.value === "") continue;
      const num = parseFloat(latest.value);
      if (Number.isNaN(num)) continue;
      if (code === "00060") {
        flow_cfs = Math.round(num * 10) / 10;
        observed_at = latest.dateTime;
      } else if (code === "00010") {
        // Convert °C to °F
        water_temp_f = Math.round(((num * 9) / 5 + 32) * 10) / 10;
        if (!observed_at) observed_at = latest.dateTime;
      }
    }

    return { flow_cfs, water_temp_f, observed_at };
  } catch {
    return { flow_cfs: null, water_temp_f: null, observed_at: null };
  }
}

export async function GET(req: NextRequest) {
  const river_id = req.nextUrl.searchParams.get("river_id");
  if (!river_id) {
    return NextResponse.json({ error: "river_id required" }, { status: 400 });
  }

  const supabase = createSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("river_segments")
    .select("id, site_no, display_name, sequence_order, is_primary")
    .eq("river_id", river_id)
    .order("sequence_order", { ascending: true });

  if (error || !data || data.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  const segments = data as SegmentRow[];

  // Fetch all USGS IV readings concurrently
  const liveData = await Promise.all(segments.map((s) => fetchUsgsIv(s.site_no)));

  const result: RiverSegmentPoint[] = segments.map((s, i) => ({
    site_no: s.site_no,
    display_name: s.display_name,
    sequence_order: s.sequence_order,
    is_primary: s.is_primary,
    flow_cfs: liveData[i].flow_cfs,
    water_temp_f: liveData[i].water_temp_f,
    observed_at: liveData[i].observed_at,
  }));

  return NextResponse.json(result, {
    status: 200,
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
  });
}
