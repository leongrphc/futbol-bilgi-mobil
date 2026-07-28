begin;

-- Tutorial progress is private profile state. Complete it through an
-- owner-scoped RPC instead of filtering on the non-readable column in PostgREST.
revoke update (tutorial_completed_at) on table public.profiles from authenticated;

create or replace function public.complete_tutorial()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  completed_at timestamptz;
begin
  if me is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select tutorial_completed_at
    into completed_at
    from public.profiles
   where id = me
   for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if completed_at is null then
    completed_at := statement_timestamp();
    update public.profiles
       set tutorial_completed_at = completed_at
     where id = me;
  end if;

  return completed_at;
end
$$;

revoke all on function public.complete_tutorial() from public, anon;
grant execute on function public.complete_tutorial() to authenticated;

comment on function public.complete_tutorial() is
  'Idempotently completes the calling player''s first-login tutorial.';

commit;
