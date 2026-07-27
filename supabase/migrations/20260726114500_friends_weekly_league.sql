begin;

-- Weekly friends league: caller + ACCEPTED friends ranked by the sum of the
-- authoritative trophy deltas recorded on matches finished since the start of
-- the current ISO week (UTC). Aggregates only; no raw answers or per-match
-- rows leave the server. EVENT and friendly matches never count
-- because only trophy modes are whitelisted.
create or replace function public.social_friends_weekly_league()
returns table(
  player_id uuid,
  display_name text,
  player_code text,
  is_me boolean,
  weekly_trophy_delta integer,
  weekly_wins integer,
  weekly_losses integer,
  weekly_matches integer
)
language sql
security definer
set search_path = ''
as $$
  with member as (
    select p.id, p.display_name, p.player_code, true as is_me
    from public.profiles p
    where p.id = auth.uid()
    union all
    select p.id, p.display_name, p.player_code, false
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    where f.status = 'ACCEPTED'
      and auth.uid() in (f.requester_id, f.addressee_id)
  ),
  weekly as (
    select
      member.id as member_id,
      coalesce(sum(coalesce(
        case when m.player_one_id = member.id then m.trophy_delta_one else m.trophy_delta_two end,
        0)), 0)::integer as trophy_delta,
      (count(*) filter (where m.winner_id = member.id))::integer as wins,
      (count(*) filter (where m.winner_id is not null and m.winner_id <> member.id))::integer as losses,
      count(*)::integer as played
    from member
    join public.matches m
      on member.id in (m.player_one_id, m.player_two_id)
     and m.status = 'FINISHED'
     and m.mode in ('QUICK', 'BLITZ', 'RANKED')
     and m.finished_at >= date_trunc('week', now())
    group by member.id
  )
  select
    member.id,
    member.display_name,
    member.player_code,
    member.is_me,
    coalesce(weekly.trophy_delta, 0),
    coalesce(weekly.wins, 0),
    coalesce(weekly.losses, 0),
    coalesce(weekly.played, 0)
  from member
  left join weekly on weekly.member_id = member.id
  where auth.uid() is not null
  order by coalesce(weekly.trophy_delta, 0) desc, coalesce(weekly.wins, 0) desc, member.display_name asc;
$$;

revoke all on function public.social_friends_weekly_league() from public, anon;
grant execute on function public.social_friends_weekly_league() to authenticated;

commit;
