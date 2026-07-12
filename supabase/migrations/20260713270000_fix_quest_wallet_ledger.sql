-- Keep daily quest rewards compatible with the renamed dual-currency ledger.

create or replace function public.quests_claim(p_quest_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  day date := (timezone('utc', now()))::date;
  reward smallint;
  new_balance integer;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  perform public._quests_ensure_day(me, day);

  select p.coins into new_balance from public.profiles p where p.id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  update public.user_daily_quests u
  set claimed_at = now()
  from public.quest_definitions d
  where u.player_id = me
    and u.quest_day = day
    and u.quest_id = p_quest_id
    and u.quest_id = d.id
    and u.completed_at is not null
    and u.claimed_at is null
  returning d.reward_coins into reward;

  if reward is null then
    if exists (
      select 1 from public.user_daily_quests
      where player_id = me and quest_day = day and quest_id = p_quest_id and claimed_at is not null
    ) then
      return new_balance;
    end if;
    raise exception 'QUEST_NOT_CLAIMABLE';
  end if;

  update public.profiles set coins = coins + reward where id = me returning coins into new_balance;
  insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
  values (me, reward, 'DAILY_QUEST', day::text || ':' || p_quest_id, new_balance, 'COIN');
  return new_balance;
end;
$$;

revoke all on function public.quests_claim(text) from public, anon;
grant execute on function public.quests_claim(text) to authenticated;
