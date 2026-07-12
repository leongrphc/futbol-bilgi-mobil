-- Blitz mode: separate ladder (blitz_trophies), match mode BLITZ

alter table public.profiles
  add column if not exists blitz_trophies integer not null default 0 check (blitz_trophies >= 0);

alter table public.matches drop constraint if exists matches_mode_check;
alter table public.matches
  add constraint matches_mode_check check (mode in ('QUICK', 'FRIEND', 'DEVELOPMENT', 'BLITZ'));

create or replace function public.match_persist_start(
  p_room_key text, p_version_id uuid, p_player_one uuid, p_player_two uuid, p_match_mode text default 'FRIEND'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare persisted_id uuid;
begin
  if p_room_key is null or length(trim(p_room_key))=0 or p_player_one=p_player_two then raise exception 'INVALID_MATCH'; end if;
  insert into public.matches(room_key,mode,status,player_one_id,player_two_id,football_data_version_id)
  values(
    trim(p_room_key),
    case when p_match_mode in ('QUICK','FRIEND','DEVELOPMENT','BLITZ') then p_match_mode else 'FRIEND' end,
    'ACTIVE',
    p_player_one,
    p_player_two,
    p_version_id
  )
  on conflict(room_key) where room_key is not null do update set room_key=excluded.room_key
  returning id into persisted_id;
  return persisted_id;
end $$;

-- Finish: QUICK uses trophies (+25/-10 + league). BLITZ uses blitz_trophies only (+15/-5, no season league).
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
    loser := case
      when p_match_winner = persisted_match.player_one_id then persisted_match.player_two_id
      else persisted_match.player_one_id
    end;

    if persisted_match.mode = 'QUICK' then
      perform public._quests_bump(persisted_match.player_one_id, 'SOCIAL_TOUCH', 1);
      perform public._quests_bump(persisted_match.player_two_id, 'SOCIAL_TOUCH', 1);
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
    elsif persisted_match.mode = 'BLITZ' then
      -- separate ladder: smaller swings, no season table pollution
      update public.profiles set blitz_trophies = blitz_trophies + 15 where id = p_match_winner;
      update public.profiles set blitz_trophies = greatest(0, blitz_trophies - 5) where id = loser;
    end if;
  end if;
  return persisted_match.id;
end $$;

revoke all on function public.match_persist_start(text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.match_persist_finish(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.match_persist_start(text, uuid, uuid, uuid, text) to service_role;
grant execute on function public.match_persist_finish(text, uuid, jsonb) to service_role;
