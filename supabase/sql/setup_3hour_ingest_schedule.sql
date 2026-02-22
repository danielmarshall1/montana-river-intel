-- Every 3 hours ingest schedule for MRI (USGS + weather).
-- Run in Supabase SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  j record;
begin
  for j in
    select jobid
    from cron.job
    where jobname in ('mri-3hour-usgs-ingest', 'mri-3hour-weather-ingest')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- USGS at minute 5 every 3rd hour.
select cron.schedule(
  'mri-3hour-usgs-ingest',
  '5 */3 * * *',
  $$
  select
    net.http_post(
      url := 'https://relkyvqwmfbmzzlqypmu.supabase.co/functions/v1/usgs-ingest',
      headers := '{"Content-Type":"application/json","x-mri-cadence":"3hour"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Weather after USGS in same cycle.
select cron.schedule(
  'mri-3hour-weather-ingest',
  '12 */3 * * *',
  $$
  select
    net.http_post(
      url := 'https://relkyvqwmfbmzzlqypmu.supabase.co/functions/v1/weather-ingest',
      headers := '{"Content-Type":"application/json","x-mri-cadence":"3hour"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

select jobid, jobname, schedule, active
from cron.job
where jobname like 'mri-%ingest%'
order by jobid;

