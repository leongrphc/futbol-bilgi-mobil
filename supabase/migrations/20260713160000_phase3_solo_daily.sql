-- Phase 3: solo daily board (5 pairs / UTC day). No answer lists on client.

create table if not exists public.solo_daily_attempts (
  player_id uuid not null references public.profiles(id) on delete cascade,
  board_day date not null,
  slot smallint not null check (slot between 0 and 4),
  club_a_external text not null,
  club_b_external text not null,
  raw_answer text,
  normalized_answer text,
  is_correct boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (player_id, board_day, slot)
);
create index if not exists solo_daily_attempts_player_day_idx
  on public.solo_daily_attempts(player_id, board_day desc);
alter table public.solo_daily_attempts enable row level security;

create or replace function public._solo_board_day()
returns date language sql stable set search_path = '' as $$
  select (timezone('utc', now()))::date
$$;

create or replace function public._solo_active_version()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.football_data_versions where status = 'ACTIVE' order by created_at desc nulls last limit 1
$$;

create or replace function public._solo_pair_difficulty(p_count integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_count >= 4 then 'EASY'
    when p_count >= 2 then 'MEDIUM'
    else 'HARD'
  end
$$;

-- Deterministic 5-pair board for a UTC day (no answers).
create or replace function public.solo_daily_board()
returns table(
  board_day date,
  slot smallint,
  club_a_id text,
  club_a_name text,
  club_b_id text,
  club_b_name text,
  difficulty text,
  answered boolean,
  is_correct boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  day date := public._solo_board_day();
  version uuid := public._solo_active_version();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if version is null then raise exception 'NO_ACTIVE_FOOTBALL_DATA'; end if;

  return query
  with ranked as (
    select
      row_number() over (
        order by
          case
            when s.valid_player_count >= 4 then 0
            when s.valid_player_count between 2 and 3 then 1
            else 2
          end,
          md5(version::text || day::text || low.external_id || high.external_id)
      ) as rn,
      low.external_id as a_id,
      low.name as a_name,
      high.external_id as b_id,
      high.name as b_name,
      public._solo_pair_difficulty(s.valid_player_count) as diff
    from public.club_pair_stats s
    join public.clubs low on low.id = s.club_low_id and low.active
    join public.clubs high on high.id = s.club_high_id and high.active
    where s.football_data_version_id = version
      and s.valid_player_count >= 1
  ),
  board as (
    select
      (r.rn - 1)::smallint as slot,
      r.a_id, r.a_name, r.b_id, r.b_name, r.diff
    from ranked r
    where r.rn <= 5
  )
  select
    day,
    b.slot,
    b.a_id,
    b.a_name,
    b.b_id,
    b.b_name,
    b.diff,
    a.player_id is not null as answered,
    coalesce(a.is_correct, false) as is_correct
  from board b
  left join public.solo_daily_attempts a
    on a.player_id = me and a.board_day = day and a.slot = b.slot
  order by b.slot;
end $$;

create or replace function public.solo_daily_submit(p_slot smallint, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  day date := public._solo_board_day();
  version uuid := public._solo_active_version();
  club_a text;
  club_b text;
  club_low uuid;
  club_high uuid;
  normalized text;
  correct boolean := false;
  football_player uuid;
  already boolean := false;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_slot is null or p_slot < 0 or p_slot > 4 then raise exception 'INVALID_SLOT'; end if;
  if version is null then raise exception 'NO_ACTIVE_FOOTBALL_DATA'; end if;

  if exists (select 1 from public.solo_daily_attempts where player_id = me and board_day = day and slot = p_slot) then
    select is_correct into correct from public.solo_daily_attempts where player_id = me and board_day = day and slot = p_slot;
    return jsonb_build_object('correct', correct, 'already', true, 'board_day', day, 'slot', p_slot);
  end if;

  select b.club_a_id, b.club_b_id into club_a, club_b
  from public.solo_daily_board() b
  where b.slot = p_slot;
  if club_a is null then raise exception 'BOARD_UNAVAILABLE'; end if;

  normalized := lower(trim(both from regexp_replace(coalesce(p_answer, ''), '\s+', ' ', 'g')));
  -- reuse match validation (aliases + pair membership)
  correct := public.match_validate_answer(version, club_a, club_b, normalized);

  insert into public.solo_daily_attempts(player_id, board_day, slot, club_a_external, club_b_external, raw_answer, normalized_answer, is_correct)
  values (me, day, p_slot, club_a, club_b, left(coalesce(p_answer, ''), 120), normalized, correct);

  if correct then
    select a.id into club_low from public.clubs a where a.external_id = club_a;
    select b.id into club_high from public.clubs b where b.external_id = club_b;
    if club_low is not null and club_high is not null then
      select pa.player_id into football_player
      from public.player_aliases pa
      join public.club_pair_players cpp
        on cpp.player_id = pa.player_id
       and cpp.football_data_version_id = version
       and cpp.is_active
       and cpp.club_low_id = least(club_low, club_high)
       and cpp.club_high_id = greatest(club_low, club_high)
      where pa.is_accepted_answer and pa.normalized_alias = normalized
      order by pa.player_id
      limit 1;
      if football_player is not null then
        insert into public.player_album_entries(player_id, football_player_id)
        values (me, football_player)
        on conflict (player_id, football_player_id) do update
          set unlock_count = public.player_album_entries.unlock_count + 1,
              last_unlocked_at = now();
      end if;
    end if;
    perform public._quests_bump(me, 'CORRECT_ANSWER', 1);
  end if;

  return jsonb_build_object('correct', correct, 'already', already, 'board_day', day, 'slot', p_slot);
end $$;

create or replace function public.solo_daily_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  day date := public._solo_board_day();
  answered int := 0;
  correct int := 0;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select count(*), count(*) filter (where is_correct)
  into answered, correct
  from public.solo_daily_attempts
  where player_id = me and board_day = day;
  return jsonb_build_object('board_day', day, 'answered', answered, 'correct', correct, 'total', 5);
end $$;

revoke all on function public._solo_board_day() from public, anon, authenticated;
revoke all on function public._solo_active_version() from public, anon, authenticated;
revoke all on function public._solo_pair_difficulty(integer) from public, anon, authenticated;
revoke all on function public.solo_daily_board() from public, anon;
revoke all on function public.solo_daily_submit(smallint, text) from public, anon;
revoke all on function public.solo_daily_summary() from public, anon;
grant execute on function public.solo_daily_board() to authenticated;
grant execute on function public.solo_daily_submit(smallint, text) to authenticated;
grant execute on function public.solo_daily_summary() to authenticated;
