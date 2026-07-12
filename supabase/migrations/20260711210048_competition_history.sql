create table public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default false,
  check (ends_at > starts_at)
);
create unique index league_seasons_one_active on public.league_seasons(active) where active;
create table public.league_entries (
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  trophies integer not null default 0 check (trophies >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);
alter table public.league_seasons enable row level security;
alter table public.league_entries enable row level security;
insert into public.league_seasons(name, starts_at, ends_at, active)
values ('2026 Yaz Sezonu', '2026-07-01T00:00:00Z', '2026-10-01T00:00:00Z', true)
on conflict(name) do update set active = excluded.active;

create or replace function public.match_persist_finish(p_room_key text, p_match_winner uuid, p_final_scores jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare persisted_match public.matches%rowtype; completed_now boolean := false; loser uuid; season uuid;
begin
  select * into strict persisted_match from public.matches where public.matches.room_key=p_room_key for update;
  if p_match_winner not in (persisted_match.player_one_id, persisted_match.player_two_id) then raise exception 'INVALID_MATCH_WINNER'; end if;
  update public.matches set status='FINISHED', winner_id=p_match_winner,
    score_one=coalesce((p_final_scores->>player_one_id::text)::smallint,score_one),
    score_two=coalesce((p_final_scores->>player_two_id::text)::smallint,score_two), finished_at=coalesce(finished_at,now())
  where id=persisted_match.id and status <> 'FINISHED'
  returning true into completed_now;
  if completed_now and persisted_match.mode = 'QUICK' then
    loser := case when p_match_winner = persisted_match.player_one_id then persisted_match.player_two_id else persisted_match.player_one_id end;
    update public.profiles set trophies = trophies + 25 where id = p_match_winner;
    update public.profiles set trophies = greatest(0, trophies - 10) where id = loser;
    select id into season from public.league_seasons where active order by starts_at desc limit 1;
    if season is not null then
      insert into public.league_entries(season_id,player_id,trophies,wins,losses) values (season,p_match_winner,25,1,0)
      on conflict(season_id,player_id) do update set trophies=league_entries.trophies+25,wins=league_entries.wins+1,updated_at=now();
      insert into public.league_entries(season_id,player_id,trophies,wins,losses) values (season,loser,0,0,1)
      on conflict(season_id,player_id) do update set trophies=greatest(0,league_entries.trophies-10),losses=league_entries.losses+1,updated_at=now();
    end if;
  end if;
  return persisted_match.id;
end $$;

create or replace function public.competition_my_history()
returns table(match_id uuid, mode text, opponent_name text, score_for smallint, score_against smallint, outcome text, finished_at timestamptz)
language sql security definer set search_path='' as $$
  select m.id, m.mode, opponent.display_name,
    case when m.player_one_id = auth.uid() then m.score_one else m.score_two end,
    case when m.player_one_id = auth.uid() then m.score_two else m.score_one end,
    case when m.winner_id = auth.uid() then 'WIN' else 'LOSS' end, m.finished_at
  from public.matches m join public.profiles opponent on opponent.id = case when m.player_one_id = auth.uid() then m.player_two_id else m.player_one_id end
  where auth.uid() is not null and auth.uid() in (m.player_one_id,m.player_two_id) and m.status='FINISHED'
  order by m.finished_at desc nulls last limit 30;
$$;
create or replace function public.competition_leaderboard()
returns table(rank bigint, display_name text, player_code text, trophies integer, wins integer, losses integer)
language sql security definer set search_path='' as $$
  select row_number() over(order by e.trophies desc,e.wins desc,e.updated_at asc), p.display_name,p.player_code,e.trophies,e.wins,e.losses
  from public.league_entries e join public.profiles p on p.id=e.player_id join public.league_seasons s on s.id=e.season_id
  where auth.uid() is not null and s.active order by e.trophies desc,e.wins desc,e.updated_at asc limit 50;
$$;
revoke all on function public.competition_my_history() from public, anon;
revoke all on function public.competition_leaderboard() from public, anon;
grant execute on function public.competition_my_history() to authenticated;
grant execute on function public.competition_leaderboard() to authenticated;
