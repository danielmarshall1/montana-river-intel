-- Add GIN index on flies for array containment queries
create index if not exists idx_pai_reports_flies on public.pai_reports using gin(flies);
