begin;

-- Head-to-head record on opponent cards. player_public_card gains an 'h2h'
-- object relative to the caller; match_player_cards (service-role, Worker
-- READY payload) gains per-card 'h2h_wins' when exactly two distinct players
-- are requested. Aggregates only — no round or answer data.

create or replace function public._h2h_wins(p_player uuid, p_opponent uuid)
returns integer language sql stable set search_path = '' as $$
  select count(*)::integer
  from public.matches m
  where m.status = 'FINISHED'
    and m.winner_id = p_player
    and p_player in (m.player_one_id, m.player_two_id)
    and p_opponent in (m.player_one_id, m.player_two_id)
    and p_player <> p_opponent;
$$;

create or replace function public.player_public_card(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  profile_row public.profiles%rowtype;
  form text[] := array[]::text[];
  friendship_state text := 'NONE';
  h2h jsonb := null;
  rec record;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_player_id is null then raise exception 'INVALID_PLAYER'; end if;

  select * into profile_row
  from public.profiles
  where id = p_player_id;

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

  if p_player_id = me then
    friendship_state := 'SELF';
  else
    select case
      when f.status = 'ACCEPTED' then 'ACCEPTED'
      when f.addressee_id = me then 'PENDING_INCOMING'
      else 'PENDING_OUTGOING'
    end
    into friendship_state
    from public.friendships f
    where (f.requester_id = me and f.addressee_id = p_player_id)
       or (f.requester_id = p_player_id and f.addressee_id = me)
    limit 1;

    friendship_state := coalesce(friendship_state, 'NONE');

    h2h := jsonb_build_object(
      'wins', public._h2h_wins(me, p_player_id),
      'losses', public._h2h_wins(p_player_id, me)
    );
  end if;

  return jsonb_build_object(
    'player_id', profile_row.id,
    'display_name', profile_row.display_name,
    'player_code', profile_row.player_code,
    'avatar_url', profile_row.avatar_url,
    'trophies', profile_row.trophies,
    'blitz_trophies', profile_row.blitz_trophies,
    'ranked_trophies', profile_row.ranked_trophies,
    'form', form,
    'friendship_state', friendship_state,
    'achievements', public._achievement_showcase_json(profile_row.id),
    'h2h', h2h
  );
end
$$;

create or replace function public.match_player_cards(p_player_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb := '[]'::jsonb;
  pid uuid;
  other uuid;
  card jsonb;
  form text[];
  rec record;
  profile_row public.profiles%rowtype;
  distinct_ids uuid[];
begin
  if p_player_ids is null then return result; end if;
  select array_agg(distinct id) into distinct_ids from unnest(p_player_ids) as id;

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
    if array_length(distinct_ids, 1) = 2 then
      other := case when distinct_ids[1] = pid then distinct_ids[2] else distinct_ids[1] end;
      card := card || jsonb_build_object('h2h_wins', public._h2h_wins(pid, other));
    end if;
    result := result || jsonb_build_array(card);
  end loop;
  return result;
end
$$;

revoke all on function public._h2h_wins(uuid, uuid) from public, anon, authenticated;
revoke all on function public.player_public_card(uuid) from public, anon;
revoke all on function public.match_player_cards(uuid[]) from public, anon, authenticated;
grant execute on function public.player_public_card(uuid) to authenticated;
grant execute on function public.match_player_cards(uuid[]) to service_role;

commit;
