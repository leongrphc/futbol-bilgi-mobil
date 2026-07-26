begin;

alter table public.matches
  add column if not exists trophy_delta_one integer,
  add column if not exists trophy_delta_two integer;

comment on column public.matches.trophy_delta_one is
  'Authoritative trophy change applied to player_one_id when the match first finished.';
comment on column public.matches.trophy_delta_two is
  'Authoritative trophy change applied to player_two_id when the match first finished.';

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
  loser_before integer := 0;
  winner_delta integer := 0;
  loser_delta integer := 0;
begin
  select * into strict persisted_match
  from public.matches
  where public.matches.room_key = p_room_key
  for update;

  if p_match_winner not in (persisted_match.player_one_id, persisted_match.player_two_id) then
    raise exception 'INVALID_MATCH_WINNER';
  end if;

  update public.matches
  set status = 'FINISHED',
      winner_id = p_match_winner,
      score_one = coalesce((p_final_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_final_scores->>player_two_id::text)::smallint, score_two),
      finished_at = coalesce(finished_at, now())
  where id = persisted_match.id
    and status <> 'FINISHED'
  returning true into completed_now;

  if completed_now then
    perform public._quests_bump(persisted_match.player_one_id, 'MATCH_FINISH', 1);
    perform public._quests_bump(persisted_match.player_two_id, 'MATCH_FINISH', 1);

    loser := case
      when p_match_winner = persisted_match.player_one_id then persisted_match.player_two_id
      else persisted_match.player_one_id
    end;

    if persisted_match.mode in ('QUICK', 'BLITZ', 'RANKED') then
      perform public._quests_bump(persisted_match.player_one_id, 'SOCIAL_TOUCH', 1);
      perform public._quests_bump(persisted_match.player_two_id, 'SOCIAL_TOUCH', 1);
    end if;

    if persisted_match.mode = 'QUICK' then
      select trophies into loser_before from public.profiles where id = loser for update;
      winner_delta := 20;
      loser_delta := -least(loser_before, 8);
      update public.profiles set trophies = trophies + winner_delta where id = p_match_winner;
      update public.profiles set trophies = trophies + loser_delta where id = loser;

      select id into season
      from public.league_seasons
      where active
      order by starts_at desc
      limit 1;

      if season is not null then
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, p_match_winner, 20, 1, 0)
        on conflict (season_id, player_id) do update
          set trophies = public.league_entries.trophies + 20,
              wins = public.league_entries.wins + 1,
              updated_at = now();

        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, loser, 0, 0, 1)
        on conflict (season_id, player_id) do update
          set trophies = greatest(0, public.league_entries.trophies - 8),
              losses = public.league_entries.losses + 1,
              updated_at = now();
      end if;
    elsif persisted_match.mode = 'BLITZ' then
      select blitz_trophies into loser_before from public.profiles where id = loser for update;
      winner_delta := 15;
      loser_delta := -least(loser_before, 5);
      update public.profiles set blitz_trophies = blitz_trophies + winner_delta where id = p_match_winner;
      update public.profiles set blitz_trophies = blitz_trophies + loser_delta where id = loser;
    elsif persisted_match.mode = 'RANKED' then
      select ranked_trophies into loser_before from public.profiles where id = loser for update;
      winner_delta := 25;
      loser_delta := -least(loser_before, 15);
      update public.profiles set ranked_trophies = ranked_trophies + winner_delta where id = p_match_winner;
      update public.profiles set ranked_trophies = ranked_trophies + loser_delta where id = loser;
    end if;

    update public.matches
    set trophy_delta_one = case
          when player_one_id = p_match_winner then winner_delta
          else loser_delta
        end,
        trophy_delta_two = case
          when player_two_id = p_match_winner then winner_delta
          else loser_delta
        end
    where id = persisted_match.id;

    begin
      perform public._achievements_on_match_completed(persisted_match.id);
    exception when others then
      raise warning 'achievement evaluation failed for match %: %', persisted_match.id, sqlerrm;
    end;
  end if;

  return persisted_match.id;
end
$$;

create or replace function public.player_public_card(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  profile_row public.profiles%rowtype;
  form text[] := array[]::text[];
  friendship_state text := 'NONE';
  rec record;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_player_id is null then raise exception 'INVALID_PLAYER'; end if;

  select * into profile_row
  from public.profiles
  where id = p_player_id;

  if profile_row.id is null then raise exception 'PLAYER_NOT_FOUND'; end if;

  for rec in
    select case when m.winner_id = p_player_id then 'W' else 'L' end as outcome
    from public.matches m
    where m.status = 'FINISHED'
      and p_player_id in (m.player_one_id, m.player_two_id)
    order by m.finished_at desc nulls last
    limit 5
  loop
    form := array_append(form, rec.outcome);
  end loop;

  if p_player_id = me then
    friendship_state := 'SELF';
  else
    select case
      when f.status = 'ACCEPTED' then 'ACCEPTED'
      when f.addressee_id = me then 'PENDING_INCOMING'
      else 'PENDING_OUTGOING'
    end
    into friendship_state
    from public.friendships f
    where (f.requester_id = me and f.addressee_id = p_player_id)
       or (f.requester_id = p_player_id and f.addressee_id = me)
    limit 1;

    friendship_state := coalesce(friendship_state, 'NONE');
  end if;

  return jsonb_build_object(
    'player_id', profile_row.id,
    'display_name', profile_row.display_name,
    'player_code', profile_row.player_code,
    'avatar_url', profile_row.avatar_url,
    'trophies', profile_row.trophies,
    'blitz_trophies', profile_row.blitz_trophies,
    'ranked_trophies', profile_row.ranked_trophies,
    'form', form,
    'friendship_state', friendship_state,
    'achievements', public._achievement_showcase_json(profile_row.id)
  );
end
$$;

drop function if exists public.competition_my_history();

create function public.competition_my_history()
returns table(
  match_id uuid,
  mode text,
  opponent_id uuid,
  opponent_name text,
  opponent_code text,
  score_for smallint,
  score_against smallint,
  outcome text,
  trophy_delta integer,
  friend_state text,
  finished_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    m.id,
    m.mode,
    opponent.id,
    opponent.display_name,
    opponent.player_code,
    case when m.player_one_id = auth.uid() then m.score_one else m.score_two end,
    case when m.player_one_id = auth.uid() then m.score_two else m.score_one end,
    case when m.winner_id = auth.uid() then 'WIN' else 'LOSS' end,
    case when m.player_one_id = auth.uid() then m.trophy_delta_one else m.trophy_delta_two end,
    coalesce(friendship.state, 'NONE'),
    m.finished_at
  from public.matches m
  join public.profiles opponent
    on opponent.id = case
      when m.player_one_id = auth.uid() then m.player_two_id
      else m.player_one_id
    end
  left join lateral (
    select case
      when f.status = 'ACCEPTED' then 'ACCEPTED'
      when f.addressee_id = auth.uid() then 'PENDING_INCOMING'
      else 'PENDING_OUTGOING'
    end as state
    from public.friendships f
    where (f.requester_id = auth.uid() and f.addressee_id = opponent.id)
       or (f.requester_id = opponent.id and f.addressee_id = auth.uid())
    limit 1
  ) friendship on true
  where auth.uid() is not null
    and auth.uid() in (m.player_one_id, m.player_two_id)
    and m.status = 'FINISHED'
  order by m.finished_at desc nulls last
  limit 10;
$$;

revoke all on function public.match_persist_finish(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.player_public_card(uuid) from public, anon;
revoke all on function public.competition_my_history() from public, anon;

grant execute on function public.match_persist_finish(text, uuid, jsonb) to service_role;
grant execute on function public.player_public_card(uuid) to authenticated;
grant execute on function public.competition_my_history() to authenticated;

commit;
