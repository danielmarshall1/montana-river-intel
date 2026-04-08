-- Spatially assign fishing access points to the nearest river within 500m.
-- Confidence tiers: high < 100m, moderate < 300m, low < 500m.

UPDATE public.fishing_access_sites fas
SET
  river_id = nearest.id,
  river_confidence = CASE
    WHEN nearest.dist_m < 100 THEN 'high'
    WHEN nearest.dist_m < 300 THEN 'moderate'
    ELSE 'low'
  END
FROM (
  SELECT DISTINCT ON (fas2.id)
    fas2.id  AS access_id,
    r.id,
    ST_Distance(fas2.geom::geography, rg.geom::geography) AS dist_m
  FROM public.fishing_access_sites fas2
  JOIN public.river_geometries rg ON true
  JOIN public.rivers r ON rg.river_id = r.id
  WHERE ST_DWithin(fas2.geom::geography, rg.geom::geography, 500)
  ORDER BY fas2.id, dist_m ASC
) nearest
WHERE fas.id = nearest.access_id;
