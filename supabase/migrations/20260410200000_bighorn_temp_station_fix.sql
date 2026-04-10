-- Fix Bighorn River temp station assignment.
-- 06287000 and 06288400 have no live IV temperature data.
-- 06287800 (Bighorn at St. Xavier) measures flow, stage, AND temperature — use it for all three.

-- Step 1: deactivate dead temp roles
UPDATE public.river_usgs_map_roles
SET is_active = false
WHERE river_id = '9b27ccec-f0ac-490b-99ff-3aae73658ca3'
  AND role = 'temp'
  AND site_no IN ('06287000', '06288400');

-- Step 2: add 06287800 as priority-1 temp role
INSERT INTO public.river_usgs_map_roles (river_id, site_no, role, priority, is_active, notes)
VALUES (
  '9b27ccec-f0ac-490b-99ff-3aae73658ca3',
  '06287800',
  'temp',
  1,
  true,
  'Bighorn at St. Xavier — live flow, stage, and temp on same gauge'
)
ON CONFLICT (river_id, site_no, role)
  DO UPDATE SET is_active = true, priority = 1;
