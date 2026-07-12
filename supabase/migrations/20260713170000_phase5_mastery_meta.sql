-- Phase 5: club mastery + public opponent card + weekly theme (display)

create table if not exists public.club_mastery (
  player_id uuid not null references public.profiles(id) on delete cascade,
  club_external_id text not null,
  correct_count integer not null default 0 check (correct_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, club_external_id)
);
create index if not exists club_mastery_player_idx on public.club_mastery(player_id, correct_count desc);
alter table public.club_mastery enable row level security;

create or replace function public._mastery_bump(p_player uuid, p_club_external text, p_correct boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_player is null or p_club_external is null or length(trim(p_club_external)) = 0 then return; end if;
  if not exists (select 1 from public.profiles where id = p_player) then return; end if;
  insert into public.club_mastery(player_id, club_external_id, correct_count, attempt_count)
  values (p_player, p_club_external, case when p_correct then 1 else 0 end, 1)
  on conflict (player_id, club_external_id) do update
    set correct_count = public.club_mastery.correct_count + case when p_correct then 1 else 0 end,
        attempt_count = public.club_mastery.attempt_count + 1,
        updated_at = now();
end $$;
revoke all on function public._mastery_bump(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public._mastery_bump(uuid, text, boolean) to service_role;

-- Extend match_persist_round mastery side-effects (preserve album/quests)
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
    insert into public.submissions(round_id, player_id, raw_answer, normalized_answer, is_correct, received_at, submission_sequence, client_command_id)
    values (
      persisted_round,
      submitter,
      item->>'raw_answer',
      normalized,
      is_correct,
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
end $$;

revoke all on function public.match_persist_round(text, integer, boolean, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.match_persist_round(text, integer, boolean, text, text, uuid, jsonb, jsonb) to service_role;

create or replace function public.mastery_mine(p_limit integer default 8)
returns table(
  club_external_id text,
  club_name text,
  correct_count integer,
  attempt_count integer,
  hit_rate numeric
)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  return query
  select m.club_external_id,
         coalesce(c.name, m.club_external_id) as club_name,
         m.correct_count,
         m.attempt_count,
         case when m.attempt_count = 0 then 0 else round((m.correct_count::numeric / m.attempt_count::numeric) * 100, 1) end as hit_rate
  from public.club_mastery m
  left join public.clubs c on c.external_id = m.club_external_id
  where m.player_id = me
  order by m.correct_count desc, m.attempt_count desc
  limit greatest(1, least(coalesce(p_limit, 8), 30));
end $$;

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
    where m.status = 'FINISHED'
      and p_player_id in (m.player_one_id, m.player_two_id)
    order by m.finished_at desc nulls last
    limit 5
  loop
    form := array_append(form, rec.outcome);
  end loop;
  return jsonb_build_object(
    'player_id', profile_row.id,
    'display_name', profile_row.display_name,
    'player_code', profile_row.player_code,
    'trophies', profile_row.trophies,
    'form', form
  );
end $$;

-- service-role friendly bulk cards for match-server
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
      order by m.finished_at desc nulls last
      limit 5
    loop
      form := array_append(form, rec.outcome);
    end loop;
    card := jsonb_build_object(
      'player_id', profile_row.id,
      'display_name', profile_row.display_name,
      'player_code', profile_row.player_code,
      'trophies', profile_row.trophies,
      'form', to_jsonb(form)
    );
    result := result || jsonb_build_array(card);
  end loop;
  return result;
end $$;

create or replace function public.weekly_theme()
returns jsonb language sql security definer set search_path = '' stable as $$
  select case (extract(week from timezone('utc', now()))::int % 6)
    when 0 then jsonb_build_object('id', 'la-liga', 'name_tr', 'La Liga Haftası', 'name_en', 'La Liga Week', 'accent', '#FF716C')
    when 1 then jsonb_build_object('id', 'premier', 'name_tr', 'Premier League Haftası', 'name_en', 'Premier League Week', 'accent', '#72C7FF')
    when 2 then jsonb_build_object('id', 'serie-a', 'name_tr', 'Serie A Haftası', 'name_en', 'Serie A Week', 'accent', '#59D5A6')
    when 3 then jsonb_build_object('id', 'bundesliga', 'name_tr', 'Bundesliga Haftası', 'name_en', 'Bundesliga Week', 'accent', '#FFB454')
    when 4 then jsonb_build_object('id', 'super-lig', 'name_tr', 'Süper Lig Haftası', 'name_en', 'Süper Lig Week', 'accent', '#B896FF')
    else jsonb_build_object('id', 'ucl', 'name_tr', 'Şampiyonlar Ligi Havası', 'name_en', 'Champions League Vibes', 'accent', '#F4C95D')
  end
$$;

revoke all on function public.mastery_mine(integer) from public, anon;
revoke all on function public.player_public_card(uuid) from public, anon;
revoke all on function public.match_player_cards(uuid[]) from public, anon, authenticated;
revoke all on function public.weekly_theme() from public, anon;
grant execute on function public.mastery_mine(integer) to authenticated;
grant execute on function public.player_public_card(uuid) to authenticated;
grant execute on function public.match_player_cards(uuid[]) to service_role;
grant execute on function public.weekly_theme() to authenticated;
