begin;

-- Weekly friends league champion reward. The previous ISO week's standings
-- are recomputed server-side from authoritative match deltas; only the
-- caller's own circle (caller + ACCEPTED friends) is considered. A claim is
-- recorded once per player per week and coins flow through the wallet ledger.

create table if not exists public.weekly_league_claims (
  player_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  rank integer not null check (rank >= 1),
  coins integer not null check (coins > 0),
  created_at timestamptz not null default now(),
  primary key (player_id, week_start)
);

alter table public.weekly_league_claims enable row level security;
revoke all on table public.weekly_league_claims from public, anon, authenticated;

create or replace function public._weekly_league_result(p_player uuid, p_from timestamptz, p_to timestamptz)
returns table(member_id uuid, display_name text, trophy_delta integer, wins integer, member_rank integer)
language sql stable set search_path = '' as $$
  with member as (
    select p.id, p.display_name from public.profiles p where p.id = p_player
    union all
    select p.id, p.display_name
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = p_player then f.addressee_id else f.requester_id end
    where f.status = 'ACCEPTED'
      and p_player in (f.requester_id, f.addressee_id)
  ),
  weekly as (
    select
      member.id as member_id,
      coalesce(sum(coalesce(
        case when m.player_one_id = member.id then m.trophy_delta_one else m.trophy_delta_two end,
        0)), 0)::integer as trophy_delta,
      (count(*) filter (where m.winner_id = member.id))::integer as wins
    from member
    join public.matches m
      on member.id in (m.player_one_id, m.player_two_id)
     and m.status = 'FINISHED'
     and m.mode in ('QUICK', 'BLITZ', 'RANKED')
     and m.finished_at >= p_from
     and m.finished_at < p_to
    group by member.id
  )
  select
    member.id,
    member.display_name,
    coalesce(weekly.trophy_delta, 0),
    coalesce(weekly.wins, 0),
    (rank() over (order by coalesce(weekly.trophy_delta, 0) desc, coalesce(weekly.wins, 0) desc))::integer
  from member
  left join weekly on weekly.member_id = member.id;
$$;

create or replace function public.weekly_league_reward_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  week_end timestamptz := date_trunc('week', now());
  my_rank integer;
  my_delta integer;
  member_count integer;
  already boolean;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select count(*) into member_count from public._weekly_league_result(me, week_start::timestamptz, week_end);
  select r.member_rank, r.trophy_delta into my_rank, my_delta
  from public._weekly_league_result(me, week_start::timestamptz, week_end) r
  where r.member_id = me;

  already := exists (
    select 1 from public.weekly_league_claims
    where player_id = me and weekly_league_claims.week_start = weekly_league_reward_status.week_start
  );

  return jsonb_build_object(
    'week_start', week_start,
    'claimed', already,
    'claimable', (not already) and member_count > 1 and my_rank = 1 and my_delta > 0,
    'my_rank', my_rank,
    'my_delta', my_delta,
    'reward_coins', 100
  );
end
$$;

create or replace function public.weekly_league_claim()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  week_end timestamptz := date_trunc('week', now());
  my_rank integer;
  my_delta integer;
  member_count integer;
  balance integer;
  inserted boolean := false;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select coins into balance from public.profiles where id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select count(*) into member_count from public._weekly_league_result(me, week_start::timestamptz, week_end);
  select r.member_rank, r.trophy_delta into my_rank, my_delta
  from public._weekly_league_result(me, week_start::timestamptz, week_end) r
  where r.member_id = me;

  if member_count < 2 or my_rank is distinct from 1 or coalesce(my_delta, 0) <= 0 then
    raise exception 'NOT_WEEKLY_CHAMPION';
  end if;

  insert into public.weekly_league_claims(player_id, week_start, rank, coins)
  values (me, week_start, my_rank, 100)
  on conflict (player_id, week_start) do nothing
  returning true into inserted;

  if not coalesce(inserted, false) then
    return jsonb_build_object('granted', 0, 'balance', balance, 'claimed', true);
  end if;

  update public.profiles set coins = coins + 100 where id = me returning coins into balance;

  insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
  values (me, 100, 'WEEKLY_LEAGUE', week_start::text, balance, 'COIN');

  return jsonb_build_object('granted', 100, 'balance', balance, 'claimed', true);
end
$$;

revoke all on function public._weekly_league_result(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.weekly_league_reward_status() from public, anon;
revoke all on function public.weekly_league_claim() from public, anon;
grant execute on function public.weekly_league_reward_status() to authenticated;
grant execute on function public.weekly_league_claim() to authenticated;

commit;
