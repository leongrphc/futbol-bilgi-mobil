alter table public.friendships
  drop constraint if exists friendships_status_check;
alter table public.friendships
  add constraint friendships_status_check check (status in ('PENDING', 'ACCEPTED'));

create or replace function public.social_list_friends()
returns table(friend_id uuid, display_name text, player_code text, trophies integer, status text, direction text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.player_code, p.trophies, f.status,
    case when f.requester_id = auth.uid() then 'OUTGOING' else 'INCOMING' end,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() is not null and auth.uid() in (f.requester_id, f.addressee_id)
  order by (f.status = 'PENDING' and f.addressee_id = auth.uid()) desc, f.created_at desc;
$$;

create or replace function public.social_request_friend(p_player_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid(); target uuid; existing public.friendships%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into target from public.profiles where lower(player_code) = lower(trim(p_player_code));
  if target is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  if target = me then raise exception 'CANNOT_ADD_SELF'; end if;
  if exists (select 1 from public.user_blocks where (blocker_id = me and blocked_id = target) or (blocker_id = target and blocked_id = me)) then raise exception 'FRIENDSHIP_UNAVAILABLE'; end if;
  select * into existing from public.friendships where (requester_id = me and addressee_id = target) or (requester_id = target and addressee_id = me) for update;
  if found then
    if existing.status = 'ACCEPTED' then return 'ALREADY_FRIENDS'; end if;
    if existing.addressee_id = me then
      update public.friendships set status = 'ACCEPTED' where requester_id = existing.requester_id and addressee_id = existing.addressee_id;
      return 'ACCEPTED';
    end if;
    return 'PENDING';
  end if;
  insert into public.friendships(requester_id, addressee_id, status) values (me, target, 'PENDING');
  return 'PENDING';
end;
$$;

create or replace function public.social_respond_friend(p_requester_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (select 1 from public.friendships where requester_id = p_requester_id and addressee_id = me and status = 'PENDING') then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;
  if p_accept then
    update public.friendships set status = 'ACCEPTED' where requester_id = p_requester_id and addressee_id = me;
    return 'ACCEPTED';
  end if;
  delete from public.friendships where requester_id = p_requester_id and addressee_id = me;
  return 'DECLINED';
end;
$$;

revoke all on function public.social_list_friends() from public, anon;
revoke all on function public.social_request_friend(text) from public, anon;
revoke all on function public.social_respond_friend(uuid, boolean) from public, anon;
grant execute on function public.social_list_friends() to authenticated;
grant execute on function public.social_request_friend(text) to authenticated;
grant execute on function public.social_respond_friend(uuid, boolean) to authenticated;
