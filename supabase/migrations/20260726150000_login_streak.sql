begin;

-- Daily login streak with a 7-day reward cycle. Claims are server-computed
-- from UTC dates; coins flow through the immutable wallet ledger with a
-- per-day reference so double claims are impossible. Clients never write
-- streak state directly.

alter table public.wallet_transactions
  drop constraint if exists coin_transactions_reason_check;

alter table public.wallet_transactions
  add constraint coin_transactions_reason_check
  check (reason in (
    'DAILY_QUEST', 'COSMETIC_PURCHASE', 'ADMIN_GRANT',
    'LOGIN_STREAK', 'WEEKLY_LEAGUE', 'ALBUM_COLLECTION', 'TOURNAMENT_WIN'
  ));

create table if not exists public.login_streaks (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  current_length integer not null default 0 check (current_length >= 0),
  best_length integer not null default 0 check (best_length >= 0),
  last_claim_day date,
  updated_at timestamptz not null default now()
);

alter table public.login_streaks enable row level security;
revoke all on table public.login_streaks from public, anon, authenticated;

create or replace function public._streak_reward_for(p_day_index integer)
returns integer language sql immutable set search_path = '' as $$
  select (array[10, 15, 20, 25, 30, 40, 60])[least(greatest(p_day_index, 1), 7)];
$$;

create or replace function public.streak_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  row public.login_streaks%rowtype;
  next_length integer;
  day_index integer;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into row from public.login_streaks where player_id = me;

  if row.player_id is null or row.last_claim_day is null or row.last_claim_day < today - 1 then
    next_length := 1;
  elsif row.last_claim_day = today then
    next_length := row.current_length;
  else
    next_length := row.current_length + 1;
  end if;
  day_index := ((next_length - 1) % 7) + 1;

  return jsonb_build_object(
    'current_length', coalesce(row.current_length, 0),
    'best_length', coalesce(row.best_length, 0),
    'claimed_today', row.last_claim_day = today,
    'day_index', day_index,
    'reward_today', public._streak_reward_for(day_index),
    'rewards', to_jsonb(array[10, 15, 20, 25, 30, 40, 60])
  );
end
$$;

create or replace function public.streak_claim()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  row public.login_streaks%rowtype;
  balance integer;
  next_length integer;
  day_index integer;
  reward integer;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select coins into balance from public.profiles where id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.login_streaks(player_id)
  values (me)
  on conflict (player_id) do nothing;

  select * into row from public.login_streaks where player_id = me for update;

  if row.last_claim_day = today then
    return jsonb_build_object(
      'granted', 0,
      'balance', balance,
      'current_length', row.current_length,
      'day_index', ((row.current_length - 1) % 7) + 1
    );
  end if;

  if row.last_claim_day is null or row.last_claim_day < today - 1 then
    next_length := 1;
  else
    next_length := row.current_length + 1;
  end if;
  day_index := ((next_length - 1) % 7) + 1;
  reward := public._streak_reward_for(day_index);

  update public.login_streaks
  set current_length = next_length,
      best_length = greatest(best_length, next_length),
      last_claim_day = today,
      updated_at = now()
  where player_id = me;

  update public.profiles set coins = coins + reward where id = me returning coins into balance;

  insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
  values (me, reward, 'LOGIN_STREAK', today::text, balance, 'COIN');

  return jsonb_build_object(
    'granted', reward,
    'balance', balance,
    'current_length', next_length,
    'day_index', day_index
  );
end
$$;

revoke all on function public._streak_reward_for(integer) from public, anon, authenticated;
revoke all on function public.streak_status() from public, anon;
revoke all on function public.streak_claim() from public, anon;
grant execute on function public.streak_status() to authenticated;
grant execute on function public.streak_claim() to authenticated;

commit;
