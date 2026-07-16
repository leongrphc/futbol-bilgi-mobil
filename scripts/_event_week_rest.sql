-- Ensure only playable clubs with league labels
create table if not exists public.event_weeks (
  id uuid primary key default gen_random_uuid(),
  title_tr text not null,
  title_en text not null,
  league text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','LIVE','ENDED')),
  accent text not null default '#F4C95D',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_weeks_one_live
  on public.event_weeks ((status))
  where status = 'LIVE';

create index if not exists event_weeks_status_idx on public.event_weeks(status, updated_at desc);

alter table public.event_weeks enable row level security;

drop policy if exists event_weeks_select_live on public.event_weeks;
create policy event_weeks_select_live on public.event_weeks
  for select to authenticated
  using (status = 'LIVE');

alter table public.matches drop constraint if exists matches_mode_check;
alter table public.matches
  add constraint matches_mode_check check (mode in ('QUICK', 'FRIEND', 'DEVELOPMENT', 'BLITZ', 'EVENT'));

create or replace function public.match_persist_start(
  p_room_key text, p_version_id uuid, p_player_one uuid, p_player_two uuid, p_match_mode text default 'FRIEND'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare persisted_id uuid;
begin
  if p_room_key is null or length(trim(p_room_key))=0 or p_player_one=p_player_two then raise exception 'INVALID_MATCH'; end if;
  insert into public.matches(room_key,mode,status,player_one_id,player_two_id,football_data_version_id)
  values(
    trim(p_room_key),
    case when p_match_mode in ('QUICK','FRIEND','DEVELOPMENT','BLITZ','EVENT') then p_match_mode else 'FRIEND' end,
    'ACTIVE',
    p_player_one,
    p_player_two,
    p_version_id
  )
  on conflict(room_key) where room_key is not null do update set room_key=excluded.room_key
  returning id into persisted_id;
  return persisted_id;
end $$;

create or replace function public.event_leagues()
returns table(league text, club_count integer, active_club_count integer)
language sql security definer set search_path='' stable as $$
  select c.league,
    count(*)::integer,
    count(*) filter (where c.active)::integer
  from public.clubs c
  where c.league is not null and length(trim(c.league)) > 0
  group by c.league
  having count(*) filter (where c.active) >= 2
  order by count(*) filter (where c.active) desc, c.league;
$$;

create or replace function public.event_current()
returns jsonb language sql security definer set search_path='' stable as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', e.id,
        'title_tr', e.title_tr,
        'title_en', e.title_en,
        'league', e.league,
        'status', e.status,
        'accent', e.accent,
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'club_count', (
          select count(*)::int from public.clubs c
          where c.active and c.league = e.league
        )
      )
      from public.event_weeks e
      where e.status = 'LIVE'
      order by e.updated_at desc
      limit 1
    ),
    jsonb_build_object('status', 'NONE')
  );
$$;

create or replace function public.event_live_scope()
returns jsonb language sql security definer set search_path='' stable as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', e.id,
        'league', e.league,
        'title_tr', e.title_tr,
        'title_en', e.title_en,
        'accent', e.accent
      )
      from public.event_weeks e
      where e.status = 'LIVE'
      order by e.updated_at desc
      limit 1
    ),
    'null'::jsonb
  );
$$;

drop function if exists public.get_match_bootstrap(integer, uuid);
drop function if exists public.get_match_bootstrap(integer, uuid, text);
create function public.get_match_bootstrap(
  pool_size integer default 6,
  requested_version uuid default null,
  league_filter text default null
) returns jsonb language sql security definer set search_path=public stable as $$
  with active_version as (
    select coalesce(requested_version,(select id from football_data_versions where status='ACTIVE' limit 1)) id
  ), eligible as (
    select candidate.id,candidate.external_id,candidate.name from (
      select distinct c.id, c.external_id, c.name
      from clubs c
      join club_pair_stats s on c.id in (s.club_low_id,s.club_high_id)
      join active_version v on v.id=s.football_data_version_id
      where c.active and s.valid_player_count>0
        and (
          league_filter is null
          or length(trim(league_filter))=0
          or c.league = league_filter
        )
    ) candidate order by random() limit greatest(2,least(pool_size,200))
  )
  select jsonb_build_object(
    'football_data_version_id',(select id from active_version),
    'league_filter', nullif(trim(league_filter), ''),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'name',name)) from eligible),'[]'::jsonb)
  )
$$;

drop function if exists public.match_pick_pair(uuid, text[], integer);
drop function if exists public.match_pick_pair(uuid, text[], integer, text);
create function public.match_pick_pair(
  version_id uuid,
  excluded_pairs text[] default '{}',
  minimum_answers integer default 1,
  league_filter text default null
) returns jsonb language sql security definer set search_path=public volatile as $$
  select jsonb_build_object(
    'club_a_id', low.external_id,
    'club_a_name', low.name,
    'club_b_id', high.external_id,
    'club_b_name', high.name
  )
  from club_pair_stats s
  join clubs low on low.id = s.club_low_id
  join clubs high on high.id = s.club_high_id
  where s.football_data_version_id = version_id
    and s.valid_player_count >= minimum_answers
    and low.active and high.active
    and (least(low.external_id, high.external_id) || ':' || greatest(low.external_id, high.external_id)) <> all (excluded_pairs)
    and (
      league_filter is null
      or length(trim(league_filter)) = 0
      or (low.league = league_filter and high.league = league_filter)
    )
  order by case when s.valid_player_count between 2 and 3 then 0 else 1 end, random()
  limit 1
$$;

create or replace function public.admin_event_list()
returns table(
  id uuid, title_tr text, title_en text, league text, status text,
  accent text, starts_at timestamptz, ends_at timestamptz,
  club_count integer, updated_at timestamptz
)
language sql security definer set search_path='' as $$
  select e.id, e.title_tr, e.title_en, e.league, e.status, e.accent, e.starts_at, e.ends_at,
    (select count(*)::int from public.clubs c where c.active and c.league = e.league),
    e.updated_at
  from public.event_weeks e
  order by case e.status when 'LIVE' then 0 when 'DRAFT' then 1 else 2 end, e.updated_at desc;
$$;

create or replace function public.admin_event_upsert(
  p_id uuid default null,
  p_title_tr text default null,
  p_title_en text default null,
  p_league text default null,
  p_accent text default '#F4C95D'
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  rid uuid;
  league_norm text := trim(p_league);
begin
  if league_norm is null or length(league_norm)=0 then raise exception 'LEAGUE_REQUIRED'; end if;
  if not exists (select 1 from public.clubs c where c.active and c.league = league_norm) then
    raise exception 'LEAGUE_UNKNOWN';
  end if;
  if p_id is null then
    insert into public.event_weeks(title_tr, title_en, league, accent, status)
    values (
      coalesce(nullif(trim(p_title_tr),''), league_norm || ' Haftası'),
      coalesce(nullif(trim(p_title_en),''), league_norm || ' Week'),
      league_norm,
      coalesce(nullif(trim(p_accent),''), '#F4C95D'),
      'DRAFT'
    )
    returning id into rid;
  else
    update public.event_weeks
    set title_tr = coalesce(nullif(trim(p_title_tr),''), title_tr),
        title_en = coalesce(nullif(trim(p_title_en),''), title_en),
        league = league_norm,
        accent = coalesce(nullif(trim(p_accent),''), accent),
        updated_at = now()
    where id = p_id and status in ('DRAFT','ENDED')
    returning id into rid;
    if rid is null then raise exception 'EVENT_NOT_EDITABLE'; end if;
  end if;
  return rid;
end $$;

create or replace function public.admin_event_go_live(p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if not exists (select 1 from public.event_weeks where id = p_id) then raise exception 'EVENT_NOT_FOUND'; end if;
  update public.event_weeks
  set status = 'ENDED', ends_at = coalesce(ends_at, now()), updated_at = now()
  where status = 'LIVE' and id <> p_id;
  update public.event_weeks
  set status = 'LIVE', starts_at = coalesce(starts_at, now()), ends_at = null, updated_at = now()
  where id = p_id
  returning id into rid;
  return rid;
end $$;

create or replace function public.admin_event_end(p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  update public.event_weeks
  set status = 'ENDED', ends_at = now(), updated_at = now()
  where id = p_id and status = 'LIVE'
  returning id into rid;
  if rid is null then raise exception 'EVENT_NOT_LIVE'; end if;
  return rid;
end $$;

revoke all on function public.event_leagues() from public, anon;
revoke all on function public.event_current() from public, anon;
revoke all on function public.event_live_scope() from public, anon, authenticated;
revoke all on function public.get_match_bootstrap(integer, uuid, text) from public, anon, authenticated;
revoke all on function public.match_pick_pair(uuid, text[], integer, text) from public, anon, authenticated;
revoke all on function public.admin_event_list() from public, anon, authenticated;
revoke all on function public.admin_event_upsert(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_event_go_live(uuid) from public, anon, authenticated;
revoke all on function public.admin_event_end(uuid) from public, anon, authenticated;

grant execute on function public.event_leagues() to authenticated, service_role;
grant execute on function public.event_current() to authenticated;
grant execute on function public.event_live_scope() to service_role;
grant execute on function public.get_match_bootstrap(integer, uuid, text) to service_role;
grant execute on function public.match_pick_pair(uuid, text[], integer, text) to service_role;
grant execute on function public.admin_event_list() to service_role;
grant execute on function public.admin_event_upsert(uuid, text, text, text, text) to service_role;
grant execute on function public.admin_event_go_live(uuid) to service_role;
grant execute on function public.admin_event_end(uuid) to service_role;
