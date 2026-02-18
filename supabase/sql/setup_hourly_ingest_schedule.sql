-- Hourly ingest scheduler for MRI (USGS + weather).
-- Run in Supabase SQL Editor for project: relkyvqwmfbmzzlqypmu

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove prior jobs with same names to avoid duplicates.
do $$
declare
  j record;
begin
  for j in
    select jobid
    from cron.job
    where jobname in ('mri-hourly-usgs-ingest', 'mri-hourly-weather-ingest')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- Pull USGS first (minute 5 of every hour).
select cron.schedule(
  'mri-hourly-usgs-ingest',
  '5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://relkyvqwmfbmzzlqypmu.supabase.co/functions/v1/usgs-ingest',
      headers := '{"Content-Type":"application/json","x-mri-cadence":"hourly"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Pull weather and recompute scores after USGS (minute 12 of every hour).
select cron.schedule(
  'mri-hourly-weather-ingest',
  '12 * * * *',
  $$
  select
    net.http_post(
      url := 'https://relkyvqwmfbmzzlqypmu.supabase.co/functions/v1/weather-ingest',
      headers := '{"Content-Type":"application/json","x-mri-cadence":"hourly"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Verify active jobs.
select jobid, jobname, schedule, active
from cron.job
where jobname like 'mri-hourly-%'
order by jobid;
