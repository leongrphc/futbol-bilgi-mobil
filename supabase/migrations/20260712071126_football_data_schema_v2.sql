alter table public.football_data_versions
  add column if not exists schema_version integer not null default 1 check (schema_version > 0);

create or replace function public.publish_football_data(payload jsonb, export_hash text, data_version text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  version_id uuid; c jsonb; p jsonb; membership jsonb; pair jsonb;
  club_a uuid; club_b uuid; player_uuid uuid; payload_schema integer;
begin
  payload_schema := coalesce((payload->>'schema_version')::integer, 1);
  if payload_schema not in (1, 2) then raise exception 'unsupported football data schema version: %', payload_schema; end if;
  if exists(select 1 from football_data_import_runs r where r.export_hash=publish_football_data.export_hash and r.status='SUCCEEDED') then
    return (select id from football_data_versions v where v.source_export_hash=publish_football_data.export_hash);
  end if;

  insert into football_data_import_runs(source,status,export_hash) values('JSON_SCHEMA_V' || payload_schema,'RUNNING',export_hash);
  insert into football_data_versions(version_number,status,source_export_hash,schema_version) values(data_version,'STAGING',export_hash,payload_schema) returning id into version_id;

  for c in select * from jsonb_array_elements(payload->'clubs') loop
    insert into clubs(external_id,name) values(c->>'id',c->>'name') on conflict(external_id) do update set name=excluded.name, active=true;
  end loop;
  for p in select * from jsonb_array_elements(payload->'players') loop
    insert into players(external_id,game_name,normalized_game_name) values(p->>'id',p->>'game_name',p->>'normalized_name')
    on conflict(external_id) do update set game_name=excluded.game_name,normalized_game_name=excluded.normalized_game_name returning id into player_uuid;
    insert into player_aliases(player_id,alias,normalized_alias,is_accepted_answer,source) values(player_uuid,p->>'game_name',p->>'normalized_name',true,'MAIN_NAME')
    on conflict(player_id,normalized_alias) do update set alias=excluded.alias,is_accepted_answer=true;
  end loop;
  for p in select * from jsonb_array_elements(coalesce(payload->'aliases','[]')) loop
    select id into player_uuid from players where external_id=p->>'player_id';
    if player_uuid is null then raise exception 'alias references missing player: %', p->>'player_id'; end if;
    insert into player_aliases(player_id,alias,normalized_alias,is_accepted_answer,source) values(player_uuid,p->>'alias',p->>'normalized_alias',coalesce((p->>'accepted')::boolean,true),'IMPORT')
    on conflict(player_id,normalized_alias) do update set alias=excluded.alias,is_accepted_answer=excluded.is_accepted_answer;
  end loop;
  for membership in select * from jsonb_array_elements(coalesce(payload->'contracts','[]')) loop
    select id into player_uuid from players where external_id=membership->>'player_id';
    select id into club_a from clubs where external_id=membership->>'club_id';
    if player_uuid is null or club_a is null then raise exception 'membership references missing entity'; end if;
    insert into player_club_contracts(player_id,club_id,contract_type,squad_level,source)
    select player_uuid,club_a,'UNKNOWN','FIRST_TEAM',coalesce(membership->>'source','PAIR_EXPORT_V2')
    where not exists(select 1 from player_club_contracts pc where pc.player_id=player_uuid and pc.club_id=club_a and pc.starts_on is null and pc.ends_on is null and pc.source=coalesce(membership->>'source','PAIR_EXPORT_V2'));
  end loop;
  for pair in select * from jsonb_array_elements(payload->'club_pairs') loop
    select id into club_a from clubs where external_id=pair->>'club_a_id'; select id into club_b from clubs where external_id=pair->>'club_b_id';
    if club_a is null or club_b is null then raise exception 'pair references missing club'; end if;
    for p in select * from jsonb_array_elements(pair->'players') loop
      select id into player_uuid from players where external_id=p->>'player_id';
      if player_uuid is null then raise exception 'pair references missing player: %', p->>'player_id'; end if;
      insert into club_pair_players values(version_id,least(club_a,club_b),greatest(club_a,club_b),player_uuid,true) on conflict do nothing;
    end loop;
    insert into club_pair_stats values(version_id,least(club_a,club_b),greatest(club_a,club_b),jsonb_array_length(pair->'players'))
    on conflict(football_data_version_id,club_low_id,club_high_id) do update set valid_player_count=excluded.valid_player_count;
  end loop;

  update football_data_versions set status='ARCHIVED' where status='ACTIVE';
  update football_data_versions set status='ACTIVE',published_at=now() where id=version_id;
  update football_data_import_runs set status='SUCCEEDED',finished_at=now(),clubs_inserted=jsonb_array_length(payload->'clubs'),players_inserted=jsonb_array_length(payload->'players'),memberships_inserted=jsonb_array_length(coalesce(payload->'contracts','[]')),aliases_inserted=jsonb_array_length(coalesce(payload->'aliases','[]')),pairs_generated=jsonb_array_length(payload->'club_pairs') where football_data_import_runs.export_hash=publish_football_data.export_hash;
  return version_id;
end $$;

revoke all on function public.publish_football_data(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.publish_football_data(jsonb,text,text) to service_role;
