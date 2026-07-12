alter table public.matches add column if not exists room_key text;
create unique index if not exists matches_room_key_unique on public.matches(room_key) where room_key is not null;

-- A round_number is an absolute match ordinal. This supports any number of sudden-death rounds.
alter table public.rounds drop constraint if exists rounds_match_id_round_number_sudden_death_key;
create unique index if not exists rounds_match_round_unique on public.rounds(match_id,round_number);

create or replace function public.match_persist_start(
  p_room_key text, p_version_id uuid, p_player_one uuid, p_player_two uuid, p_match_mode text default 'FRIEND'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare persisted_id uuid;
begin
  if p_room_key is null or length(trim(p_room_key))=0 or p_player_one=p_player_two then raise exception 'INVALID_MATCH'; end if;
  insert into public.matches(room_key,mode,status,player_one_id,player_two_id,football_data_version_id)
  values(trim(p_room_key),case when p_match_mode in ('QUICK','FRIEND','DEVELOPMENT') then p_match_mode else 'FRIEND' end,'ACTIVE',p_player_one,p_player_two,p_version_id)
  on conflict(room_key) where room_key is not null do update set room_key=excluded.room_key
  returning id into persisted_id;
  return persisted_id;
end $$;

create or replace function public.match_persist_round(
  p_room_key text, p_round_ordinal integer, p_is_sudden_death boolean, p_club_a_external text, p_club_b_external text,
  p_round_winner uuid, p_round_submissions jsonb, p_scores jsonb
) returns uuid language plpgsql security invoker set search_path='' as $$
declare persisted_match public.matches%rowtype; club_a uuid; club_b uuid; persisted_round uuid; item jsonb;
begin
  if p_round_ordinal < 1 then raise exception 'INVALID_ROUND_ORDINAL'; end if;
  select * into strict persisted_match from public.matches where public.matches.room_key=p_room_key for update;
  select id into strict club_a from public.clubs where external_id=p_club_a_external;
  select id into strict club_b from public.clubs where external_id=p_club_b_external;
  insert into public.rounds(match_id,round_number,sudden_death,club_low_id,club_high_id,winner_id,finished_at)
  values(persisted_match.id,p_round_ordinal,p_is_sudden_death,least(club_a,club_b),greatest(club_a,club_b),p_round_winner,now())
  on conflict(match_id,round_number) do update set winner_id=excluded.winner_id,finished_at=excluded.finished_at
  returning id into persisted_round;
  for item in select value from jsonb_array_elements(coalesce(p_round_submissions,'[]'::jsonb)) loop
    insert into public.submissions(round_id,player_id,raw_answer,normalized_answer,is_correct,received_at,submission_sequence,client_command_id)
    values(persisted_round,(item->>'player_id')::uuid,item->>'raw_answer',item->>'normalized_answer',coalesce((item->>'is_correct')::boolean,false),to_timestamp((item->>'received_at_ms')::double precision/1000),coalesce((item->>'sequence')::bigint,0),p_room_key||':'||p_round_ordinal||':'||(item->>'player_id'))
    on conflict(round_id,player_id) do nothing;
  end loop;
  update public.matches set score_one=coalesce((p_scores->>player_one_id::text)::smallint,score_one),score_two=coalesce((p_scores->>player_two_id::text)::smallint,score_two) where id=persisted_match.id;
  return persisted_round;
end $$;

create or replace function public.match_persist_finish(p_room_key text, p_match_winner uuid, p_final_scores jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare persisted_match public.matches%rowtype;
begin
  select * into strict persisted_match from public.matches where public.matches.room_key=p_room_key for update;
  update public.matches set status='FINISHED',winner_id=p_match_winner,score_one=coalesce((p_final_scores->>player_one_id::text)::smallint,score_one),score_two=coalesce((p_final_scores->>player_two_id::text)::smallint,score_two),finished_at=coalesce(finished_at,now()) where id=persisted_match.id;
  return persisted_match.id;
end $$;

revoke all on function public.match_persist_start(text,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.match_persist_round(text,integer,boolean,text,text,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.match_persist_finish(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.match_persist_start(text,uuid,uuid,uuid,text) to service_role;
grant execute on function public.match_persist_round(text,integer,boolean,text,text,uuid,jsonb,jsonb) to service_role;
grant execute on function public.match_persist_finish(text,uuid,jsonb) to service_role;
