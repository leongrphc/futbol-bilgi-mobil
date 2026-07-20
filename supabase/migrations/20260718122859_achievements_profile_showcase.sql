-- Competitive achievements and a three-slot public profile showcase.
-- Progress is derived exclusively from service-role persisted match data.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.submissions
  add column if not exists last_second boolean not null default false;

create table public.achievement_definitions (
  code text primary key,
  title_tr text not null,
  title_en text not null,
  description_tr text not null,
  description_en text not null,
  reward_title_tr text not null,
  reward_title_en text not null,
  glyph text not null,
  accent text not null check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  target integer not null check (target > 0),
  sort_order smallint not null unique,
  active boolean not null default true
);

create table public.player_achievements (
  player_id uuid not null references public.profiles(id) on delete cascade,
  achievement_code text not null references public.achievement_definitions(code) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, achievement_code)
);

create table public.player_achievement_showcase (
  player_id uuid not null,
  slot smallint not null check (slot between 1 and 3),
  achievement_code text not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, slot),
  unique (player_id, achievement_code),
  foreign key (player_id, achievement_code)
    references public.player_achievements(player_id, achievement_code)
    on delete cascade
);

create table public.achievement_derby_pairs (
  club_a_external text not null,
  club_b_external text not null,
  label text not null,
  primary key (club_a_external, club_b_external),
  check (club_a_external < club_b_external)
);

create index player_achievement_showcase_code_idx
  on public.player_achievement_showcase (achievement_code);
create index submissions_player_correct_round_idx
  on public.submissions (player_id, round_id) where is_correct;

alter table public.achievement_definitions enable row level security;
alter table public.player_achievements enable row level security;
alter table public.player_achievement_showcase enable row level security;
alter table public.achievement_derby_pairs enable row level security;

-- Tables are intentionally not exposed directly to authenticated clients.
-- The two RPCs below are the only player-facing read/write surface.
revoke all on public.achievement_definitions from anon, authenticated;
revoke all on public.player_achievements from anon, authenticated;
revoke all on public.player_achievement_showcase from anon, authenticated;
revoke all on public.achievement_derby_pairs from anon, authenticated;

insert into public.achievement_definitions
  (code, title_tr, title_en, description_tr, description_en, reward_title_tr, reward_title_en, glyph, accent, target, sort_order)
values
  ('LAST_SECOND', 'Son Saniye', 'Last Second', 'Sürenin son 1 saniyesinde doğru cevap ver.', 'Give a correct answer in the final second.', 'Soğukkanlı', 'Ice Cold', '⌁', '#FFB454', 1, 10),
  ('TRAVELER', 'Gezgin', 'Globetrotter', '20 farklı ligde doğru bağlantı kur.', 'Find correct links across 20 different leagues.', 'Dünya Turu', 'World Tour', '◎', '#59D5A6', 20, 20),
  ('UNBEATEN', 'Yenilmez', 'Unbeaten', 'Arka arkaya 5 rekabetçi maç kazan.', 'Win 5 competitive matches in a row.', 'Yenilmez', 'Unbeaten', 'Ⅴ', '#F3C969', 5, 30),
  ('DERBY_EXPERT', 'Derbi Uzmanı', 'Derby Expert', 'Derbi eşleşmelerinde 10 doğru cevap ver.', 'Give 10 correct answers in derby matchups.', 'Derbi Uzmanı', 'Derby Expert', '◇', '#FF716C', 10, 40),
  ('COMEBACK', 'Geri Dönüş', 'Comeback', '0–2 geriden gelip rekabetçi maç kazan.', 'Come back from 0–2 down to win a competitive match.', 'Asla Pes Etme', 'Never Give Up', '↗', '#B896FF', 1, 50),
  ('FLAWLESS', 'Kusursuz Maç', 'Flawless Match', 'Yanlış cevap vermeden rekabetçi maç kazan.', 'Win a competitive match without a wrong answer.', 'Kusursuz', 'Flawless', '✓', '#72C7FF', 1, 60)
on conflict (code) do update set
  title_tr = excluded.title_tr,
  title_en = excluded.title_en,
  description_tr = excluded.description_tr,
  description_en = excluded.description_en,
  reward_title_tr = excluded.reward_title_tr,
  reward_title_en = excluded.reward_title_en,
  glyph = excluded.glyph,
  accent = excluded.accent,
  target = excluded.target,
  sort_order = excluded.sort_order,
  active = true;

insert into public.achievement_derby_pairs (club_a_external, club_b_external, label)
values
  ('besiktas', 'fenerbahce', 'İstanbul derbisi'),
  ('besiktas', 'galatasaray', 'İstanbul derbisi'),
  ('fenerbahce', 'galatasaray', 'Kıtalararası derbi'),
  ('arsenal', 'tottenham', 'North London derby'),
  ('barcelona', 'real-madrid', 'El Clásico'),
  ('ac-milan', 'inter-milan', 'Derby della Madonnina'),
  ('everton', 'liverpool', 'Merseyside derby'),
  ('manchester-city', 'manchester-united', 'Manchester derby')
on conflict (club_a_external, club_b_external) do update set label = excluded.label;

create or replace function public._achievement_set_progress(
  p_player uuid,
  p_code text,
  p_progress integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare achievement_target integer;
begin
  if p_player is null or p_progress < 0 then return; end if;
  select d.target into achievement_target
  from public.achievement_definitions d
  where d.code = p_code and d.active;
  if achievement_target is null then return; end if;

  insert into public.player_achievements(player_id, achievement_code, progress, unlocked_at)
  values (
    p_player,
    p_code,
    p_progress,
    case when p_progress >= achievement_target then now() else null end
  )
  on conflict (player_id, achievement_code) do update
  set progress = greatest(public.player_achievements.progress, excluded.progress),
      unlocked_at = case
        when public.player_achievements.unlocked_at is not null then public.player_achievements.unlocked_at
        when greatest(public.player_achievements.progress, excluded.progress) >= achievement_target then now()
        else null
      end,
      updated_at = now();
end
$$;

create or replace function public._achievement_showcase_json(p_player uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', d.code,
    'title_tr', d.title_tr,
    'title_en', d.title_en,
    'reward_title_tr', d.reward_title_tr,
    'reward_title_en', d.reward_title_en,
    'glyph', d.glyph,
    'accent', d.accent,
    'slot', s.slot
  ) order by s.slot), '[]'::jsonb)
  from public.player_achievement_showcase s
  join public.player_achievements a
    on a.player_id = s.player_id
   and a.achievement_code = s.achievement_code
   and a.unlocked_at is not null
  join public.achievement_definitions d on d.code = s.achievement_code and d.active
  where s.player_id = p_player
$$;

create or replace function public._achievements_evaluate_player(
  p_player uuid,
  p_match uuid,
  p_match_winner uuid,
  p_match_loser uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  leagues_found integer := 0;
  derby_answers integer := 0;
  best_win_streak integer := 0;
  scored_comeback boolean := false;
  scored_flawless boolean := false;
begin
  if p_player is null then return; end if;

  if exists (
    select 1
    from public.submissions s
    join public.rounds r on r.id = s.round_id
    where r.match_id = p_match and s.player_id = p_player
      and s.is_correct and s.last_second
  ) then
    perform public._achievement_set_progress(p_player, 'LAST_SECOND', 1);
  end if;

  select count(distinct c.league)::integer into leagues_found
  from public.submissions s
  join public.rounds r on r.id = s.round_id
  join public.matches m on m.id = r.match_id and m.mode in ('QUICK', 'BLITZ', 'RANKED', 'EVENT')
  cross join lateral (values (r.club_low_id), (r.club_high_id)) as rc(club_id)
  join public.clubs c on c.id = rc.club_id
  where s.player_id = p_player and s.is_correct
    and c.league is not null and length(trim(c.league)) > 0;
  perform public._achievement_set_progress(p_player, 'TRAVELER', leagues_found);

  select count(*)::integer into derby_answers
  from public.submissions s
  join public.rounds r on r.id = s.round_id
  join public.matches m on m.id = r.match_id and m.mode in ('QUICK', 'BLITZ', 'RANKED', 'EVENT')
  join public.clubs ca on ca.id = r.club_low_id
  join public.clubs cb on cb.id = r.club_high_id
  join public.achievement_derby_pairs d
    on d.club_a_external = least(ca.external_id, cb.external_id)
   and d.club_b_external = greatest(ca.external_id, cb.external_id)
  where s.player_id = p_player and s.is_correct;
  perform public._achievement_set_progress(p_player, 'DERBY_EXPERT', derby_answers);

  with ordered_results as (
    select m.winner_id,
      sum(case when m.winner_id <> p_player then 1 else 0 end)
        over (order by m.finished_at, m.id) as streak_group
    from public.matches m
    where p_player in (m.player_one_id, m.player_two_id)
      and m.status = 'FINISHED'
      and m.mode in ('QUICK', 'BLITZ', 'RANKED', 'EVENT')
  ), win_streaks as (
    select count(*)::integer as streak
    from ordered_results
    where winner_id = p_player
    group by streak_group
  )
  select coalesce(max(streak), 0) into best_win_streak from win_streaks;
  perform public._achievement_set_progress(p_player, 'UNBEATEN', best_win_streak);

  if p_match_winner = p_player then
    select count(*) = 2 into scored_comeback
    from (
      select r.winner_id
      from public.rounds r
      where r.match_id = p_match and r.winner_id is not null
      order by r.round_number
      limit 2
    ) first_scores
    where first_scores.winner_id = p_match_loser;

    select exists (
      select 1 from public.submissions s
      join public.rounds r on r.id = s.round_id
      where r.match_id = p_match and s.player_id = p_player and s.is_correct
    ) and not exists (
      select 1 from public.submissions s
      join public.rounds r on r.id = s.round_id
      where r.match_id = p_match and s.player_id = p_player and not s.is_correct
    ) into scored_flawless;

    if scored_comeback then
      perform public._achievement_set_progress(p_player, 'COMEBACK', 1);
    end if;
    if scored_flawless then
      perform public._achievement_set_progress(p_player, 'FLAWLESS', 1);
    end if;
  end if;
end
$$;

create or replace function public._achievements_on_match_completed(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare persisted_match public.matches%rowtype; loser uuid;
begin
  select * into persisted_match from public.matches where id = p_match;
  if persisted_match.id is null
    or persisted_match.status <> 'FINISHED'
    or persisted_match.winner_id is null
    or persisted_match.mode not in ('QUICK', 'BLITZ', 'RANKED', 'EVENT') then
    return;
  end if;
  loser := case when persisted_match.winner_id = persisted_match.player_one_id
    then persisted_match.player_two_id else persisted_match.player_one_id end;
  perform public._achievements_evaluate_player(persisted_match.player_one_id, p_match, persisted_match.winner_id, loser);
  perform public._achievements_evaluate_player(persisted_match.player_two_id, p_match, persisted_match.winner_id, loser);
end
$$;

create or replace function private.achievements_mine_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select jsonb_build_object(
    'unlocked_count', count(*) filter (where a.unlocked_at is not null),
    'total_count', count(*),
    'showcase', public._achievement_showcase_json(me),
    'achievements', coalesce(jsonb_agg(jsonb_build_object(
      'code', d.code,
      'title_tr', d.title_tr,
      'title_en', d.title_en,
      'description_tr', d.description_tr,
      'description_en', d.description_en,
      'reward_title_tr', d.reward_title_tr,
      'reward_title_en', d.reward_title_en,
      'glyph', d.glyph,
      'accent', d.accent,
      'target', d.target,
      'progress', least(coalesce(a.progress, 0), d.target),
      'unlocked_at', a.unlocked_at,
      'showcase_slot', s.slot
    ) order by d.sort_order), '[]'::jsonb)
  ) into result
  from public.achievement_definitions d
  left join public.player_achievements a
    on a.player_id = me and a.achievement_code = d.code
  left join public.player_achievement_showcase s
    on s.player_id = me and s.achievement_code = d.code
  where d.active;
  return result;
end
$$;

create or replace function private.achievements_set_showcase_impl(p_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := auth.uid(); requested text[] := coalesce(p_codes, array[]::text[]); allowed_count integer;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if cardinality(requested) > 3 then raise exception 'SHOWCASE_LIMIT_EXCEEDED'; end if;
  if exists (select 1 from unnest(requested) as item(code) where item.code is null or length(trim(item.code)) = 0) then
    raise exception 'INVALID_ACHIEVEMENT';
  end if;
  if (select count(distinct item.code) from unnest(requested) as item(code)) <> cardinality(requested) then
    raise exception 'DUPLICATE_ACHIEVEMENT';
  end if;
  select count(*) into allowed_count
  from public.player_achievements a
  where a.player_id = me and a.achievement_code = any(requested) and a.unlocked_at is not null;
  if allowed_count <> cardinality(requested) then raise exception 'ACHIEVEMENT_NOT_UNLOCKED'; end if;

  delete from public.player_achievement_showcase where player_id = me;
  insert into public.player_achievement_showcase(player_id, slot, achievement_code)
  select me, item.ordinality::smallint, item.code
  from unnest(requested) with ordinality as item(code, ordinality);
  return public._achievement_showcase_json(me);
end
$$;

-- Public Data API wrappers stay SECURITY INVOKER. Privileged access is isolated
-- in the non-exposed private schema and both implementations derive identity
-- from auth.uid() instead of accepting a player id.
create or replace function public.achievements_mine()
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select private.achievements_mine_impl()
$$;

create or replace function public.achievements_set_showcase(p_codes text[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.achievements_set_showcase_impl(p_codes)
$$;

-- Add showcase badges to the authenticated public card used by friends/profile views.
create or replace function public.player_public_card(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  profile_row public.profiles%rowtype;
  form text[] := array[]::text[];
  rec record;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_player_id is null then raise exception 'INVALID_PLAYER'; end if;
  select * into profile_row from public.profiles where id = p_player_id;
  if profile_row.id is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  for rec in
    select case when m.winner_id = p_player_id then 'W' else 'L' end as outcome
    from public.matches m
    where m.status = 'FINISHED' and p_player_id in (m.player_one_id, m.player_two_id)
    order by m.finished_at desc nulls last limit 5
  loop
    form := array_append(form, rec.outcome);
  end loop;
  return jsonb_build_object(
    'player_id', profile_row.id,
    'display_name', profile_row.display_name,
    'player_code', profile_row.player_code,
    'trophies', profile_row.trophies,
    'form', form,
    'achievements', public._achievement_showcase_json(profile_row.id)
  );
end
$$;

-- Service-role bulk cards for the READY phase. No answer data is exposed.
create or replace function public.match_player_cards(p_player_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb := '[]'::jsonb;
  pid uuid;
  card jsonb;
  form text[];
  rec record;
  profile_row public.profiles%rowtype;
begin
  if p_player_ids is null then return result; end if;
  foreach pid in array p_player_ids loop
    select * into profile_row from public.profiles where id = pid;
    if profile_row.id is null then continue; end if;
    form := array[]::text[];
    for rec in
      select case when m.winner_id = pid then 'W' else 'L' end as outcome
      from public.matches m
      where m.status = 'FINISHED' and pid in (m.player_one_id, m.player_two_id)
      order by m.finished_at desc nulls last limit 5
    loop
      form := array_append(form, rec.outcome);
    end loop;
    card := jsonb_build_object(
      'player_id', profile_row.id,
      'display_name', profile_row.display_name,
      'player_code', profile_row.player_code,
      'trophies', profile_row.trophies,
      'form', to_jsonb(form),
      'achievements', public._achievement_showcase_json(profile_row.id)
    );
    result := result || jsonb_build_array(card);
  end loop;
  return result;
end
$$;

-- Preserve album, quest and mastery effects while recording the authoritative
-- final-second flag sent by the match server.
create or replace function public.match_persist_round(
  p_room_key text, p_round_ordinal integer, p_is_sudden_death boolean, p_club_a_external text, p_club_b_external text,
  p_round_winner uuid, p_round_submissions jsonb, p_scores jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  persisted_match public.matches%rowtype;
  club_a uuid;
  club_b uuid;
  club_low uuid;
  club_high uuid;
  persisted_round uuid;
  item jsonb;
  submitter uuid;
  is_correct boolean;
  normalized text;
  football_player uuid;
  inserted_count integer;
begin
  if p_round_ordinal < 1 then raise exception 'INVALID_ROUND_ORDINAL'; end if;
  select * into strict persisted_match from public.matches where public.matches.room_key = p_room_key for update;
  select id into strict club_a from public.clubs where external_id = p_club_a_external;
  select id into strict club_b from public.clubs where external_id = p_club_b_external;
  club_low := least(club_a, club_b);
  club_high := greatest(club_a, club_b);
  insert into public.rounds(match_id, round_number, sudden_death, club_low_id, club_high_id, winner_id, finished_at)
  values (persisted_match.id, p_round_ordinal, p_is_sudden_death, club_low, club_high, p_round_winner, now())
  on conflict (match_id, round_number) do update set winner_id = excluded.winner_id, finished_at = excluded.finished_at
  returning id into persisted_round;

  for item in select value from jsonb_array_elements(coalesce(p_round_submissions, '[]'::jsonb)) loop
    begin
      submitter := (item->>'player_id')::uuid;
    exception when others then
      continue;
    end;
    is_correct := coalesce((item->>'is_correct')::boolean, false);
    normalized := item->>'normalized_answer';
    inserted_count := 0;
    insert into public.submissions(
      round_id, player_id, raw_answer, normalized_answer, is_correct, last_second,
      received_at, submission_sequence, client_command_id
    )
    values (
      persisted_round,
      submitter,
      item->>'raw_answer',
      normalized,
      is_correct,
      coalesce((item->>'last_second')::boolean, false),
      to_timestamp((item->>'received_at_ms')::double precision / 1000),
      coalesce((item->>'sequence')::bigint, 0),
      p_room_key || ':' || p_round_ordinal || ':' || (item->>'player_id')
    )
    on conflict (round_id, player_id) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count > 0 then
      perform public._mastery_bump(submitter, p_club_a_external, is_correct);
      perform public._mastery_bump(submitter, p_club_b_external, is_correct);
      if is_correct then
        select pa.player_id into football_player
        from public.player_aliases pa
        join public.club_pair_players cpp
          on cpp.player_id = pa.player_id
         and cpp.football_data_version_id = persisted_match.football_data_version_id
         and cpp.is_active
         and cpp.club_low_id = club_low
         and cpp.club_high_id = club_high
        where pa.is_accepted_answer
          and pa.normalized_alias = normalized
        order by pa.player_id
        limit 1;
        if football_player is not null then
          insert into public.player_album_entries(player_id, football_player_id, first_match_id)
          values (submitter, football_player, persisted_match.id)
          on conflict (player_id, football_player_id) do update
            set unlock_count = public.player_album_entries.unlock_count + 1,
                last_unlocked_at = now();
        end if;
        perform public._quests_bump(submitter, 'CORRECT_ANSWER', 1);
      end if;
    end if;
  end loop;

  update public.matches
  set score_one = coalesce((p_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_scores->>player_two_id::text)::smallint, score_two)
  where id = persisted_match.id;
  return persisted_round;
end
$$;

-- Preserve the latest three-mode ladder behavior and evaluate achievements only
-- on the first idempotent transition to FINISHED.
create or replace function public.match_persist_finish(
  p_room_key text,
  p_match_winner uuid,
  p_final_scores jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  persisted_match public.matches%rowtype;
  completed_now boolean := false;
  loser uuid;
  season uuid;
begin
  select * into strict persisted_match from public.matches where public.matches.room_key = p_room_key for update;
  if p_match_winner not in (persisted_match.player_one_id, persisted_match.player_two_id) then
    raise exception 'INVALID_MATCH_WINNER';
  end if;
  update public.matches
  set status = 'FINISHED', winner_id = p_match_winner,
      score_one = coalesce((p_final_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_final_scores->>player_two_id::text)::smallint, score_two),
      finished_at = coalesce(finished_at, now())
  where id = persisted_match.id and status <> 'FINISHED'
  returning true into completed_now;

  if completed_now then
    perform public._quests_bump(persisted_match.player_one_id, 'MATCH_FINISH', 1);
    perform public._quests_bump(persisted_match.player_two_id, 'MATCH_FINISH', 1);
    loser := case when p_match_winner = persisted_match.player_one_id
      then persisted_match.player_two_id else persisted_match.player_one_id end;

    if persisted_match.mode in ('QUICK', 'BLITZ', 'RANKED') then
      perform public._quests_bump(persisted_match.player_one_id, 'SOCIAL_TOUCH', 1);
      perform public._quests_bump(persisted_match.player_two_id, 'SOCIAL_TOUCH', 1);
    end if;

    if persisted_match.mode = 'QUICK' then
      update public.profiles set trophies = trophies + 20 where id = p_match_winner;
      update public.profiles set trophies = greatest(0, trophies - 8) where id = loser;
      select id into season from public.league_seasons where active order by starts_at desc limit 1;
      if season is not null then
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, p_match_winner, 20, 1, 0)
        on conflict (season_id, player_id) do update
          set trophies = public.league_entries.trophies + 20, wins = public.league_entries.wins + 1, updated_at = now();
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, loser, 0, 0, 1)
        on conflict (season_id, player_id) do update
          set trophies = greatest(0, public.league_entries.trophies - 8), losses = public.league_entries.losses + 1, updated_at = now();
      end if;
    elsif persisted_match.mode = 'BLITZ' then
      update public.profiles set blitz_trophies = blitz_trophies + 15 where id = p_match_winner;
      update public.profiles set blitz_trophies = greatest(0, blitz_trophies - 5) where id = loser;
    elsif persisted_match.mode = 'RANKED' then
      update public.profiles set ranked_trophies = ranked_trophies + 25 where id = p_match_winner;
      update public.profiles set ranked_trophies = greatest(0, ranked_trophies - 15) where id = loser;
    end if;

    begin
      perform public._achievements_on_match_completed(persisted_match.id);
    exception when others then
      raise warning 'achievement evaluation failed for match %: %', persisted_match.id, sqlerrm;
    end;
  end if;
  return persisted_match.id;
end
$$;

revoke all on function public._achievement_set_progress(uuid, text, integer) from public, anon, authenticated;
revoke all on function public._achievement_showcase_json(uuid) from public, anon, authenticated;
revoke all on function public._achievements_evaluate_player(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._achievements_on_match_completed(uuid) from public, anon, authenticated;
revoke all on function private.achievements_mine_impl() from public, anon;
revoke all on function private.achievements_set_showcase_impl(text[]) from public, anon;
revoke all on function public.achievements_mine() from public, anon;
revoke all on function public.achievements_set_showcase(text[]) from public, anon;
revoke all on function public.player_public_card(uuid) from public, anon;
revoke all on function public.match_player_cards(uuid[]) from public, anon, authenticated;
revoke all on function public.match_persist_round(text, integer, boolean, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.match_persist_finish(text, uuid, jsonb) from public, anon, authenticated;

grant execute on function public._achievement_set_progress(uuid, text, integer) to service_role;
grant execute on function public._achievement_showcase_json(uuid) to service_role;
grant execute on function public._achievements_evaluate_player(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public._achievements_on_match_completed(uuid) to service_role;
grant execute on function private.achievements_mine_impl() to authenticated;
grant execute on function private.achievements_set_showcase_impl(text[]) to authenticated;
grant execute on function public.achievements_mine() to authenticated;
grant execute on function public.achievements_set_showcase(text[]) to authenticated;
grant execute on function public.player_public_card(uuid) to authenticated;
grant execute on function public.match_player_cards(uuid[]) to service_role;
grant execute on function public.match_persist_round(text, integer, boolean, text, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.match_persist_finish(text, uuid, jsonb) to service_role;
