-- Authenticated career profile statistics derived from authoritative match data.
-- The public Data API exposes a no-argument wrapper; identity always comes from auth.uid().

create index if not exists matches_player_one_competitive_finished_idx
  on public.matches (player_one_id, finished_at desc)
  where status = 'FINISHED' and mode in ('QUICK', 'BLITZ', 'RANKED', 'EVENT');

create index if not exists matches_player_two_competitive_finished_idx
  on public.matches (player_two_id, finished_at desc)
  where status = 'FINISHED' and mode in ('QUICK', 'BLITZ', 'RANKED', 'EVENT');

create or replace function private.player_profile_stats_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  with competitive_matches as (
    select
      m.id,
      m.mode,
      m.winner_id,
      m.finished_at,
      case when m.player_one_id = me then m.score_one else m.score_two end::integer as score_for,
      case when m.player_one_id = me then m.score_two else m.score_one end::integer as score_against,
      case when m.winner_id = me then 'WIN' else 'LOSS' end as outcome
    from public.matches m
    where m.status = 'FINISHED'
      and m.finished_at is not null
      and m.mode in ('QUICK', 'BLITZ', 'RANKED', 'EVENT')
      and me in (m.player_one_id, m.player_two_id)
  ),
  newest_results as (
    select cm.*,
      row_number() over (order by cm.finished_at desc, cm.id desc) as newest_position
    from competitive_matches cm
  ),
  oldest_results as (
    select cm.*,
      sum(case when cm.outcome = 'LOSS' then 1 else 0 end)
        over (order by cm.finished_at, cm.id) as streak_group
    from competitive_matches cm
  ),
  win_streaks as (
    select count(*)::integer as streak
    from oldest_results
    where outcome = 'WIN'
    group by streak_group
  ),
  career as (
    select
      count(*)::integer as played,
      count(*) filter (where outcome = 'WIN')::integer as wins,
      count(*) filter (where outcome = 'LOSS')::integer as losses,
      count(*) filter (where outcome = 'WIN' and score_against = 0)::integer as clean_sheet_wins,
      count(*) filter (where outcome = 'WIN' and score_for - score_against = 1)::integer as close_wins
    from competitive_matches
  ),
  current_streak as (
    select count(*)::integer as wins
    from newest_results n
    where n.outcome = 'WIN'
      and n.newest_position < coalesce(
        (select min(l.newest_position) from newest_results l where l.outcome = 'LOSS'),
        2147483647
      )
  ),
  mode_catalog(mode, sort_order) as (
    values ('QUICK'::text, 1), ('BLITZ'::text, 2), ('RANKED'::text, 3), ('EVENT'::text, 4)
  ),
  mode_stats as (
    select
      catalog.mode,
      catalog.sort_order,
      count(cm.id)::integer as played,
      count(cm.id) filter (where cm.outcome = 'WIN')::integer as wins,
      count(cm.id) filter (where cm.outcome = 'LOSS')::integer as losses
    from mode_catalog catalog
    left join competitive_matches cm on cm.mode = catalog.mode
    group by catalog.mode, catalog.sort_order
  ),
  favorite_mode as (
    select mode
    from mode_stats
    where played > 0
    order by played desc, wins desc, sort_order
    limit 1
  ),
  career_rounds as (
    select
      count(r.id)::integer as played,
      count(r.id) filter (where r.winner_id = me)::integer as won
    from public.rounds r
    join competitive_matches cm on cm.id = r.match_id
  ),
  career_answers as (
    select
      count(s.id)::integer as attempts,
      count(s.id) filter (where s.is_correct)::integer as correct,
      count(s.id) filter (where not s.is_correct)::integer as wrong,
      count(s.id) filter (where s.is_correct and s.last_second)::integer as last_second_correct
    from public.submissions s
    join public.rounds r on r.id = s.round_id
    join competitive_matches cm on cm.id = r.match_id
    where s.player_id = me
  ),
  collection_stats as (
    select
      (select count(*)::integer from public.player_album_entries a where a.player_id = me) as album_cards,
      (select count(*)::integer from public.club_mastery mastery where mastery.player_id = me and mastery.correct_count > 0) as clubs_mastered
  ),
  best_club as (
    select jsonb_build_object(
      'external_id', mastery.club_external_id,
      'name', coalesce(club.name, mastery.club_external_id),
      'correct', mastery.correct_count,
      'attempts', mastery.attempt_count,
      'accuracy', case when mastery.attempt_count = 0 then 0
        else round((mastery.correct_count::numeric * 100) / mastery.attempt_count)::integer end
    ) as value
    from public.club_mastery mastery
    left join public.clubs club on club.external_id = mastery.club_external_id
    where mastery.player_id = me and mastery.correct_count > 0
    order by mastery.correct_count desc,
      case when mastery.attempt_count = 0 then 0 else mastery.correct_count::numeric / mastery.attempt_count end desc,
      mastery.club_external_id
    limit 1
  ),
  achievement_stats as (
    select
      count(*)::integer as total,
      count(*) filter (where player_achievement.unlocked_at is not null)::integer as unlocked
    from public.achievement_definitions definition
    left join public.player_achievements player_achievement
      on player_achievement.player_id = me
     and player_achievement.achievement_code = definition.code
    where definition.active
  )
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'player_id', profile.id,
      'display_name', profile.display_name,
      'player_code', profile.player_code,
      'avatar_url', profile.avatar_url,
      'created_at', profile.created_at,
      'trophies', profile.trophies,
      'blitz_trophies', profile.blitz_trophies,
      'ranked_trophies', profile.ranked_trophies
    ),
    'career', jsonb_build_object(
      'played', career.played,
      'wins', career.wins,
      'losses', career.losses,
      'win_rate', case when career.played = 0 then 0
        else round((career.wins::numeric * 100) / career.played)::integer end,
      'current_win_streak', current_streak.wins,
      'best_win_streak', coalesce((select max(streak) from win_streaks), 0),
      'favorite_mode', (select mode from favorite_mode),
      'rounds_played', career_rounds.played,
      'rounds_won', career_rounds.won,
      'round_win_rate', case when career_rounds.played = 0 then 0
        else round((career_rounds.won::numeric * 100) / career_rounds.played)::integer end,
      'answer_attempts', career_answers.attempts,
      'correct_answers', career_answers.correct,
      'wrong_answers', career_answers.wrong,
      'answer_accuracy', case when career_answers.attempts = 0 then 0
        else round((career_answers.correct::numeric * 100) / career_answers.attempts)::integer end
    ),
    'records', jsonb_build_object(
      'clean_sheet_wins', career.clean_sheet_wins,
      'close_wins', career.close_wins,
      'last_second_correct', career_answers.last_second_correct
    ),
    'collections', jsonb_build_object(
      'album_cards', collection_stats.album_cards,
      'clubs_mastered', collection_stats.clubs_mastered,
      'best_club', (select value from best_club)
    ),
    'modes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mode', stats.mode,
        'played', stats.played,
        'wins', stats.wins,
        'losses', stats.losses,
        'win_rate', case when stats.played = 0 then 0
          else round((stats.wins::numeric * 100) / stats.played)::integer end,
        'trophies', case stats.mode
          when 'QUICK' then profile.trophies
          when 'BLITZ' then profile.blitz_trophies
          when 'RANKED' then profile.ranked_trophies
          else 0
        end
      ) order by stats.sort_order)
      from mode_stats stats
    ), '[]'::jsonb),
    'form', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', recent.id,
        'mode', recent.mode,
        'outcome', recent.outcome,
        'score_for', recent.score_for,
        'score_against', recent.score_against,
        'finished_at', recent.finished_at
      ) order by recent.newest_position)
      from newest_results recent
      where recent.newest_position <= 10
    ), '[]'::jsonb),
    'achievements', jsonb_build_object(
      'unlocked', achievement_stats.unlocked,
      'total', achievement_stats.total,
      'showcase', public._achievement_showcase_json(me)
    )
  ) into result
  from public.profiles profile
  cross join career
  cross join current_streak
  cross join career_rounds
  cross join career_answers
  cross join collection_stats
  cross join achievement_stats
  where profile.id = me;

  return result;
end
$$;

create or replace function public.player_profile_stats()
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select private.player_profile_stats_impl()
$$;

revoke all on function private.player_profile_stats_impl() from public, anon, authenticated;
revoke all on function public.player_profile_stats() from public, anon;
grant execute on function private.player_profile_stats_impl() to authenticated;
grant execute on function public.player_profile_stats() to authenticated;
