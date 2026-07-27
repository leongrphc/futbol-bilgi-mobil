begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.competition_match_summary_impl(
  p_match_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  persisted_match public.matches%rowtype;
  opponent_id uuid;
  opponent_name text;
  opponent_code text;
  total_round_count integer := 0;
  round_summaries jsonb := '[]'::jsonb;
begin
  if me is null then
    raise exception using
      errcode = 'P0001',
      message = 'MATCH_SUMMARY_NOT_AVAILABLE';
  end if;

  select match_row.*
  into persisted_match
  from public.matches match_row
  where match_row.id = p_match_id
    and match_row.status = 'FINISHED'
    and me in (match_row.player_one_id, match_row.player_two_id);

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MATCH_SUMMARY_NOT_AVAILABLE';
  end if;

  opponent_id := case
    when persisted_match.player_one_id = me then persisted_match.player_two_id
    else persisted_match.player_one_id
  end;

  select profile.display_name, profile.player_code
  into opponent_name, opponent_code
  from public.profiles profile
  where profile.id = opponent_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'MATCH_SUMMARY_NOT_AVAILABLE';
  end if;

  select count(*)::integer
  into total_round_count
  from public.rounds round_row
  where round_row.match_id = persisted_match.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'round_id', summary_round.round_id,
        'round_number', summary_round.round_number,
        'sudden_death', summary_round.sudden_death,
        'clubs', jsonb_build_array(
          jsonb_build_object(
            'id', summary_round.club_low_id,
            'name', summary_round.club_low_name
          ),
          jsonb_build_object(
            'id', summary_round.club_high_id,
            'name', summary_round.club_high_name
          )
        ),
        'outcome', case
          when summary_round.winner_id = me then 'ME'
          when summary_round.winner_id = opponent_id then 'OPPONENT'
          else 'NONE'
        end,
        'me', jsonb_build_object(
          'answered', summary_round.me_answered,
          'correct', summary_round.me_correct,
          'last_second', summary_round.me_last_second
        ),
        'opponent', jsonb_build_object(
          'answered', summary_round.opponent_answered,
          'correct', summary_round.opponent_correct,
          'last_second', summary_round.opponent_last_second
        ),
        'report_status', summary_round.report_status
      )
      order by summary_round.round_number, summary_round.sudden_death
    ),
    '[]'::jsonb
  )
  into round_summaries
  from (
    select
      round_row.id as round_id,
      round_row.round_number,
      round_row.sudden_death,
      round_row.club_low_id,
      club_low.name as club_low_name,
      round_row.club_high_id,
      club_high.name as club_high_name,
      round_row.winner_id,
      (me_submission.id is not null) as me_answered,
      coalesce(me_submission.is_correct, false) as me_correct,
      coalesce(me_submission.last_second, false) as me_last_second,
      (opponent_submission.id is not null) as opponent_answered,
      coalesce(opponent_submission.is_correct, false) as opponent_correct,
      coalesce(opponent_submission.last_second, false) as opponent_last_second,
      existing_report.status as report_status
    from public.rounds round_row
    join public.clubs club_low
      on club_low.id = round_row.club_low_id
    join public.clubs club_high
      on club_high.id = round_row.club_high_id
    left join public.submissions me_submission
      on me_submission.round_id = round_row.id
     and me_submission.player_id = me
    left join public.submissions opponent_submission
      on opponent_submission.round_id = round_row.id
     and opponent_submission.player_id = opponent_id
    left join lateral (
      select report.status
      from public.result_reports report
      where report.match_id = persisted_match.id
        and report.round_id = round_row.id
        and report.reporter_id = me
      order by report.created_at desc
      limit 1
    ) existing_report on true
    where round_row.match_id = persisted_match.id
    order by round_row.round_number desc, round_row.sudden_death desc
    limit 50
  ) summary_round;

  return jsonb_build_object(
    'match_id', persisted_match.id,
    'room_key', persisted_match.room_key,
    'mode', persisted_match.mode,
    'finished_at', persisted_match.finished_at,
    'outcome', case
      when persisted_match.winner_id = me then 'WIN'
      when persisted_match.winner_id = opponent_id then 'LOSS'
      else 'NONE'
    end,
    'score_for', case
      when persisted_match.player_one_id = me then persisted_match.score_one
      else persisted_match.score_two
    end,
    'score_against', case
      when persisted_match.player_one_id = me then persisted_match.score_two
      else persisted_match.score_one
    end,
    'trophy_delta', case
      when persisted_match.player_one_id = me then persisted_match.trophy_delta_one
      else persisted_match.trophy_delta_two
    end,
    'opponent', jsonb_build_object(
      'id', opponent_id,
      'display_name', opponent_name,
      'player_code', opponent_code
    ),
    'total_round_count', total_round_count,
    'truncated', total_round_count > 50,
    'rounds', round_summaries
  );
end
$$;

create or replace function public.competition_match_summary(
  p_match_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.competition_match_summary_impl(p_match_id)
$$;

create or replace function public.admin_result_report_context(
  p_limit integer default 50
)
returns table (
  report_id uuid,
  match_id uuid,
  round_id uuid,
  reporter_id uuid,
  reporter_name text,
  reporter_code text,
  reason_code text,
  user_detail text,
  report_status text,
  reported_at timestamptz,
  room_key text,
  match_mode text,
  match_status text,
  reporter_is_participant boolean,
  round_context_valid boolean,
  round_number integer,
  sudden_death boolean,
  club_low_id uuid,
  club_low_name text,
  club_high_id uuid,
  club_high_name text,
  has_submission boolean,
  raw_answer text,
  normalized_answer text,
  stored_correct boolean,
  recomputed_correct boolean,
  matched_player_names text[],
  matched_players_truncated boolean,
  validation_consistent boolean,
  last_second boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recent_reports as (
    select report.*
    from public.result_reports report
    order by report.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select
    report.id as report_id,
    report.match_id,
    report.round_id,
    report.reporter_id,
    reporter.display_name as reporter_name,
    reporter.player_code as reporter_code,
    report.reason_code,
    report.detail as user_detail,
    report.status as report_status,
    report.created_at as reported_at,
    persisted_match.room_key,
    persisted_match.mode as match_mode,
    persisted_match.status::text as match_status,
    coalesce(
      report.reporter_id = persisted_match.player_one_id
        or report.reporter_id = persisted_match.player_two_id,
      false
    ) as reporter_is_participant,
    (report.round_id is null or round_row.id is not null) as round_context_valid,
    round_row.round_number::integer,
    round_row.sudden_death,
    round_row.club_low_id,
    club_low.name as club_low_name,
    round_row.club_high_id,
    club_high.name as club_high_name,
    (reporter_submission.id is not null) as has_submission,
    reporter_submission.raw_answer,
    reporter_submission.normalized_answer,
    reporter_submission.is_correct as stored_correct,
    validation.recomputed_correct,
    validation.matched_player_names,
    validation.matched_players_truncated,
    case
      when reporter_submission.id is null then null
      else reporter_submission.is_correct = validation.recomputed_correct
    end as validation_consistent,
    reporter_submission.last_second
  from recent_reports report
  join public.matches persisted_match
    on persisted_match.id = report.match_id
  join public.profiles reporter
    on reporter.id = report.reporter_id
  left join public.rounds round_row
    on round_row.id = report.round_id
   and round_row.match_id = report.match_id
  left join public.clubs club_low
    on club_low.id = round_row.club_low_id
  left join public.clubs club_high
    on club_high.id = round_row.club_high_id
  left join public.submissions reporter_submission
    on reporter_submission.round_id = round_row.id
   and reporter_submission.player_id = report.reporter_id
  left join lateral (
    select
      (count(*) > 0) as recomputed_correct,
      coalesce(
        (array_agg(answer_match.game_name order by answer_match.game_name))[1:3],
        '{}'::text[]
      ) as matched_player_names,
      (count(*) > 3) as matched_players_truncated
    from (
      select distinct matched_player.game_name
      from public.club_pair_players pair_player
      join public.players matched_player
        on matched_player.id = pair_player.player_id
      join public.player_aliases matched_alias
        on matched_alias.player_id = matched_player.id
      where pair_player.football_data_version_id = persisted_match.football_data_version_id
        and pair_player.club_low_id = round_row.club_low_id
        and pair_player.club_high_id = round_row.club_high_id
        and pair_player.is_active
        and matched_alias.is_accepted_answer
        and matched_alias.normalized_alias = reporter_submission.normalized_answer
      order by matched_player.game_name
      limit 4
    ) answer_match
  ) validation on reporter_submission.id is not null
  order by report.created_at desc
$$;

revoke all on function private.competition_match_summary_impl(uuid)
  from public, anon, authenticated;
revoke all on function public.competition_match_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_result_report_context(integer)
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.competition_match_summary_impl(uuid)
  to authenticated;
grant execute on function public.competition_match_summary(uuid)
  to authenticated;
grant execute on function public.admin_result_report_context(integer)
  to service_role;

commit;
