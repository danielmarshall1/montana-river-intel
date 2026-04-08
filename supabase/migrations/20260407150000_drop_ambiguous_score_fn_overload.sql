-- Drop the single-parameter overload of compute_river_daily_scores that causes
-- "could not choose best candidate" errors when called with only p_obs_date.
-- The two-parameter version (p_obs_date, p_river_id DEFAULT NULL) is a superset and handles all call sites.
drop function if exists public.compute_river_daily_scores(date);
