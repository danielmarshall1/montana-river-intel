import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// River slug → snowpack basin name (mirrors STATION_BASIN in snowpack-ingest)
const SLUG_TO_BASIN: Record<string, string> = {
  // ── Montana ─────────────────────────────────────────────────────────────────
  "big-hole-melrose":            "Big Hole",
  "bitterroot-missoula":         "Bitterroot",
  "clark-fork-st-regis":         "Clark Fork",
  "gallatin-gateway":            "Gallatin",
  "madison-west-yellowstone":    "Madison",
  "yellowstone-livingston":      "Yellowstone",
  "yellowstone-corwin-springs":  "Yellowstone",
  "missouri-toston":             "Missouri",
  "flathead-columbia-falls":     "Flathead",
  "nf-flathead-columbia-falls":  "Flathead",
  "kootenai-below-libby-dam":    "Kootenai",
  "kootenai-libby":              "Kootenai",
  "blackfoot-missoula":          "Blackfoot",

  // ── Idaho ────────────────────────────────────────────────────────────────────
  "henrys-fork-ashton":          "Upper Snake",
  "sf-snake-palisades":          "Upper Snake",
  "teton-river-newdale":         "Upper Snake",
  "salmon-river-salmon":         "Salmon",
  "sf-boise-featherville":       "Boise",
  "boise-river-boise":           "Boise",
  "big-wood-hailey":             "Wood River",
  "clearwater-orofino":          "Clearwater",
  // silver-creek-picabo omitted — spring creek, groundwater-fed, snowpack not predictive

  // ── Wyoming ──────────────────────────────────────────────────────────────────
  "green-river-fontenelle":      "Upper Green",
  "wind-river-riverton":         "Wind River",
  "snake-river-jackson":         "Snake Headwaters",
  "gros-ventre-jackson":         "Snake Headwaters",
  "north-platte-grey-reef":      "North Platte",
  "north-platte-miracle-mile":   "North Platte",
  "laramie-river-laramie":       "North Platte",
  "shoshone-river-cody":         "Shoshone",
  "clarks-fork-yellowstone":     "Shoshone",
  "bighorn-river-thermopolis":   "Bighorn",
};

export async function GET(
  _req: Request,
  { params }: { params: { river_id: string } }
) {
  const supabase = createSupabaseServer();
  if (!supabase) return NextResponse.json(null, { status: 503 });

  // Look up the river's slug
  const { data: river } = await supabase
    .from("rivers")
    .select("slug")
    .eq("id", params.river_id)
    .maybeSingle();

  const slug = (river as { slug?: string | null } | null)?.slug ?? null;
  const basin = slug ? (SLUG_TO_BASIN[slug] ?? null) : null;

  if (!basin) return NextResponse.json(null);

  const { data, error } = await supabase
    .from("snowpack_readings")
    .select("basin_name,snowpack_pct_median,reading_date")
    .eq("basin_name", basin)
    .order("reading_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json(null, { status: 500 });

  return NextResponse.json(data ?? null, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
