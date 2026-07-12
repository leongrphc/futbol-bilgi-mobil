drop function if exists public.get_match_bootstrap(integer);
create function public.get_match_bootstrap(pool_size integer default 6, requested_version uuid default null)
returns jsonb language sql security definer set search_path=public stable as $$
  with active_version as (
    select coalesce(requested_version,(select id from football_data_versions where status='ACTIVE' limit 1)) id
  ), eligible as (
    select candidate.id,candidate.external_id,candidate.name from (
      select distinct c.id, c.external_id, c.name
      from clubs c join club_pair_stats s on c.id in (s.club_low_id,s.club_high_id)
      join active_version v on v.id=s.football_data_version_id
      where c.active and s.valid_player_count>0
    ) candidate order by random() limit greatest(2,least(pool_size,10))
  )
  select jsonb_build_object('football_data_version_id',(select id from active_version),'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'name',name)) from eligible),'[]'::jsonb))
$$;
revoke all on function public.get_match_bootstrap(integer,uuid) from public,anon,authenticated;
grant execute on function public.get_match_bootstrap(integer,uuid) to service_role;
