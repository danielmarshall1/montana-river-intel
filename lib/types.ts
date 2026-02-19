export type BiteTier = "HOT" | "GOOD" | "FAIR" | "TOUGH";

export interface FishabilityRow {
  river_id: string;
  slug?: string;
  river_name: string;
  /** Optional map coords from DB (lon, lat) - used when RIVER_FOCUS_POINTS has no entry */
  lat?: number | null;
  lng?: number | null;
  gauge_label: string;
  usgs_site_no: string;
  date: string;
  flow_cfs: number | null;
  median_flow_cfs: number | null;
  flow_ratio_calc: number | null;
  change_48h_pct_calc: number | null;
  water_temp_f: number | null;
  wind_am_mph: number | null;
  wind_pm_mph: number | null;
  precip_mm?: number | null;
  precip_probability_pct?: number | null;
  fishability_score_calc: number | null;
  fishability_rank?: number | null;
  fishability_percentile?: number | null;
  bite_tier: BiteTier | null;
  source_flow_observed_at?: string | null;
  source_temp_observed_at?: string | null;
  updated_at?: string | null;
  is_stale?: boolean | null;
  stale_reason?: string | null;
  last_usgs_pull_at?: string | null;
  last_weather_pull_at?: string | null;
  last_river_daily_date?: string | null;
}

export interface RiverGeom {
  river_id: string;
  geom: GeoJSON.Geometry;
}
