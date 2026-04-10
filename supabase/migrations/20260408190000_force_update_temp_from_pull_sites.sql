-- One-time force-update of today's river_daily temp values from usgs_pull_sites.
-- The ingest upsert is correct but rows already existed before the station cleanup,
-- and the upsert may not have fired or the values were stale. This ensures today's
-- water_temp_f and temp_source_site_no reflect the latest pull and correct roles.

DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.river_daily rd
  SET
    water_temp_f        = ups.water_temp_f,
    temp_source_site_no = rur.site_no,
    updated_at          = now()
  FROM (
    SELECT DISTINCT ON (river_id)
      river_id,
      usgs_site_no,
      water_temp_f
    FROM public.usgs_pull_sites
    WHERE obs_date      = current_date
      AND water_temp_f IS NOT NULL
    ORDER BY river_id, created_at DESC
  ) ups
  JOIN public.river_usgs_map_roles rur
    ON  rur.river_id  = ups.river_id
    AND rur.site_no   = ups.usgs_site_no
    AND rur.role      = 'temp'
    AND rur.is_active = true
  WHERE rd.river_id = ups.river_id
    AND rd.obs_date = current_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'force-update complete: % rows affected', v_count;
END $$;
