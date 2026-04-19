-- Fix Beaverhead River missing coordinates
-- USGS gauge 06016000: Beaverhead River at Dillon, MT (45.2227°N, 112.6283°W)
-- Without lat/lng, weather-ingest skips this river entirely

update public.rivers
set latitude  = 45.2227,
    longitude = -112.6283
where slug = 'beaverhead-dillon'
  and latitude is null;
