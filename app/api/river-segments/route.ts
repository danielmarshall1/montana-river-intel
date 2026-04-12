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
  lat: number | null;
  lng: number | null;
  flow_p50: number | null;
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

  // Today's day-of-year (1-based) for historical percentile lookup
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);

  // Fetch USGS IV readings, station coordinates, and historical p50 concurrently
  const siteNos = segments.map((s) => s.site_no);
  const [liveData, coordsRes, percentilesRes] = await Promise.all([
    Promise.all(segments.map((s) => fetchUsgsIv(s.site_no))),
    supabase.from("usgs_sites").select("site_no, lat, lon").in("site_no", siteNos),
    supabase
      .from("river_historical_percentiles")
      .select("flow_p50")
      .eq("river_id", river_id)
      .eq("day_of_year", dayOfYear)
      .limit(1)
      .maybeSingle(),
  ]);

  const coordMap = new Map<string, { lat: number | null; lng: number | null }>();
  for (const row of coordsRes.data ?? []) {
    const r = row as { site_no: string; lat: number | null; lon: number | null };
    coordMap.set(r.site_no, { lat: r.lat, lng: r.lon });
  }

  const flow_p50 = (percentilesRes.data as { flow_p50: number | null } | null)?.flow_p50 ?? null;

  const result: RiverSegmentPoint[] = segments.map((s, i) => ({
    site_no: s.site_no,
    display_name: s.display_name,
    sequence_order: s.sequence_order,
    is_primary: s.is_primary,
    flow_cfs: liveData[i].flow_cfs,
    water_temp_f: liveData[i].water_temp_f,
    observed_at: liveData[i].observed_at,
    lat: coordMap.get(s.site_no)?.lat ?? null,
    lng: coordMap.get(s.site_no)?.lng ?? null,
    flow_p50,
  }));

  return NextResponse.json(result, {
    status: 200,
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
  });
}
