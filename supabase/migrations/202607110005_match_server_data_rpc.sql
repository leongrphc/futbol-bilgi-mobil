create or replace function public.get_match_bootstrap(pool_size integer default 6)
returns jsonb language sql security definer set search_path=public stable as $$
  with active_version as (
    select id from football_data_versions where status='ACTIVE' limit 1
  ), eligible as (
    select candidate.id,candidate.external_id,candidate.name from (
      select distinct c.id, c.external_id, c.name
      from clubs c
      join club_pair_stats s on c.id in (s.club_low_id,s.club_high_id)
      join active_version v on v.id=s.football_data_version_id
      where c.active and s.valid_player_count>0
    ) candidate order by random()
    limit greatest(2,least(pool_size,10))
  )
  select jsonb_build_object(
    'football_data_version_id',(select id from active_version),
    'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'name',name)) from eligible),'[]'::jsonb)
  )
$$;

create or replace function public.match_pair_has_answers(version_id uuid, club_a_external text, club_b_external text)
returns boolean language sql security definer set search_path=public stable as $$
  select exists(
    select 1 from club_pair_stats s
    join clubs a on a.id=s.club_low_id or a.id=s.club_high_id
    join clubs b on b.id=s.club_low_id or b.id=s.club_high_id
    where s.football_data_version_id=version_id and a.external_id=club_a_external
      and b.external_id=club_b_external and a.id<>b.id and s.valid_player_count>0
  )
$$;

create or replace function public.match_validate_answer(version_id uuid, club_a_external text, club_b_external text, answer_normalized text)
returns boolean language sql security definer set search_path=public stable as $$
  select exists(
    select 1 from club_pair_players cpp
    join clubs a on a.id=cpp.club_low_id or a.id=cpp.club_high_id
    join clubs b on b.id=cpp.club_low_id or b.id=cpp.club_high_id
    join player_aliases pa on pa.player_id=cpp.player_id
    where cpp.football_data_version_id=version_id and cpp.is_active
      and a.external_id=club_a_external and b.external_id=club_b_external and a.id<>b.id
      and pa.is_accepted_answer and pa.normalized_alias=answer_normalized
  )
$$;

create or replace function public.match_pick_pair(version_id uuid, excluded_pairs text[] default '{}', minimum_answers integer default 1)
returns jsonb language sql security definer set search_path=public volatile as $$
  select jsonb_build_object('club_a_id',low.external_id,'club_a_name',low.name,'club_b_id',high.external_id,'club_b_name',high.name)
  from club_pair_stats s join clubs low on low.id=s.club_low_id join clubs high on high.id=s.club_high_id
  where s.football_data_version_id=version_id and s.valid_player_count>=minimum_answers
    and (least(low.external_id,high.external_id)||':'||greatest(low.external_id,high.external_id))<>all(excluded_pairs)
  order by case when s.valid_player_count between 2 and 3 then 0 else 1 end,random() limit 1
$$;

revoke all on function public.get_match_bootstrap(integer) from public,anon,authenticated;
revoke all on function public.match_pair_has_answers(uuid,text,text) from public,anon,authenticated;
revoke all on function public.match_validate_answer(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.match_pick_pair(uuid,text[],integer) from public,anon,authenticated;
grant execute on function public.get_match_bootstrap(integer) to service_role;
grant execute on function public.match_pair_has_answers(uuid,text,text) to service_role;
grant execute on function public.match_validate_answer(uuid,text,text,text) to service_role;
grant execute on function public.match_pick_pair(uuid,text[],integer) to service_role;
