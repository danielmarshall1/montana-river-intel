import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const revalidate = 1800; // 30 minutes

const MAX_POINTS = 8;

type AccessSiteRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type AccessWeatherPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  temp_f: number | null;
  wind_mph: number | null;
  wind_dir_deg: number | null;
  wind_direction: string | null;
  gust_mph: number | null;
  precip_chance_pct: number | null;
};

function degToCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

async function fetchPointWeather(lat: number, lng: number): Promise<Omit<AccessWeatherPoint, "id" | "name" | "lat" | "lng">> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability` +
    `&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=America%2FDenver`;

  try {
    const resp = await fetch(url, { next: { revalidate: 1800 } });
    if (!resp.ok) return { temp_f: null, wind_mph: null, wind_dir_deg: null, wind_direction: null, gust_mph: null, precip_chance_pct: null };
    const data = await resp.json();
    const c = data?.current ?? {};
    const windDeg: number | null = c.wind_direction_10m ?? null;
    return {
      temp_f: c.temperature_2m ?? null,
      wind_mph: c.wind_speed_10m ?? null,
      wind_dir_deg: windDeg,
      wind_direction: windDeg != null ? degToCompass(windDeg) : null,
      gust_mph: c.wind_gusts_10m ?? null,
      precip_chance_pct: c.precipitation_probability ?? null,
    };
  } catch {
    return { temp_f: null, wind_mph: null, wind_dir_deg: null, wind_direction: null, gust_mph: null, precip_chance_pct: null };
  }
}

export async function GET(req: NextRequest) {
  const river_id = req.nextUrl.searchParams.get("river_id");
  if (!river_id) {
    return NextResponse.json({ error: "river_id required" }, { status: 400 });
  }

  const sb = createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { data, error } = await sb
    .from("fishing_access_sites")
    .select("id,name,lat,lng")
    .eq("river_id", river_id)
    .in("river_confidence", ["high", "moderate"])
    .order("name")
    .limit(MAX_POINTS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sites = (data ?? []) as AccessSiteRow[];

  // Fetch weather for all points in parallel
  const results: AccessWeatherPoint[] = await Promise.all(
    sites.map(async (site) => {
      const wx = await fetchPointWeather(site.lat, site.lng);
      return { id: site.id, name: site.name, lat: site.lat, lng: site.lng, ...wx };
    })
  );

  return NextResponse.json(results);
}
