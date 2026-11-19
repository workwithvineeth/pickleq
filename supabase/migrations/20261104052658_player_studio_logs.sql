create table public.player_studio_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('practice', 'casual')),
  played_on date not null,
  opponents text not null check (char_length(btrim(opponents)) between 1 and 120),
  partner text not null default '' check (char_length(partner) <= 80),
  location text not null default '' check (char_length(location) <= 100),
  score_for smallint not null check (score_for between 0 and 99),
  score_against smallint not null check (score_against between 0 and 99),
  reflection text not null default '' check (char_length(reflection) <= 1000),
  tags jsonb not null default '{}' check (
    jsonb_typeof(tags) = 'object' and octet_length(tags::text) <= 2000
    and not jsonb_path_exists(tags, '$.* ? (@ != "needs-work" && @ != "went-well")')
  ),
  check (score_for <> score_against)
);
create index player_studio_logs_owner_date_idx on public.player_studio_logs(owner_id, played_on desc);
alter table public.player_studio_logs enable row level security;
revoke all on public.player_studio_logs from public, anon, authenticated;
grant select, insert, update on public.player_studio_logs to authenticated;
create policy "players read own practice logs" on public.player_studio_logs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "players insert own practice logs" on public.player_studio_logs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "players update own practice logs" on public.player_studio_logs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
