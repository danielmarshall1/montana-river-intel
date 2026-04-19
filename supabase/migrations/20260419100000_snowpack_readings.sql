-- Snowpack readings from NRCS SNOTEL data
-- Stores basin-level snowpack as % of 1981–2010 median
-- Populated weekly by the snowpack-ingest edge function

CREATE TABLE IF NOT EXISTS snowpack_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basin_name text NOT NULL,
  river_id uuid REFERENCES rivers(id),
  snowpack_pct_median numeric,
  reading_date date NOT NULL,
  station_count integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE (basin_name, reading_date)
);

CREATE INDEX IF NOT EXISTS idx_snowpack_readings_river_date
  ON snowpack_readings (river_id, reading_date DESC);

CREATE INDEX IF NOT EXISTS idx_snowpack_readings_basin_date
  ON snowpack_readings (basin_name, reading_date DESC);

-- RLS: read-only for anon, full access for service role
ALTER TABLE snowpack_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snowpack_readings_select" ON snowpack_readings
  FOR SELECT USING (true);
