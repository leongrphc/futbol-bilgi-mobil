alter table public.profiles
  add column if not exists tutorial_completed_at timestamptz;

-- This feature only gates accounts created after rollout. Existing players have
-- already passed the first-run experience and must not be forced through it.
update public.profiles
set tutorial_completed_at = now()
where tutorial_completed_at is null;

-- Wallet/trophy fields remain server-owned. The client may only complete the
-- tutorial for its own profile, protected by the existing profile_self_update
-- RLS policy. Once completed, the timestamp cannot be cleared or rewritten.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, tutorial_completed_at) on public.profiles to authenticated;

create or replace function public.prevent_tutorial_completion_reset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.tutorial_completed_at is not null
     and new.tutorial_completed_at is distinct from old.tutorial_completed_at then
    raise exception 'TUTORIAL_ALREADY_COMPLETED';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_tutorial_completion_reset on public.profiles;
create trigger prevent_tutorial_completion_reset
before update of tutorial_completed_at on public.profiles
for each row execute procedure public.prevent_tutorial_completion_reset();

revoke execute on function public.prevent_tutorial_completion_reset() from public, anon, authenticated;

comment on column public.profiles.tutorial_completed_at is
  'Set once after the mandatory first-login tutorial match finishes.';
