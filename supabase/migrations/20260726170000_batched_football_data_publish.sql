begin;

-- publish_football_data() walks every club, player, alias and pair row by row
-- inside a single transaction. That shape stopped scaling once the builder
-- export passed ~50k pair rows: the 12 July import already had to be pushed
-- through in ad-hoc batches and still took 19 minutes, and the v4 export is
-- roughly twice that size again.
--
-- A publish is now begin -> chunk* -> activate. Each chunk is its own
-- transaction and uses set-based upserts instead of PL/pgSQL loops. Partial
-- data stays invisible to live play because the version sits in STAGING and
-- every match RPC resolves through the ACTIVE version, so an interrupted
-- import can be resumed or aborted without touching a running match.
--
-- The single-shot RPC is left in place for small exports.

create or replace function public.publish_football_data_begin(
  p_data_version text,
  p_export_hash text,
  p_source text default 'JSON_SCHEMA_V2_BATCHED'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  version_id uuid;
begin
  -- Re-running the same export resumes its version instead of starting a
  -- second one; chunks are idempotent so a partial import can be replayed.
  select v.id into version_id
  from public.football_data_versions v
  where v.source_export_hash = p_export_hash;
  if found then return version_id; end if;

  insert into public.football_data_import_runs(source, status, export_hash)
  values (p_source, 'RUNNING', p_export_hash);

  insert into public.football_data_versions(version_number, status, source_export_hash)
  values (p_data_version, 'STAGING', p_export_hash)
  returning id into version_id;

  return version_id;
end $$;

create or replace function public.publish_football_data_chunk(
  p_version_id uuid,
  p_chunk jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_status public.data_version_status;
  clubs_touched integer := 0;
  players_touched integer := 0;
  aliases_touched integer := 0;
  pair_players_touched integer := 0;
begin
  select v.status into v_status from public.football_data_versions v where v.id = p_version_id;
  if not found then raise exception 'UNKNOWN_DATA_VERSION'; end if;
  if v_status <> 'STAGING' then raise exception 'VERSION_NOT_STAGING: %', v_status; end if;

  insert into public.clubs(external_id, name)
  select c->>'id', c->>'name'
  from jsonb_array_elements(coalesce(p_chunk->'clubs', '[]'::jsonb)) c
  on conflict (external_id) do update set name = excluded.name;
  get diagnostics clubs_touched = row_count;

  insert into public.players(external_id, game_name, normalized_game_name)
  select p->>'id', p->>'game_name', p->>'normalized_name'
  from jsonb_array_elements(coalesce(p_chunk->'players', '[]'::jsonb)) p
  on conflict (external_id) do update
    set game_name = excluded.game_name,
        normalized_game_name = excluded.normalized_game_name;
  get diagnostics players_touched = row_count;

  -- A player's own name is always an accepted answer.
  insert into public.player_aliases(player_id, alias, normalized_alias, is_accepted_answer, source)
  select pl.id, p->>'game_name', p->>'normalized_name', true, 'MAIN_NAME'
  from jsonb_array_elements(coalesce(p_chunk->'players', '[]'::jsonb)) p
  join public.players pl on pl.external_id = p->>'id'
  on conflict (player_id, normalized_alias) do update set is_accepted_answer = true;

  insert into public.player_aliases(player_id, alias, normalized_alias, is_accepted_answer, source)
  select pl.id, a->>'alias', a->>'normalized_alias', coalesce((a->>'accepted')::boolean, true), 'IMPORT'
  from jsonb_array_elements(coalesce(p_chunk->'aliases', '[]'::jsonb)) a
  join public.players pl on pl.external_id = a->>'player_id'
  on conflict (player_id, normalized_alias) do update
    set alias = excluded.alias,
        is_accepted_answer = excluded.is_accepted_answer;
  get diagnostics aliases_touched = row_count;

  -- club_low/high follow the table's own ordering check, and a pair is never
  -- split across chunks so the derived stats in activate stay exact.
  insert into public.club_pair_players(football_data_version_id, club_low_id, club_high_id, player_id, is_active)
  select p_version_id, least(a.id, b.id), greatest(a.id, b.id), pl.id, true
  from jsonb_array_elements(coalesce(p_chunk->'club_pairs', '[]'::jsonb)) pair
  join public.clubs a on a.external_id = pair->>'club_a_id'
  join public.clubs b on b.external_id = pair->>'club_b_id'
  cross join lateral jsonb_array_elements(pair->'players') pp
  join public.players pl on pl.external_id = pp->>'player_id'
  where a.id <> b.id
  on conflict do nothing;
  get diagnostics pair_players_touched = row_count;

  return jsonb_build_object(
    'clubs', clubs_touched,
    'players', players_touched,
    'aliases', aliases_touched,
    'pair_players', pair_players_touched
  );
end $$;

create or replace function public.publish_football_data_activate(p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_status public.data_version_status;
  v_hash text;
  playable_pairs integer;
  pair_players integer;
  club_total integer;
  player_total integer;
  alias_total integer;
begin
  select v.status, v.source_export_hash into v_status, v_hash
  from public.football_data_versions v where v.id = p_version_id;
  if not found then raise exception 'UNKNOWN_DATA_VERSION'; end if;
  if v_status = 'ACTIVE' then
    return jsonb_build_object('status', 'ALREADY_ACTIVE', 'version_id', p_version_id);
  end if;
  if v_status <> 'STAGING' then raise exception 'VERSION_NOT_STAGING: %', v_status; end if;

  -- Stats are derived from the rows that actually landed rather than from the
  -- export's own counts, so a pair whose players failed to resolve can never
  -- advertise a playable answer count to match_pick_pair.
  insert into public.club_pair_stats(football_data_version_id, club_low_id, club_high_id, valid_player_count)
  select football_data_version_id, club_low_id, club_high_id, count(*)
  from public.club_pair_players
  where football_data_version_id = p_version_id and is_active
  group by football_data_version_id, club_low_id, club_high_id
  on conflict (football_data_version_id, club_low_id, club_high_id)
    do update set valid_player_count = excluded.valid_player_count;

  select count(*) into playable_pairs
  from public.club_pair_stats
  where football_data_version_id = p_version_id and valid_player_count > 0;
  if playable_pairs = 0 then raise exception 'REFUSING_EMPTY_PUBLISH'; end if;

  select count(*) into pair_players
  from public.club_pair_players where football_data_version_id = p_version_id;
  select count(*) into club_total from public.clubs;
  select count(*) into player_total from public.players;
  select count(*) into alias_total from public.player_aliases;

  -- one_active_football_data_version allows a single ACTIVE row, so the
  -- previous version has to be archived before the new one is promoted.
  update public.football_data_versions set status = 'ARCHIVED' where status = 'ACTIVE';
  update public.football_data_versions
  set status = 'ACTIVE', published_at = now()
  where id = p_version_id;

  update public.football_data_import_runs
  set status = 'SUCCEEDED',
      finished_at = now(),
      clubs_inserted = club_total,
      players_inserted = player_total,
      aliases_inserted = alias_total,
      pairs_generated = playable_pairs
  where export_hash = v_hash;

  return jsonb_build_object(
    'status', 'ACTIVE',
    'version_id', p_version_id,
    'playable_pairs', playable_pairs,
    'pair_players', pair_players
  );
end $$;

create or replace function public.publish_football_data_abort(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.data_version_status;
  v_hash text;
begin
  select v.status, v.source_export_hash into v_status, v_hash
  from public.football_data_versions v where v.id = p_version_id;
  if not found then raise exception 'UNKNOWN_DATA_VERSION'; end if;
  if v_status <> 'STAGING' then raise exception 'VERSION_NOT_STAGING: %', v_status; end if;

  delete from public.club_pair_players where football_data_version_id = p_version_id;
  delete from public.club_pair_stats where football_data_version_id = p_version_id;
  delete from public.football_data_versions where id = p_version_id;
  update public.football_data_import_runs
  set status = 'FAILED', finished_at = now()
  where export_hash = v_hash;
end $$;

revoke all on function public.publish_football_data_begin(text, text, text) from public, anon, authenticated;
revoke all on function public.publish_football_data_chunk(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.publish_football_data_activate(uuid) from public, anon, authenticated;
revoke all on function public.publish_football_data_abort(uuid) from public, anon, authenticated;
grant execute on function public.publish_football_data_begin(text, text, text) to service_role;
grant execute on function public.publish_football_data_chunk(uuid, jsonb) to service_role;
grant execute on function public.publish_football_data_activate(uuid) to service_role;
grant execute on function public.publish_football_data_abort(uuid) to service_role;

commit;
