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
  gage_height_ft?: number | null;
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
  flow_source_site_no?: string | null;
  temp_status?: "available_fresh" | "available_stale" | "unavailable_at_gauge" | null;
  temp_stale?: boolean | null;
  temp_age_minutes?: number | null;
  temp_source_site_no?: string | null;
  temp_source_kind?: "IV" | "DV" | "NONE" | null;
  temp_observed_at?: string | null;
  confidence_level?: "High" | "Moderate" | "Low" | null;
  temp_unavailable?: boolean | null;
  temp_reason?: string | null;
  updated_at?: string | null;
  is_stale?: boolean | null;
  stale_reason?: string | null;
  last_usgs_pull_at?: string | null;
  last_weather_pull_at?: string | null;
  last_river_daily_date?: string | null;
  wading_threshold_cfs?: number | null;
  drift_optimal_min_cfs?: number | null;
  drift_optimal_max_cfs?: number | null;
  is_tailwater?: boolean | null;
  cloud_cover_pct?: number | null;
}

export interface RiverGeom {
  river_id: string;
  geom: GeoJSON.Geometry;
}

export interface RiverWeatherDay {
  date: string;
  wind_am_mph: number | null;
  wind_pm_mph: number | null;
  wind_speed_max_mph: number | null;
  air_temp_f?: number | null;
  wind_direction_deg?: number | null;
  gust_mph?: number | null;
  cloud_cover_pct?: number | null;
  air_temp_high_f: number | null;
  air_temp_low_f: number | null;
  precip_mm: number | null;
  precip_probability_pct: number | null;
  observed_at?: string | null;
  created_at?: string | null;
}

export interface RiverSourceSiteSummary {
  site_no: string;
  station_name: string | null;
}

export interface RiverDetailAnalyticsBackendRow {
  river_id: string;
  slug?: string | null;
  river_name?: string | null;
  gauge_label?: string | null;
  date?: string | null;
  current_flow_cfs: number | null;
  current_temp_f: number | null;
  current_stage_ft: number | null;
  median_flow_cfs: number | null;
  flow_ratio: number | null;
  flow_48h_ago: number | null;
  temp_24h_ago: number | null;
  change_48h_pct: number | null;
  temp_change_24h_f: number | null;
  stability_index_raw: number | null;
  stability_label: string | null;
  flow_trend_label?: string | null;
  flow_percentile: number | null;
  flow_percentile_status: string | null;
  flow_p10?: number | null;
  flow_p25?: number | null;
  flow_p50?: number | null;
  flow_p75?: number | null;
  flow_p90?: number | null;
  historical_sample_size?: number | null;
  temp_source_kind: string | null;
  temp_observed_at: string | null;
  confidence_level: "High" | "Moderate" | "Low" | null;
  flow_source_site_no: string | null;
  flow_source_site_name: string | null;
  temp_source_site_no: string | null;
  temp_source_site_name: string | null;
  observation_timestamp: string | null;
  last_hydrology_pull_at: string | null;
  air_temp_f: number | null;
  wind_speed_mph: number | null;
  wind_direction_deg?: number | null;
  wind_direction: string | null;
  gust_mph: number | null;
  precip_chance_pct: number | null;
  cloud_cover_pct: number | null;
  daily_high_f: number | null;
  daily_low_f: number | null;
  weather_observed_at: string | null;
  thermal_trend_label?: string | null;
  temp_direction_3d?: string | null;
  forecast_day1_air_temp_f: number | null;
  forecast_day1_wind_mph: number | null;
  forecast_day1_precip_chance_pct: number | null;
  forecast_day2_air_temp_f: number | null;
  forecast_day2_wind_mph: number | null;
  forecast_day2_precip_chance_pct: number | null;
  forecast_day3_air_temp_f: number | null;
  forecast_day3_wind_mph: number | null;
  forecast_day3_precip_chance_pct: number | null;
  wind_outlook?: string | null;
  flow_outlook?: string | null;
  fishing_outlook?: string | null;
}

export interface RiverDetailAnalytics {
  hydrology: {
    currentFlowCfs: number | null;
    medianFlowCfs: number | null;
    flowRatio: number | null;
    change48hPct: number | null;
    flowPercentile: number | null;
    flowPercentileStatus: string | null;
    stabilityIndexRaw: number | null;
    stabilityLabel: string | null;
    gaugeHeightFt: number | null;
  };
  thermal: {
    currentWaterTempF: number | null;
    tempSourceKind: string | null;
    tempObservedAt: string | null;
    tempConfidence: string | null;
    thermalTrendLabel: string | null;
    thermalTrendDelta24hF: number | null;
    thermalStatus: string | null;
    direction3Day: string | null;
  };
  weather: {
    airTempF: number | null;
    windSpeedMph: number | null;
    windDirection: string | null;
    gustMph: number | null;
    precipChancePct: number | null;
    cloudCoverPct: number | null;
    highTempF: number | null;
    lowTempF: number | null;
    windImpact: string | null;
    dryFlyWindImpact: string | null;
  };
  forecast: {
    day1: {
      label: string;
      airTempF: number | null;
      windMph: number | null;
      precipChancePct: number | null;
      available: boolean;
    };
    day2: {
      label: string;
      airTempF: number | null;
      windMph: number | null;
      precipChancePct: number | null;
      available: boolean;
    };
    day3: {
      label: string;
      airTempF: number | null;
      windMph: number | null;
      precipChancePct: number | null;
      available: boolean;
    };
    windOutlook: string | null;
    fishingOutlook: string | null;
    flowOutlook: string | null;
  };
  biology: {
    hatchLikelihood: string | null;
    dryFlyViability: string | null;
    tacticalRead: string | null;
  };
  sourceTrust: {
    flowSourceSiteNo: string | null;
    flowSourceSiteName: string | null;
    tempSourceSiteNo: string | null;
    tempSourceSiteName: string | null;
    tempSourceKind: string | null;
    observationTimestamp: string | null;
    lastHydrologyPullAt: string | null;
    overallConfidence: string | null;
    missingInputs: string[];
  };
}
