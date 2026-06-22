-- Run in Supabase SQL editor (reuse your Polymath project or any Supabase project).
-- Enables anonymous insert-only event tracking from the CineWeb client.

create table if not exists cineweb_events (
  id uuid default gen_random_uuid() primary key,
  visitor_id text not null,
  session_id text not null,
  event_type text not null,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists idx_cineweb_events_visitor on cineweb_events(visitor_id);
create index if not exists idx_cineweb_events_type on cineweb_events(event_type);
create index if not exists idx_cineweb_events_created on cineweb_events(created_at desc);

alter table cineweb_events enable row level security;

drop policy if exists "cineweb_events_anon_insert" on cineweb_events;
create policy "cineweb_events_anon_insert"
  on cineweb_events
  for insert
  to anon
  with check (true);

-- Example retention query (run manually or via cron):
-- delete from cineweb_events where created_at < now() - interval '90 days';
