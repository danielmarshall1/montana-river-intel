# RiffleMap River Onboarding Standard

## Overview
Every river added to RiffleMap must pass all Phase 1-6 
checks before going live. This standard was developed 
from the Montana build and validated against Idaho and 
Wyoming additions.

## Phase 1 — Database Entry
- [ ] River inserted into rivers table with:
  - river_name (full official name)
  - slug (state-river-gaugelocation format)
  - state (2-letter code)
  - gauge_label (human readable gauge location)
  - is_tailwater (boolean — affects scoring model)
  - is_active = true
  - elevation_offset_weeks (set based on elevation):
    - < 4,000ft → 0
    - 4,000-5,500ft → 1
    - 5,500-6,500ft → 2
    - > 6,500ft → 3
  - latitude and longitude (from primary USGS gauge)

## Phase 2 — USGS Station Assignment
Critical: wrong or stale gauges silently corrupt scores.

- [ ] Flow gauge verified:
  1. Fetch: waterservices.usgs.gov/nwis/iv/?sites=[site_no]&parameterCd=00060
  2. Confirm response timestamp < 2 hours old
  3. Confirm station_name contains the river name
  4. Insert into river_usgs_map_roles with role='flow'

- [ ] Temp gauge verified:
  1. Test flow gauge site_no for temp: 
     waterservices.usgs.gov/nwis/iv/?sites=[site_no]&parameterCd=00010
  2. If no temp on flow gauge, search nearby:
     waterservices.usgs.gov/nwis/iv/?stateCd=[state]&parameterCd=00010&siteType=ST
  3. Find nearest active gauge to river lat/lon
  4. Confirm timestamp < 48 hours old
  5. Insert into river_usgs_map_roles with role='temp'
  6. If no active temp gauge exists anywhere in 
     drainage — document as USGS_NO_TEMP and move on.
     Do NOT assign a temp gauge from a different river.

- [ ] Seed usgs_sites catalog entry:
  Fetch station metadata and insert into usgs_sites:
  waterservices.usgs.gov/nwis/site/?sites=[site_no]&format=rdb&siteOutput=expanded

## Phase 3 — NHD Geometry
- [ ] Fetch NHD flowline geometry from:
  hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer
- [ ] Use bbox-POST approach (not name-only search)
  Bbox should cover the entire fishable river section
- [ ] Verify point count > 1,500 (aim for > 3,000)
- [ ] Visually inspect on map — confirm geometry follows
  actual river path not agricultural canals or wrong 
  tributaries
- [ ] For rivers named "Snake River" or other common names:
  Use tight bbox to isolate correct section

## Phase 4 — Score Validation
After first ingest run:
- [ ] flow_cfs is not null
- [ ] fishability_score is not null
- [ ] Score range sanity check for current month:
  - Jan-Mar: expect 25-55
  - Apr-Jun (runoff): expect 25-55
  - Jul-Sep: expect 45-80
  - Oct-Dec: expect 35-65
- [ ] If score > 85 in Apr-Jun: check runoff penalty
- [ ] If score < 20 any time: check flow gauge is live
- [ ] Tailwater rivers should score 5-15 points higher 
  than nearby freestone rivers in runoff season

## Phase 5 — Content Requirements
- [ ] Tactics content written and inserted:
  - about (2-3 sentences)
  - character (river type, species, difficulty)
  - best_sections (2-4 named sections with descriptions)
  - best_months (6-8 months with notes)
  - techniques (paragraph)
  - regulations_notes (paragraph)
- [ ] Regulations entered for any river with:
  - Catch and release only sections
  - Fly fishing only sections  
  - Seasonal closures
  - Special gear restrictions
  - Tribal permit requirements
- [ ] Snowpack basin mapped in snowpack-ingest function
- [ ] Fishing access points: minimum 3 per river
  Source priority:
  1. State FWP/Game agency GIS data (official GPS coords)
  2. ArcGIS REST API from state agency
  3. Manual entry from agency brochures
- [ ] Fly shop scraper: attempt to configure at least 
  one shop per river. Document as SCRAPER_UNAVAILABLE 
  if no public report page exists.

## Phase 6 — Final Verification Query
Run this query and confirm all checks pass:

```sql
SELECT 
  r.river_name, r.state,
  rd.flow_cfs,
  rd.water_temp_f,
  rd.fishability_score,
  EXTRACT(EPOCH FROM (now() - rd.updated_at))/3600 
    as hours_since_update,
  (SELECT SUM(ST_NPoints(rs.geometry)) 
   FROM river_segments rs WHERE rs.river_id = r.id) 
    as geometry_points,
  (SELECT COUNT(*) FROM fishing_access_sites fas 
   WHERE fas.river_id = r.id) as access_count,
  (SELECT COUNT(*) FROM river_tactics rt 
   WHERE rt.river_id = r.id) as has_tactics,
  CASE WHEN rd.flow_cfs IS NULL THEN 'FAIL: no flow'
       WHEN rd.fishability_score IS NULL THEN 'FAIL: no score'
       WHEN r.latitude IS NULL THEN 'FAIL: no coords'
       WHEN (SELECT SUM(ST_NPoints(rs.geometry)) 
             FROM river_segments rs 
             WHERE rs.river_id = r.id) < 1500 
         THEN 'WARN: low geometry'
       WHEN (SELECT COUNT(*) FROM fishing_access_sites fas 
             WHERE fas.river_id = r.id) < 3 
         THEN 'WARN: few access points'
       WHEN (SELECT COUNT(*) FROM river_tactics rt 
             WHERE rt.river_id = r.id) = 0 
         THEN 'FAIL: no tactics'
       WHEN EXTRACT(EPOCH FROM (now() - rd.updated_at))
            /3600 > 6 
         THEN 'WARN: stale data'
       ELSE 'PASS' END as status
FROM rivers r
LEFT JOIN river_daily rd ON rd.river_id = r.id 
  AND rd.obs_date = current_date
WHERE r.state = '[STATE]'
AND r.is_active = true
ORDER BY status, r.river_name;
```

All FAIL items must be resolved before going live.
WARN items should be documented and resolved within 
30 days of launch.

## Common Failure Patterns (learned from MT/ID/WY)

**Wrong temp gauge assigned**
Symptom: Multiple rivers showing identical temperature
Fix: Query station_name — must contain river name

**Stale temp reading**
Symptom: water_temp_f age > 48 hours
Fix: Check if gauge transmits parameterCd=00010 in IV
Many gauges are registered for temp but don't transmit

**Wrong NHD geometry**
Symptom: River line appears in wrong location on map
Common cause: River shares name with larger drainage
Fix: Use tight bbox, visually verify on map

**Scores stuck at 40**
Symptom: All rivers score exactly 40 regardless of conditions
Fix: Check compute_river_daily_scores ran after ingest
Check ON CONFLICT DO UPDATE SET includes updated_at

**Score too high in runoff season**
Symptom: Freestone river scores 70+ in May
Fix: Verify is_tailwater = false, check seasonal multiplier

## State-by-State Notes

### Montana (17 rivers — baseline)
- FWP access GIS: available via ArcGIS REST
- Fly shops: 12 active scrapers (Grizzly Hackle, 
  Sunrise, River's Edge, Yellowstone Angler, Montana Trout)
- Snowpack: 10 NRCS basins mapped
- Temp coverage: 15/17

### Idaho (9 rivers)
- IDFG access GIS: data-idfggis.opendata.arcgis.com
  (requires direct IDFG contact for bulk download)
- Fly shops: Henry's Fork Anglers active (Shopify blog)
  Silver Creek Outfitters: geo-blocked from Deno edge
  Jack Dennis: no public report page
- Snowpack: 5 NRCS basins mapped
- Temp coverage: 7/9
- No temp possible: Henry's Fork, Teton River

### Wyoming (10 rivers)
- WGFD access GIS: wyoming-wgfd.opendata.arcgis.com
  (99 access points loaded via ArcGIS REST)
- Fly shops: Grey Reef Anglers active
  North Platte Lodge active
  Jack Dennis: no public report page
- Snowpack: 6 NRCS basins mapped
- Temp coverage: 5/10
- No temp possible: Bighorn WY, Clarks Fork YS, 
  Laramie, North Platte x2

## Scalability Notes
- USGS ingest: works nationally, zero changes per state
- Weather: Open-Meteo global, zero changes per state
- Scoring model: works anywhere with flow + temp data
- NHD geometry: national dataset, same fetch process
- State agency GIS varies — check opendata.arcgis.com
  for [state].[agency].opendata.arcgis.com pattern
- Fly shop scrapers: 2-3 hours research per state
  Look for Shopify blogs and WordPress fishing reports
- NRCS snowpack: national, add basin keyword mappings

## Time Estimates Per State
- Research (rivers, gauges, shops): 1-2 days
- Database entry + gauge verification: 1 day
- NHD geometry fetch: 2-4 hours
- Tactics content writing: 3-5 days
- Access points from state GIS: 2-4 hours
- Fly shop scrapers: 1-2 days
- Audit + fixes: 2-4 hours
- Total: 8-14 days per state
