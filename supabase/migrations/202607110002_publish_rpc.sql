create or replace function public.publish_football_data(payload jsonb, export_hash text, data_version text)
returns uuid language plpgsql security definer set search_path=public as $$
declare version_id uuid; c jsonb; p jsonb; pair jsonb; club_a uuid; club_b uuid; player_uuid uuid;
begin
  if exists(select 1 from football_data_import_runs where football_data_import_runs.export_hash=publish_football_data.export_hash and status='SUCCEEDED') then return (select id from football_data_versions where source_export_hash=export_hash); end if;
  insert into football_data_import_runs(source,status,export_hash) values('JSON','RUNNING',export_hash);
  insert into football_data_versions(version_number,status,source_export_hash) values(data_version,'STAGING',export_hash) returning id into version_id;
  for c in select * from jsonb_array_elements(payload->'clubs') loop insert into clubs(external_id,name) values(c->>'id',c->>'name') on conflict(external_id) do update set name=excluded.name; end loop;
  for p in select * from jsonb_array_elements(payload->'players') loop
    insert into players(external_id,game_name,normalized_game_name) values(p->>'id',p->>'game_name',p->>'normalized_name') on conflict(external_id) do update set game_name=excluded.game_name,normalized_game_name=excluded.normalized_game_name returning id into player_uuid;
    insert into player_aliases(player_id,alias,normalized_alias,is_accepted_answer,source) values(player_uuid,p->>'game_name',p->>'normalized_name',true,'MAIN_NAME') on conflict(player_id,normalized_alias) do update set is_accepted_answer=true;
  end loop;
  for p in select * from jsonb_array_elements(coalesce(payload->'aliases','[]')) loop select id into player_uuid from players where external_id=p->>'player_id'; insert into player_aliases(player_id,alias,normalized_alias,is_accepted_answer,source) values(player_uuid,p->>'alias',p->>'normalized_alias',coalesce((p->>'accepted')::boolean,true),'IMPORT') on conflict(player_id,normalized_alias) do update set alias=excluded.alias,is_accepted_answer=excluded.is_accepted_answer; end loop;
  for pair in select * from jsonb_array_elements(payload->'club_pairs') loop
    select id into club_a from clubs where external_id=pair->>'club_a_id'; select id into club_b from clubs where external_id=pair->>'club_b_id';
    for p in select * from jsonb_array_elements(pair->'players') loop select id into player_uuid from players where external_id=p->>'player_id'; insert into club_pair_players values(version_id,least(club_a,club_b),greatest(club_a,club_b),player_uuid,true) on conflict do nothing; end loop;
    insert into club_pair_stats values(version_id,least(club_a,club_b),greatest(club_a,club_b),jsonb_array_length(pair->'players')) on conflict(football_data_version_id,club_low_id,club_high_id) do update set valid_player_count=excluded.valid_player_count;
  end loop;
  update football_data_versions set status='ARCHIVED' where status='ACTIVE'; update football_data_versions set status='ACTIVE',published_at=now() where id=version_id;
  update football_data_import_runs set status='SUCCEEDED',finished_at=now(),clubs_inserted=jsonb_array_length(payload->'clubs'),players_inserted=jsonb_array_length(payload->'players'),aliases_inserted=jsonb_array_length(coalesce(payload->'aliases','[]')),pairs_generated=jsonb_array_length(payload->'club_pairs') where football_data_import_runs.export_hash=publish_football_data.export_hash;
  return version_id;
exception when others then raise;
end $$;
revoke all on function public.publish_football_data(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.publish_football_data(jsonb,text,text) to service_role;
