begin;

-- System-generated notifications: streak-at-risk reminder and weekly friends
-- league reward reminder, plus the tournament invite type used by friend
-- tournaments. Rows reuse the existing app_notifications pipeline (unique
-- recipient/type/source_key, AFTER INSERT push dispatch webhook). The enqueue
-- functions are service-role only and are driven by the Worker cron.

alter table public.app_notifications
  drop constraint if exists app_notifications_type_check;

alter table public.app_notifications
  add constraint app_notifications_type_check
  check (type in (
    'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'FRIEND_MATCH_INVITE', 'REMATCH_OFFER',
    'STREAK_REMINDER', 'WEEKLY_REWARD_READY', 'TOURNAMENT_INVITE'
  ));

create or replace function public.system_enqueue_streak_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date := (timezone('utc', now()))::date;
  inserted integer := 0;
begin
  insert into public.app_notifications(recipient_id, actor_id, type, source_key, expires_at)
  select
    s.player_id,
    null,
    'STREAK_REMINDER',
    'streak:' || today::text,
    (today + 1)::timestamptz
  from public.login_streaks s
  where s.current_length >= 3
    and s.last_claim_day = today - 1
    and exists (
      select 1 from public.push_device_tokens t
      where t.user_id = s.player_id and t.disabled_at is null
    )
  on conflict (recipient_id, type, source_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end
$$;

create or replace function public.system_enqueue_weekly_reward_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  week_start date := (date_trunc('week', now()) - interval '7 days')::date;
  week_end timestamptz := date_trunc('week', now());
  inserted integer := 0;
begin
  insert into public.app_notifications(recipient_id, actor_id, type, source_key, expires_at)
  select
    candidate.player_id,
    null,
    'WEEKLY_REWARD_READY',
    'weeklylg:' || week_start::text,
    date_trunc('week', now()) + interval '7 days'
  from (
    select distinct p.id as player_id
    from public.profiles p
    join public.friendships f
      on f.status = 'ACCEPTED' and p.id in (f.requester_id, f.addressee_id)
  ) candidate
  join lateral (
    select r.member_rank, r.trophy_delta
    from public._weekly_league_result(candidate.player_id, week_start::timestamptz, week_end) r
    where r.member_id = candidate.player_id
  ) mine on true
  where mine.member_rank = 1
    and mine.trophy_delta > 0
    and not exists (
      select 1 from public.weekly_league_claims c
      where c.player_id = candidate.player_id and c.week_start = week_start
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

revoke all on function public.system_enqueue_streak_reminders() from public, anon, authenticated;
revoke all on function public.system_enqueue_weekly_reward_reminders() from public, anon, authenticated;
grant execute on function public.system_enqueue_streak_reminders() to service_role;
grant execute on function public.system_enqueue_weekly_reward_reminders() to service_role;

commit;
