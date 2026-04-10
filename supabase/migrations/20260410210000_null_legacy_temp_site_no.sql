-- Null out all temp_site_no values in the legacy river_usgs_map table.
-- river_usgs_map_roles is now the sole authoritative source for temp station assignments.
-- Leaving temp_site_no set here causes ghost station injections in the ingest pipeline
-- whenever a role-assigned station has no data and the ingest falls through to this fallback.

UPDATE public.river_usgs_map
SET temp_site_no = NULL
WHERE temp_site_no IS NOT NULL;
