begin;

-- Fix plpgsql variable/column name collisions around week_start in the
-- weekly reward functions. Behavior is unchanged.

create or replace function public.weekly_league_reward_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  v_week_end timestamptz := date_trunc('week', now());
  my_rank integer;
  my_delta integer;
  member_count integer;
  already boolean;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select count(*) into member_count from public._weekly_league_result(me, v_week_start::timestamptz, v_week_end);
  select r.member_rank, r.trophy_delta into my_rank, my_delta
  from public._weekly_league_result(me, v_week_start::timestamptz, v_week_end) r
  where r.member_id = me;

  already := exists (
    select 1 from public.weekly_league_claims c
    where c.player_id = me and c.week_start = v_week_start
  );

  return jsonb_build_object(
    'week_start', v_week_start,
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
  v_week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  v_week_end timestamptz := date_trunc('week', now());
  my_rank integer;
  my_delta integer;
  member_count integer;
  balance integer;
  inserted boolean := false;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select coins into balance from public.profiles where id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select count(*) into member_count from public._weekly_league_result(me, v_week_start::timestamptz, v_week_end);
  select r.member_rank, r.trophy_delta into my_rank, my_delta
  from public._weekly_league_result(me, v_week_start::timestamptz, v_week_end) r
  where r.member_id = me;

  if member_count < 2 or my_rank is distinct from 1 or coalesce(my_delta, 0) <= 0 then
    raise exception 'NOT_WEEKLY_CHAMPION';
  end if;

  insert into public.weekly_league_claims(player_id, week_start, rank, coins)
  values (me, v_week_start, my_rank, 100)
  on conflict (player_id, week_start) do nothing
  returning true into inserted;

  if not coalesce(inserted, false) then
    return jsonb_build_object('granted', 0, 'balance', balance, 'claimed', true);
  end if;

  update public.profiles set coins = coins + 100 where id = me returning coins into balance;

  insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
  values (me, 100, 'WEEKLY_LEAGUE', v_week_start::text, balance, 'COIN');

  return jsonb_build_object('granted', 100, 'balance', balance, 'claimed', true);
end
$$;

create or replace function public.system_enqueue_weekly_reward_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  v_week_end timestamptz := date_trunc('week', now());
  inserted integer := 0;
begin
  insert into public.app_notifications(recipient_id, actor_id, type, source_key, expires_at)
  select
    candidate.player_id,
    null,
    'WEEKLY_REWARD_READY',
    'weeklylg:' || v_week_start::text,
    date_trunc('week', now()) + interval '7 days'
  from (
    select distinct p.id as player_id
    from public.profiles p
    join public.friendships f
      on f.status = 'ACCEPTED' and p.id in (f.requester_id, f.addressee_id)
  ) candidate
  join lateral (
    select r.member_rank, r.trophy_delta
    from public._weekly_league_result(candidate.player_id, v_week_start::timestamptz, v_week_end) r
    where r.member_id = candidate.player_id
  ) mine on true
  where mine.member_rank = 1
    and mine.trophy_delta > 0
    and not exists (
      select 1 from public.weekly_league_claims c
      where c.player_id = candidate.player_id and c.week_start = v_week_start
    )
    and exists (
      select 1 from public.push_device_tokens t
      where t.user_id = candidate.player_id and t.disabled_at is null
    )
  on conflict (recipient_id, type, source_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end
$$;

commit;
