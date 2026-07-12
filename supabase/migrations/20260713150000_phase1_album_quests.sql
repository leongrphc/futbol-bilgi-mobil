-- Phase 1 Sticky: player album unlocks + daily quests (server-authoritative)

create table if not exists public.player_album_entries (
  player_id uuid not null references public.profiles(id) on delete cascade,
  football_player_id uuid not null references public.players(id) on delete cascade,
  first_unlocked_at timestamptz not null default now(),
  unlock_count integer not null default 1 check (unlock_count >= 1),
  last_unlocked_at timestamptz not null default now(),
  first_match_id uuid references public.matches(id) on delete set null,
  primary key (player_id, football_player_id)
);
create index if not exists player_album_entries_player_unlocked_idx
  on public.player_album_entries(player_id, first_unlocked_at desc);
alter table public.player_album_entries enable row level security;

create table if not exists public.quest_definitions (
  id text primary key,
  kind text not null check (kind in ('DAILY')),
  metric text not null check (metric in ('MATCH_FINISH', 'CORRECT_ANSWER', 'SOCIAL_TOUCH')),
  target_count integer not null check (target_count > 0),
  reward_kind text not null default 'NONE' check (reward_kind in ('NONE', 'COSMETIC_HINT', 'TROPHY_TOKEN')),
  reward_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order smallint not null default 0
);
alter table public.quest_definitions enable row level security;

create table if not exists public.user_daily_quests (
  player_id uuid not null references public.profiles(id) on delete cascade,
  quest_day date not null,
  quest_id text not null references public.quest_definitions(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  target_count integer not null check (target_count > 0),
  completed_at timestamptz,
  claimed_at timestamptz,
  primary key (player_id, quest_day, quest_id)
);
create index if not exists user_daily_quests_player_day_idx
  on public.user_daily_quests(player_id, quest_day desc);
alter table public.user_daily_quests enable row level security;

insert into public.quest_definitions(id, kind, metric, target_count, sort_order) values
  ('daily_finish_match', 'DAILY', 'MATCH_FINISH', 1, 1),
  ('daily_correct_answer', 'DAILY', 'CORRECT_ANSWER', 1, 2),
  ('daily_social_touch', 'DAILY', 'SOCIAL_TOUCH', 1, 3)
on conflict (id) do update set metric = excluded.metric, target_count = excluded.target_count, active = true, sort_order = excluded.sort_order;

create or replace function public._quests_ensure_day(p_player uuid, p_day date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_player is null then return; end if;
  insert into public.user_daily_quests(player_id, quest_day, quest_id, progress, target_count)
  select p_player, p_day, d.id, 0, d.target_count
  from public.quest_definitions d
  where d.active and d.kind = 'DAILY'
  on conflict (player_id, quest_day, quest_id) do nothing;
end $$;

create or replace function public._quests_bump(p_player uuid, p_metric text, p_delta integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare day date := (timezone('utc', now()))::date;
begin
  if p_player is null or p_delta is null or p_delta <= 0 then return; end if;
  if not exists (select 1 from public.profiles where id = p_player) then return; end if;
  perform public._quests_ensure_day(p_player, day);
  update public.user_daily_quests u
  set progress = least(u.target_count, u.progress + p_delta),
      completed_at = case
        when u.completed_at is null and u.progress + p_delta >= u.target_count then now()
        else u.completed_at
      end
  from public.quest_definitions d
  where u.player_id = p_player
    and u.quest_day = day
    and u.quest_id = d.id
    and d.metric = p_metric
    and d.active;
end $$;

revoke all on function public._quests_ensure_day(uuid, date) from public, anon, authenticated;
revoke all on function public._quests_bump(uuid, text, integer) from public, anon, authenticated;
grant execute on function public._quests_ensure_day(uuid, date) to service_role;
grant execute on function public._quests_bump(uuid, text, integer) to service_role;

create or replace function public.match_persist_round(
  p_room_key text, p_round_ordinal integer, p_is_sudden_death boolean, p_club_a_external text, p_club_b_external text,
  p_round_winner uuid, p_round_submissions jsonb, p_scores jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  persisted_match public.matches%rowtype;
  club_a uuid;
  club_b uuid;
  club_low uuid;
  club_high uuid;
  persisted_round uuid;
  item jsonb;
  submitter uuid;
  is_correct boolean;
  normalized text;
  football_player uuid;
  inserted_count integer;
begin
  if p_round_ordinal < 1 then raise exception 'INVALID_ROUND_ORDINAL'; end if;
  select * into strict persisted_match from public.matches where public.matches.room_key = p_room_key for update;
  select id into strict club_a from public.clubs where external_id = p_club_a_external;
  select id into strict club_b from public.clubs where external_id = p_club_b_external;
  club_low := least(club_a, club_b);
  club_high := greatest(club_a, club_b);
  insert into public.rounds(match_id, round_number, sudden_death, club_low_id, club_high_id, winner_id, finished_at)
  values (persisted_match.id, p_round_ordinal, p_is_sudden_death, club_low, club_high, p_round_winner, now())
  on conflict (match_id, round_number) do update set winner_id = excluded.winner_id, finished_at = excluded.finished_at
  returning id into persisted_round;

  for item in select value from jsonb_array_elements(coalesce(p_round_submissions, '[]'::jsonb)) loop
    begin
      submitter := (item->>'player_id')::uuid;
    exception when others then
      continue;
    end;
    is_correct := coalesce((item->>'is_correct')::boolean, false);
    normalized := item->>'normalized_answer';
    inserted_count := 0;
    insert into public.submissions(round_id, player_id, raw_answer, normalized_answer, is_correct, received_at, submission_sequence, client_command_id)
    values (
      persisted_round,
      submitter,
      item->>'raw_answer',
      normalized,
      is_correct,
      to_timestamp((item->>'received_at_ms')::double precision / 1000),
      coalesce((item->>'sequence')::bigint, 0),
      p_room_key || ':' || p_round_ordinal || ':' || (item->>'player_id')
    )
    on conflict (round_id, player_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count > 0 and is_correct then
      select pa.player_id into football_player
      from public.player_aliases pa
      join public.club_pair_players cpp
        on cpp.player_id = pa.player_id
       and cpp.football_data_version_id = persisted_match.football_data_version_id
       and cpp.is_active
       and cpp.club_low_id = club_low
       and cpp.club_high_id = club_high
      where pa.is_accepted_answer
        and pa.normalized_alias = normalized
      order by pa.player_id
      limit 1;
      if football_player is not null then
        insert into public.player_album_entries(player_id, football_player_id, first_match_id)
        values (submitter, football_player, persisted_match.id)
        on conflict (player_id, football_player_id) do update
          set unlock_count = public.player_album_entries.unlock_count + 1,
              last_unlocked_at = now();
      end if;
      perform public._quests_bump(submitter, 'CORRECT_ANSWER', 1);
    end if;
  end loop;

  update public.matches
  set score_one = coalesce((p_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_scores->>player_two_id::text)::smallint, score_two)
  where id = persisted_match.id;
  return persisted_round;
end $$;

create or replace function public.match_persist_finish(p_room_key text, p_match_winner uuid, p_final_scores jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
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
  set status = 'FINISHED',
      winner_id = p_match_winner,
      score_one = coalesce((p_final_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_final_scores->>player_two_id::text)::smallint, score_two),
      finished_at = coalesce(finished_at, now())
  where id = persisted_match.id and status <> 'FINISHED'
  returning true into completed_now;

  if completed_now then
    perform public._quests_bump(persisted_match.player_one_id, 'MATCH_FINISH', 1);
    perform public._quests_bump(persisted_match.player_two_id, 'MATCH_FINISH', 1);
    if persisted_match.mode = 'QUICK' then
      perform public._quests_bump(persisted_match.player_one_id, 'SOCIAL_TOUCH', 1);
      perform public._quests_bump(persisted_match.player_two_id, 'SOCIAL_TOUCH', 1);
      loser := case
        when p_match_winner = persisted_match.player_one_id then persisted_match.player_two_id
        else persisted_match.player_one_id
      end;
      update public.profiles set trophies = trophies + 25 where id = p_match_winner;
      update public.profiles set trophies = greatest(0, trophies - 10) where id = loser;
      select id into season from public.league_seasons where active order by starts_at desc limit 1;
      if season is not null then
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, p_match_winner, 25, 1, 0)
        on conflict (season_id, player_id) do update
          set trophies = public.league_entries.trophies + 25,
              wins = public.league_entries.wins + 1,
              updated_at = now();
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, loser, 0, 0, 1)
        on conflict (season_id, player_id) do update
          set trophies = greatest(0, public.league_entries.trophies - 10),
              losses = public.league_entries.losses + 1,
              updated_at = now();
      end if;
    end if;
  end if;
  return persisted_match.id;
end $$;

create or replace function public.social_invite_friend(p_friend_id uuid, p_room_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  invite_id uuid;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.friendships
    where status = 'ACCEPTED'
      and ((requester_id = me and addressee_id = p_friend_id) or (requester_id = p_friend_id and addressee_id = me))
  ) then
    raise exception 'NOT_FRIENDS';
  end if;
  insert into public.friend_match_invites(sender_id, recipient_id, room_key)
  values (me, p_friend_id, trim(p_room_key))
  returning id into invite_id;
  perform public._quests_bump(me, 'SOCIAL_TOUCH', 1);
  return invite_id;
end $$;

create or replace function public.album_mine()
returns table(
  football_player_id uuid,
  game_name text,
  external_id text,
  first_unlocked_at timestamptz,
  unlock_count integer,
  last_unlocked_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  return query
  select e.football_player_id, p.game_name, p.external_id, e.first_unlocked_at, e.unlock_count, e.last_unlocked_at
  from public.player_album_entries e
  join public.players p on p.id = e.football_player_id
  where e.player_id = me
  order by e.first_unlocked_at desc;
end $$;

create or replace function public.quests_mine()
returns table(
  quest_id text,
  metric text,
  progress integer,
  target_count integer,
  completed boolean,
  claimed boolean,
  quest_day date
)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  day date := (timezone('utc', now()))::date;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  perform public._quests_ensure_day(me, day);
  return query
  select u.quest_id, d.metric, u.progress, u.target_count,
         u.completed_at is not null, u.claimed_at is not null, u.quest_day
  from public.user_daily_quests u
  join public.quest_definitions d on d.id = u.quest_id
  where u.player_id = me and u.quest_day = day and d.active
  order by d.sort_order, u.quest_id;
end $$;

create or replace function public.quests_claim(p_quest_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  day date := (timezone('utc', now()))::date;
  updated int := 0;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  perform public._quests_ensure_day(me, day);
  update public.user_daily_quests
  set claimed_at = now()
  where player_id = me
    and quest_day = day
    and quest_id = p_quest_id
    and completed_at is not null
    and claimed_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    if exists (
      select 1 from public.user_daily_quests
      where player_id = me and quest_day = day and quest_id = p_quest_id and claimed_at is not null
    ) then
      return true;
    end if;
    raise exception 'QUEST_NOT_CLAIMABLE';
  end if;
  return true;
end $$;

revoke all on function public.match_persist_round(text, integer, boolean, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.match_persist_finish(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.match_persist_round(text, integer, boolean, text, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.match_persist_finish(text, uuid, jsonb) to service_role;

revoke all on function public.social_invite_friend(uuid, text) from public, anon;
grant execute on function public.social_invite_friend(uuid, text) to authenticated;

revoke all on function public.album_mine() from public, anon;
revoke all on function public.quests_mine() from public, anon;
revoke all on function public.quests_claim(text) from public, anon;
grant execute on function public.album_mine() to authenticated;
grant execute on function public.quests_mine() to authenticated;
grant execute on function public.quests_claim(text) to authenticated;
