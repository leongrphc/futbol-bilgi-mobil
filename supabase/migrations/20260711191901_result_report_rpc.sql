alter table public.result_reports drop constraint if exists result_reports_match_id_round_id_reporter_id_key;
create unique index if not exists result_reports_round_reporter_unique
  on public.result_reports(match_id,round_id,reporter_id) where round_id is not null;
create unique index if not exists result_reports_match_reporter_unique
  on public.result_reports(match_id,reporter_id) where round_id is null;

create or replace function public.submit_result_report(
  p_room_key text,
  p_round_ordinal integer default null,
  p_reason_code text default 'OTHER',
  p_detail text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  reporter uuid := auth.uid();
  persisted_match_id uuid;
  persisted_round_id uuid;
  report_id uuid;
begin
  if reporter is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_reason_code not in ('WRONG_RESULT','OFFENSIVE_CONTENT','OTHER') then raise exception 'INVALID_REASON'; end if;
  if p_detail is not null and length(p_detail) > 500 then raise exception 'DETAIL_TOO_LONG'; end if;

  select id into strict persisted_match_id
  from public.matches
  where room_key=trim(p_room_key) and reporter in (player_one_id,player_two_id);

  if p_round_ordinal is not null then
    select id into strict persisted_round_id from public.rounds
    where match_id=persisted_match_id and round_number=p_round_ordinal;
  end if;

  insert into public.result_reports(match_id,round_id,reporter_id,reason_code,detail)
  values(persisted_match_id,persisted_round_id,reporter,p_reason_code,nullif(trim(p_detail),''))
  on conflict do nothing
  returning id into report_id;

  if report_id is null then
    select id into strict report_id from public.result_reports
    where match_id=persisted_match_id and reporter_id=reporter and round_id is not distinct from persisted_round_id;
  end if;
  return report_id;
end $$;

grant select,insert on table public.result_reports to authenticated;
revoke all on function public.submit_result_report(text,integer,text,text) from public,anon;
grant execute on function public.submit_result_report(text,integer,text,text) to authenticated;
