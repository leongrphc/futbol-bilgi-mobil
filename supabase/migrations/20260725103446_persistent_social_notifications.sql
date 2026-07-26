begin;

create extension if not exists pg_net with schema extensions;

create table public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ANDROID', 'IOS')),
  locale text not null default 'tr' check (locale in ('tr', 'en')),
  last_registered_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(expo_push_token) between 20 and 512)
);

create index push_device_tokens_active_user_idx
  on public.push_device_tokens(user_id, last_registered_at desc)
  where disabled_at is null;

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in (
    'FRIEND_REQUEST',
    'FRIEND_ACCEPTED',
    'FRIEND_MATCH_INVITE',
    'REMATCH_OFFER'
  )),
  source_key text not null,
  entity_id uuid,
  room_key text,
  match_mode text check (match_mode is null or match_mode in ('FRIEND', 'QUICK', 'BLITZ', 'RANKED', 'EVENT')),
  read_at timestamptz,
  expires_at timestamptz,
  push_attempted_at timestamptz,
  push_error text,
  created_at timestamptz not null default now(),
  unique(recipient_id, type, source_key),
  check (actor_id is null or actor_id <> recipient_id)
);

create index app_notifications_recipient_created_idx
  on public.app_notifications(recipient_id, created_at desc);
create index app_notifications_recipient_unread_idx
  on public.app_notifications(recipient_id, created_at desc)
  where read_at is null;

create table public.app_notification_push_receipts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  token_id uuid not null references public.push_device_tokens(id) on delete cascade,
  ticket_id text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING', 'DELIVERED', 'ERROR')),
  error_code text,
  error_message text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index app_notification_push_receipts_pending_idx
  on public.app_notification_push_receipts(created_at)
  where status = 'PENDING';

alter table public.push_device_tokens enable row level security;
alter table public.app_notifications enable row level security;
alter table public.app_notification_push_receipts enable row level security;

create policy app_notifications_recipient_read
on public.app_notifications
for select
to authenticated
using (recipient_id = (select auth.uid()));

revoke all on table public.push_device_tokens from public, anon, authenticated;
revoke all on table public.app_notifications from public, anon, authenticated;
revoke all on table public.app_notification_push_receipts from public, anon, authenticated;
grant select on table public.app_notifications to authenticated;
grant all on table public.push_device_tokens to service_role;
grant all on table public.app_notifications to service_role;
grant all on table public.app_notification_push_receipts to service_role;

create or replace function private.notifications_register_push_token_impl(
  p_expo_push_token text,
  p_platform text,
  p_locale text default 'tr'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  token_id uuid;
  normalized_platform text := upper(trim(coalesce(p_platform, '')));
  normalized_locale text := lower(trim(coalesce(p_locale, 'tr')));
begin
  if me is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if p_expo_push_token is null
    or length(trim(p_expo_push_token)) not between 20 and 512
    or trim(p_expo_push_token) !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$'
  then
    raise exception 'INVALID_PUSH_TOKEN';
  end if;
  if normalized_platform not in ('ANDROID', 'IOS') then
    raise exception 'INVALID_PUSH_PLATFORM';
  end if;
  if normalized_locale not in ('tr', 'en') then
    normalized_locale := 'tr';
  end if;

  insert into public.push_device_tokens(
    user_id,
    expo_push_token,
    platform,
    locale,
    last_registered_at,
    disabled_at
  )
  values (
    me,
    trim(p_expo_push_token),
    normalized_platform,
    normalized_locale,
    now(),
    null
  )
  on conflict (expo_push_token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      locale = excluded.locale,
      last_registered_at = now(),
      disabled_at = null
  returning id into token_id;

  return token_id;
end
$$;

create or replace function public.notifications_register_push_token(
  p_expo_push_token text,
  p_platform text,
  p_locale text default 'tr'
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.notifications_register_push_token_impl(
    p_expo_push_token,
    p_platform,
    p_locale
  )
$$;

create or replace function private.notifications_unregister_push_token_impl(
  p_expo_push_token text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  update public.push_device_tokens
  set disabled_at = now()
  where user_id = me
    and expo_push_token = trim(p_expo_push_token);
end
$$;

create or replace function public.notifications_unregister_push_token(
  p_expo_push_token text
) returns void
language sql
security invoker
set search_path = ''
as $$
  select private.notifications_unregister_push_token_impl(p_expo_push_token)
$$;

create or replace function private.notifications_inbox_impl(
  p_limit integer default 50
) returns table(
  notification_id uuid,
  notification_type text,
  actor_id uuid,
  actor_name text,
  entity_id uuid,
  room_key text,
  match_mode text,
  action_status text,
  read_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  return query
  select
    notification.id,
    notification.type,
    notification.actor_id,
    coalesce(actor.display_name, 'Football Link'),
    notification.entity_id,
    notification.room_key,
    notification.match_mode,
    case notification.type
      when 'FRIEND_REQUEST' then coalesce((
        select friendship.status
        from public.friendships friendship
        where friendship.requester_id = notification.actor_id
          and friendship.addressee_id = me
        limit 1
      ), 'RESOLVED')
      when 'FRIEND_MATCH_INVITE' then coalesce((
        select invite.status
        from public.friend_match_invites invite
        where invite.id = notification.entity_id
        limit 1
      ), 'RESOLVED')
      when 'REMATCH_OFFER' then coalesce((
        select offer.status
        from public.rematch_offers offer
        where offer.id = notification.entity_id
        limit 1
      ), 'RESOLVED')
      else 'RESOLVED'
    end,
    notification.read_at,
    notification.expires_at,
    notification.created_at
  from public.app_notifications notification
  left join public.profiles actor on actor.id = notification.actor_id
  where notification.recipient_id = me
  order by notification.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end
$$;

create or replace function public.notifications_inbox(
  p_limit integer default 50
) returns table(
  notification_id uuid,
  notification_type text,
  actor_id uuid,
  actor_name text,
  entity_id uuid,
  room_key text,
  match_mode text,
  action_status text,
  read_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.notifications_inbox_impl(p_limit)
$$;

create or replace function public.notifications_unread_count()
returns integer
language sql
security invoker
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.app_notifications notification
  where notification.recipient_id = (select auth.uid())
    and notification.read_at is null
    and (notification.expires_at is null or notification.expires_at > now())
$$;

create or replace function public.notifications_mark_read(
  p_notification_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed boolean := false;
begin
  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_id = (select auth.uid())
  returning true into changed;
  return changed;
end
$$;

create or replace function public.notifications_mark_all_read()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.app_notifications
  set read_at = now()
  where recipient_id = (select auth.uid())
    and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end
$$;

grant update(read_at) on table public.app_notifications to authenticated;

create policy app_notifications_recipient_mark_read
on public.app_notifications
for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create or replace function private.notify_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'PENDING' then
    insert into public.app_notifications(
      recipient_id,
      actor_id,
      type,
      source_key,
      entity_id
    )
    values (
      new.addressee_id,
      new.requester_id,
      'FRIEND_REQUEST',
      concat(new.requester_id, ':', new.addressee_id, ':', extract(epoch from new.created_at)),
      new.requester_id
    )
    on conflict do nothing;
  elsif tg_op = 'UPDATE'
    and old.status = 'PENDING'
    and new.status = 'ACCEPTED'
  then
    update public.app_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = new.addressee_id
      and type = 'FRIEND_REQUEST'
      and actor_id = new.requester_id
      and read_at is null;

    insert into public.app_notifications(
      recipient_id,
      actor_id,
      type,
      source_key,
      entity_id
    )
    values (
      new.requester_id,
      new.addressee_id,
      'FRIEND_ACCEPTED',
      concat(new.requester_id, ':', new.addressee_id, ':', extract(epoch from new.created_at)),
      new.addressee_id
    )
    on conflict do nothing;
  elsif tg_op = 'DELETE' then
    update public.app_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = old.addressee_id
      and type = 'FRIEND_REQUEST'
      and actor_id = old.requester_id
      and read_at is null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger friendships_app_notifications
after insert or update or delete on public.friendships
for each row execute function private.notify_friendship_change();

create or replace function private.notify_friend_match_invite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.app_notifications(
      recipient_id,
      actor_id,
      type,
      source_key,
      entity_id,
      room_key,
      match_mode,
      expires_at
    )
    values (
      new.recipient_id,
      new.sender_id,
      'FRIEND_MATCH_INVITE',
      new.id::text,
      new.id,
      new.room_key,
      'FRIEND',
      new.expires_at
    )
    on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'PENDING' and new.status <> 'PENDING' then
    update public.app_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = new.recipient_id
      and type = 'FRIEND_MATCH_INVITE'
      and entity_id = new.id;
  end if;

  return new;
end
$$;

create trigger friend_match_invites_app_notifications
after insert or update on public.friend_match_invites
for each row execute function private.notify_friend_match_invite_change();

create or replace function private.notify_rematch_offer_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.app_notifications(
      recipient_id,
      actor_id,
      type,
      source_key,
      entity_id,
      room_key,
      match_mode,
      expires_at
    )
    values (
      new.recipient_id,
      new.requester_id,
      'REMATCH_OFFER',
      new.id::text,
      new.id,
      new.next_match_key,
      new.match_mode,
      new.expires_at
    )
    on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'PENDING' and new.status <> 'PENDING' then
    update public.app_notifications
    set read_at = coalesce(read_at, now())
    where recipient_id = new.recipient_id
      and type = 'REMATCH_OFFER'
      and entity_id = new.id;
  end if;

  return new;
end
$$;

create trigger rematch_offers_app_notifications
after insert or update on public.rematch_offers
for each row execute function private.notify_rematch_offer_change();

create or replace function private.dispatch_app_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  select decrypted_secret
  into dispatch_url
  from vault.decrypted_secrets
  where name = 'notification_dispatch_url'
  limit 1;

  select decrypted_secret
  into dispatch_secret
  from vault.decrypted_secrets
  where name = 'notification_dispatch_secret'
  limit 1;

  if dispatch_url is null or dispatch_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', dispatch_secret
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception when others then
  raise warning 'notification dispatch enqueue failed for %: %', new.id, sqlerrm;
  return new;
end
$$;

create trigger app_notifications_dispatch_push
after insert on public.app_notifications
for each row execute function private.dispatch_app_notification();

insert into public.app_notifications(
  recipient_id,
  actor_id,
  type,
  source_key,
  entity_id
)
select
  friendship.addressee_id,
  friendship.requester_id,
  'FRIEND_REQUEST',
  concat(
    friendship.requester_id,
    ':',
    friendship.addressee_id,
    ':',
    extract(epoch from friendship.created_at)
  ),
  friendship.requester_id
from public.friendships friendship
where friendship.status = 'PENDING'
on conflict do nothing;

insert into public.app_notifications(
  recipient_id,
  actor_id,
  type,
  source_key,
  entity_id,
  room_key,
  match_mode,
  expires_at,
  created_at
)
select
  invite.recipient_id,
  invite.sender_id,
  'FRIEND_MATCH_INVITE',
  invite.id::text,
  invite.id,
  invite.room_key,
  'FRIEND',
  invite.expires_at,
  invite.created_at
from public.friend_match_invites invite
where invite.status = 'PENDING'
  and invite.expires_at > now()
on conflict do nothing;

insert into public.app_notifications(
  recipient_id,
  actor_id,
  type,
  source_key,
  entity_id,
  room_key,
  match_mode,
  expires_at,
  created_at
)
select
  offer.recipient_id,
  offer.requester_id,
  'REMATCH_OFFER',
  offer.id::text,
  offer.id,
  offer.next_match_key,
  offer.match_mode,
  offer.expires_at,
  offer.created_at
from public.rematch_offers offer
where offer.status = 'PENDING'
  and offer.expires_at > now()
on conflict do nothing;

revoke all on function private.notifications_register_push_token_impl(text, text, text) from public, anon;
revoke all on function private.notifications_unregister_push_token_impl(text) from public, anon;
revoke all on function private.notifications_inbox_impl(integer) from public, anon;
revoke all on function public.notifications_register_push_token(text, text, text) from public, anon;
revoke all on function public.notifications_unregister_push_token(text) from public, anon;
revoke all on function public.notifications_inbox(integer) from public, anon;
revoke all on function public.notifications_unread_count() from public, anon;
revoke all on function public.notifications_mark_read(uuid) from public, anon;
revoke all on function public.notifications_mark_all_read() from public, anon;
revoke all on function private.notify_friendship_change() from public, anon, authenticated;
revoke all on function private.notify_friend_match_invite_change() from public, anon, authenticated;
revoke all on function private.notify_rematch_offer_change() from public, anon, authenticated;
revoke all on function private.dispatch_app_notification() from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.notifications_register_push_token_impl(text, text, text) to authenticated;
grant execute on function private.notifications_unregister_push_token_impl(text) to authenticated;
grant execute on function private.notifications_inbox_impl(integer) to authenticated;
grant execute on function public.notifications_register_push_token(text, text, text) to authenticated;
grant execute on function public.notifications_unregister_push_token(text) to authenticated;
grant execute on function public.notifications_inbox(integer) to authenticated;
grant execute on function public.notifications_unread_count() to authenticated;
grant execute on function public.notifications_mark_read(uuid) to authenticated;
grant execute on function public.notifications_mark_all_read() to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end
$$;

commit;
