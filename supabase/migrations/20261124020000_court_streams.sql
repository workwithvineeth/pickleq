create table public.court_streams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  court int not null check (court between 1 and 64),
  provider text not null default 'youtube' check (provider = 'youtube'),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  visible boolean not null default false,
  status text not null default 'unknown' check (status in ('unknown', 'upcoming', 'live', 'ended', 'unavailable')),
  embeddable boolean,
  checked_at timestamptz,
  created_by uuid,
  created_at timestamptz default now(),
  updated_by uuid,
  updated_at timestamptz default now(),
  unique (tournament_id, court)
);

alter table public.court_streams enable row level security;
revoke all on table public.court_streams from public, anon, authenticated;
create index court_streams_tournament_idx on public.court_streams (tournament_id);

create function public.require_court_stream_organiser(p_tournament uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.tournaments t
    where t.id = p_tournament and (
      public.club_role(t.club_id) in ('owner', 'admin') or public.is_platform_admin()
    )
  ) then
    raise exception 'Only the club''s owner and admins can manage live streams' using errcode = '42501';
  end if;
end $$;

create function public.set_court_stream(p_tournament uuid, p_court int, p_video_id text)
returns public.court_streams
language plpgsql security definer set search_path = '' as $$
declare
  saved public.court_streams;
  caller uuid := auth.uid();
begin
  perform public.require_court_stream_organiser(p_tournament);
  if p_court is null or p_court not between 1 and 64 then
    raise exception 'Court must be between 1 and 64' using errcode = '22023';
  end if;
  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Enter a valid YouTube video ID' using errcode = '22023';
  end if;
  insert into public.court_streams as stream (tournament_id, court, video_id, created_by, updated_by)
  values (p_tournament, p_court, p_video_id, caller, caller)
  on conflict (tournament_id, court) do update set
    video_id = excluded.video_id,
    status = case when stream.video_id = excluded.video_id then stream.status else 'unknown' end,
    embeddable = case when stream.video_id = excluded.video_id then stream.embeddable end,
    checked_at = case when stream.video_id = excluded.video_id then stream.checked_at end,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into saved;
  return saved;
end $$;

create function public.set_court_stream_visible(p_tournament uuid, p_court int, p_visible boolean)
returns public.court_streams
language plpgsql security definer set search_path = '' as $$
declare
  saved public.court_streams;
begin
  perform public.require_court_stream_organiser(p_tournament);
  update public.court_streams
  set visible = p_visible, updated_by = auth.uid(), updated_at = now()
  where tournament_id = p_tournament and court = p_court
  returning * into saved;
  if not found then raise exception 'Save a YouTube link for this court first'; end if;
  return saved;
end $$;

create function public.clear_court_stream(p_tournament uuid, p_court int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_court_stream_organiser(p_tournament);
  delete from public.court_streams where tournament_id = p_tournament and court = p_court;
end $$;

create function public.court_streams_for(p_tournament uuid) returns setof public.court_streams
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_court_stream_organiser(p_tournament);
  return query select * from public.court_streams where tournament_id = p_tournament order by court;
end $$;

create function public.public_court_streams(slug text)
returns table (court int, video_id text, status text, embeddable boolean, checked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.court, s.video_id, s.status, s.embeddable, s.checked_at
  from public.tournaments t join public.court_streams s on s.tournament_id = t.id
  where t.public_slug = slug and t.is_public and t.approval = 'approved' and s.visible
  order by s.court
$$;

revoke all on function public.require_court_stream_organiser(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_court_stream(uuid, int, text),
  public.set_court_stream_visible(uuid, int, boolean), public.clear_court_stream(uuid, int),
  public.court_streams_for(uuid) from public, anon, authenticated, service_role;
revoke all on function public.public_court_streams(text) from public, anon, authenticated, service_role;

grant execute on function public.set_court_stream(uuid, int, text),
  public.set_court_stream_visible(uuid, int, boolean), public.clear_court_stream(uuid, int),
  public.court_streams_for(uuid) to authenticated;
grant execute on function public.public_court_streams(text) to anon, authenticated;
