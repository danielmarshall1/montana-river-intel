-- Enforce excerpt-only storage: no full content, max 500 chars.
update public.pai_reports
set excerpt = left(excerpt, 497) || '…'
where excerpt is not null and char_length(excerpt) > 500;

alter table public.pai_reports
  add constraint pai_reports_excerpt_max_length
  check (excerpt is null or char_length(excerpt) <= 500);
