-- Three distinct competitive identities:
-- QUICK (4 choices, classic length), BLITZ (4 choices, short), RANKED (typed, +5s).

alter table public.profiles
  add column if not exists ranked_trophies integer not null default 0
  check (ranked_trophies >= 0);

alter table public.matches drop constraint if exists matches_mode_check;
alter table public.matches
  add constraint matches_mode_check
  check (mode in ('QUICK', 'FRIEND', 'DEVELOPMENT', 'BLITZ', 'RANKED', 'EVENT'));

create index if not exists matches_quick_finished_player_one_idx
  on public.matches (player_one_id) where mode = 'QUICK' and status = 'FINISHED';
create index if not exists matches_quick_finished_player_two_idx
  on public.matches (player_two_id) where mode = 'QUICK' and status = 'FINISHED';
create index if not exists profiles_quick_ladder_idx
  on public.profiles (trophies desc, created_at asc) where trophies > 0;
create index if not exists profiles_blitz_ladder_idx
  on public.profiles (blitz_trophies desc, created_at asc) where blitz_trophies > 0;
create index if not exists profiles_ranked_ladder_idx
  on public.profiles (ranked_trophies desc, created_at asc) where ranked_trophies > 0;

create or replace function public.match_persist_start(
  p_room_key text,
  p_version_id uuid,
  p_player_one uuid,
  p_player_two uuid,
  p_match_mode text default 'FRIEND'
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare persisted_id uuid;
begin
  if p_room_key is null or length(trim(p_room_key)) = 0 or p_player_one = p_player_two then
    raise exception 'INVALID_MATCH';
  end if;
  insert into public.matches(room_key, mode, status, player_one_id, player_two_id, football_data_version_id)
  values (
    trim(p_room_key),
    case when p_match_mode in ('QUICK','FRIEND','DEVELOPMENT','BLITZ','RANKED','EVENT') then p_match_mode else 'FRIEND' end,
    'ACTIVE', p_player_one, p_player_two, p_version_id
  )
  on conflict(room_key) where room_key is not null do update set room_key = excluded.room_key
  returning id into persisted_id;
  return persisted_id;
end $$;

-- Hard-negative choices: prefer a player from only one selected club, then a
-- player from the same leagues. The actual shared player is the sole valid key.
create or replace function public.match_competitive_choices(
  version_id uuid,
  club_a_external text,
  club_b_external text,
  choice_count integer default 4
) returns jsonb
language plpgsql
security invoker
set search_path = ''
volatile
as $$
declare
  n integer := greatest(4, least(coalesce(choice_count, 4), 6));
  a_id uuid;
  b_id uuid;
  a_league text;
  b_league text;
  correct_name text;
  correct_player uuid;
  names text[] := array[]::text[];
  distractor text;
  result jsonb := '[]'::jsonb;
begin
  select c.id, c.league into a_id, a_league from public.clubs c where c.external_id = club_a_external;
  select c.id, c.league into b_id, b_league from public.clubs c where c.external_id = club_b_external;
  if version_id is null or a_id is null or b_id is null or a_id = b_id then return result; end if;

  select p.id, p.game_name into correct_player, correct_name
  from public.club_pair_players cpp
  join public.players p on p.id = cpp.player_id
  where cpp.football_data_version_id = version_id
    and cpp.is_active
    and cpp.club_low_id in (a_id, b_id)
    and cpp.club_high_id in (a_id, b_id)
  order by random()
  limit 1;
  if correct_name is null then return result; end if;
  names := array_append(names, correct_name);

  for distractor in
    with candidates as (
      select p.id, p.game_name,
        case
          when exists (select 1 from public.player_club_contracts pc where pc.player_id = p.id and pc.club_id in (a_id, b_id)) then 0
          when exists (
            select 1 from public.player_club_contracts pc
            join public.clubs c on c.id = pc.club_id
            where pc.player_id = p.id and c.league in (a_league, b_league)
          ) then 1
          else 2
        end as priority
      from public.players p
      where p.id <> correct_player
        and p.game_name is not null
        and length(trim(p.game_name)) > 1
        and exists (
          select 1 from public.player_aliases pa
          where pa.player_id = p.id and pa.is_accepted_answer
        )
        and not exists (
          select 1 from public.club_pair_players cpp
          where cpp.football_data_version_id = version_id
            and cpp.is_active
            and cpp.club_low_id in (a_id, b_id)
            and cpp.club_high_id in (a_id, b_id)
            and cpp.player_id = p.id
        )
    )
    select grouped.game_name
    from (
      select c.game_name, min(c.priority) as priority
      from candidates c
      group by c.game_name
    ) grouped
    order by grouped.priority, random()
    limit (n - 1)
  loop
    names := array_append(names, distractor);
  end loop;

  if cardinality(names) < n then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(v.name order by random()), '[]'::jsonb)
  into result from unnest(names) as v(name);
  return result;
end $$;

create or replace function public.match_persist_finish(
  p_room_key text,
  p_match_winner uuid,
  p_final_scores jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  persisted_match public.matches%rowtype;
  completed_now boolean := false;
  loser uuid;
  season uuid;
begin
  select * into strict persisted_match from public.matches where public.matches.room_key = p_room_key for update;
  if p_match_winner not in (persisted_match.player_one_id, persisted_match.player_two_id) then
    raise exception 'INVALID_MATCH_WINNER';
  end if;
  update public.matches
  set status = 'FINISHED', winner_id = p_match_winner,
      score_one = coalesce((p_final_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_final_scores->>player_two_id::text)::smallint, score_two),
      finished_at = coalesce(finished_at, now())
  where id = persisted_match.id and status <> 'FINISHED'
  returning true into completed_now;

  if completed_now then
    perform public._quests_bump(persisted_match.player_one_id, 'MATCH_FINISH', 1);
    perform public._quests_bump(persisted_match.player_two_id, 'MATCH_FINISH', 1);
    loser := case when p_match_winner = persisted_match.player_one_id
      then persisted_match.player_two_id else persisted_match.player_one_id end;

    if persisted_match.mode in ('QUICK', 'BLITZ', 'RANKED') then
      perform public._quests_bump(persisted_match.player_one_id, 'SOCIAL_TOUCH', 1);
      perform public._quests_bump(persisted_match.player_two_id, 'SOCIAL_TOUCH', 1);
    end if;

    if persisted_match.mode = 'QUICK' then
      update public.profiles set trophies = trophies + 20 where id = p_match_winner;
      update public.profiles set trophies = greatest(0, trophies - 8) where id = loser;
      select id into season from public.league_seasons where active order by starts_at desc limit 1;
      if season is not null then
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, p_match_winner, 20, 1, 0)
        on conflict (season_id, player_id) do update
          set trophies = public.league_entries.trophies + 20, wins = public.league_entries.wins + 1, updated_at = now();
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, loser, 0, 0, 1)
        on conflict (season_id, player_id) do update
          set trophies = greatest(0, public.league_entries.trophies - 8), losses = public.league_entries.losses + 1, updated_at = now();
      end if;
    elsif persisted_match.mode = 'BLITZ' then
      update public.profiles set blitz_trophies = blitz_trophies + 15 where id = p_match_winner;
      update public.profiles set blitz_trophies = greatest(0, blitz_trophies - 5) where id = loser;
    elsif persisted_match.mode = 'RANKED' then
      update public.profiles set ranked_trophies = ranked_trophies + 25 where id = p_match_winner;
      update public.profiles set ranked_trophies = greatest(0, ranked_trophies - 15) where id = loser;
    end if;
  end if;
  return persisted_match.id;
end $$;

create or replace function public.competition_quick_nearby()
returns table(rank bigint, display_name text, player_code text, trophies integer, is_me boolean)
language sql security invoker set search_path = '' stable as $$
  with ranked as (
    select row_number() over (order by p.trophies desc, p.created_at asc) as rank,
      p.id, p.display_name, p.player_code, p.trophies
    from public.profiles p where p.trophies > 0
  )
  select r.rank, r.display_name, r.player_code, r.trophies, r.id = (select auth.uid())
  from ranked r
  where (select auth.uid()) is not null and (r.rank <= 50 or r.id = (select auth.uid()))
  order by r.rank;
$$;

create or replace function public.competition_ranked_nearby()
returns table(rank bigint, display_name text, player_code text, ranked_trophies integer, is_me boolean)
language sql security invoker set search_path = '' stable as $$
  with ranked as (
    select row_number() over (order by p.ranked_trophies desc, p.created_at asc) as rank,
      p.id, p.display_name, p.player_code, p.ranked_trophies
    from public.profiles p where p.ranked_trophies > 0
  )
  select r.rank, r.display_name, r.player_code, r.ranked_trophies, r.id = (select auth.uid())
  from ranked r
  where (select auth.uid()) is not null and (r.rank <= 50 or r.id = (select auth.uid()))
  order by r.rank;
$$;

create or replace function public.ranked_progress()
returns jsonb language sql security invoker set search_path = '' stable as $$
  with progress as (
    select count(*)::integer as completed
    from public.matches m
    where m.status = 'FINISHED' and m.mode = 'QUICK'
      and (select auth.uid()) in (m.player_one_id, m.player_two_id)
  )
  select jsonb_build_object(
    'completed_quick_matches', p.completed,
    'required_quick_matches', 5,
    'unlocked', p.completed >= 5
  ) from progress p where (select auth.uid()) is not null;
$$;

create or replace function public.ranked_player_unlocked(p_player_id uuid)
returns boolean language sql security invoker set search_path = '' stable as $$
  select count(*) >= 5
  from public.matches m
  where m.status = 'FINISHED' and m.mode = 'QUICK'
    and p_player_id in (m.player_one_id, m.player_two_id);
$$;

revoke all on function public.match_competitive_choices(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.match_persist_start(text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.match_persist_finish(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.competition_quick_nearby() from public, anon;
revoke all on function public.competition_ranked_nearby() from public, anon;
revoke all on function public.ranked_progress() from public, anon;
revoke all on function public.ranked_player_unlocked(uuid) from public, anon, authenticated;
grant execute on function public.match_competitive_choices(uuid, text, text, integer) to service_role;
grant execute on function public.match_persist_start(text, uuid, uuid, uuid, text) to service_role;
grant execute on function public.match_persist_finish(text, uuid, jsonb) to service_role;
grant execute on function public.competition_quick_nearby() to authenticated;
grant execute on function public.competition_ranked_nearby() to authenticated;
grant execute on function public.ranked_progress() to authenticated;
grant execute on function public.ranked_player_unlocked(uuid) to service_role;
