begin;

drop policy if exists presence_self_write on public.player_presence;
drop policy if exists presence_self_insert on public.player_presence;
drop policy if exists presence_self_update on public.player_presence;
drop policy if exists presence_self_delete on public.player_presence;

create policy presence_self_insert
on public.player_presence
for insert
to authenticated
with check (player_id = (select auth.uid()));

create policy presence_self_update
on public.player_presence
for update
to authenticated
using (player_id = (select auth.uid()))
with check (player_id = (select auth.uid()));

create policy presence_self_delete
on public.player_presence
for delete
to authenticated
using (player_id = (select auth.uid()));

create or replace function private.social_active_player_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select count(*)::integer
  into active_count
  from public.player_presence presence
  where presence.state in ('ONLINE', 'IN_MATCH')
    and presence.last_seen_at >= now() - interval '20 seconds';

  return active_count;
end
$$;

revoke all on function private.social_active_player_count() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.social_active_player_count() to authenticated;

create or replace function public.social_active_player_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select private.social_active_player_count();
$$;

revoke all on function public.social_active_player_count() from public, anon;
grant execute on function public.social_active_player_count() to authenticated;

commit;
