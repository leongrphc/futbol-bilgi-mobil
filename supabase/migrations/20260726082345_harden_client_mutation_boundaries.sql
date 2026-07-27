begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Friendship state changes must go through the social RPCs, which enforce
-- block checks, request direction and recipient consent. The original FOR ALL
-- policy allowed a requester to update their own PENDING row to ACCEPTED.
drop policy if exists own_friendships on public.friendships;
drop policy if exists friendships_participant_read on public.friendships;

create policy friendships_participant_read
on public.friendships
for select
to authenticated
using (
  (select auth.uid()) in (requester_id, addressee_id)
);

revoke all on table public.friendships from anon, authenticated;
grant select on table public.friendships to authenticated;

-- Result-report writes must also go through their validated RPC. Keep database
-- constraints as defense in depth for service-role/admin writes.
alter table public.result_reports
  drop constraint if exists result_reports_reason_code_check,
  drop constraint if exists result_reports_detail_length_check,
  drop constraint if exists result_reports_status_check;

alter table public.result_reports
  add constraint result_reports_reason_code_check
    check (reason_code in ('WRONG_RESULT', 'OFFENSIVE_CONTENT', 'OTHER')),
  add constraint result_reports_detail_length_check
    check (detail is null or char_length(detail) <= 500),
  add constraint result_reports_status_check
    check (status in ('OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED'));

drop policy if exists own_reports on public.result_reports;
drop policy if exists result_reports_reporter_read on public.result_reports;
drop policy if exists result_reports_participant_insert on public.result_reports;

create policy result_reports_reporter_read
on public.result_reports
for select
to authenticated
using (
  reporter_id = (select auth.uid())
);

create or replace function public.submit_result_report(
  p_room_key text,
  p_round_ordinal integer default null,
  p_reason_code text default 'OTHER',
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter uuid := auth.uid();
  persisted_match_id uuid;
  persisted_round_id uuid;
  report_id uuid;
begin
  if reporter is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if p_reason_code not in ('WRONG_RESULT', 'OFFENSIVE_CONTENT', 'OTHER') then
    raise exception 'INVALID_REASON';
  end if;
  if p_detail is not null and length(p_detail) > 500 then
    raise exception 'DETAIL_TOO_LONG';
  end if;

  select id
  into strict persisted_match_id
  from public.matches
  where room_key = trim(p_room_key)
    and reporter in (player_one_id, player_two_id);

  if p_round_ordinal is not null then
    select id
    into strict persisted_round_id
    from public.rounds
    where match_id = persisted_match_id
      and round_number = p_round_ordinal;
  end if;

  insert into public.result_reports (
    match_id,
    round_id,
    reporter_id,
    reason_code,
    detail
  )
  values (
    persisted_match_id,
    persisted_round_id,
    reporter,
    p_reason_code,
    nullif(trim(p_detail), '')
  )
  on conflict do nothing
  returning id into report_id;

  if report_id is null then
    select id
    into strict report_id
    from public.result_reports
    where match_id = persisted_match_id
      and reporter_id = reporter
      and round_id is not distinct from persisted_round_id;
  end if;

  return report_id;
end
$$;

revoke all on table public.result_reports from anon, authenticated;
grant select on table public.result_reports to authenticated;

revoke all on function public.submit_result_report(text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_result_report(text, integer, text, text)
  to authenticated;

commit;
