select
  river_name,
  flow_site,
  temp_site,
  has_iv_temp,
  has_dv_temp,
  temp_source_kind,
  confidence_level,
  temp_status,
  temp_reason,
  temp_observed_at
from public.v_river_temperature_trust_report
order by river_name;
