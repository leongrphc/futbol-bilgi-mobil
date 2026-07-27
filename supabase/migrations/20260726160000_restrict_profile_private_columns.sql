begin;

-- The profiles read policy is intentionally open so player cards, ladders and
-- friend lists can resolve any opponent. Table-wide SELECT made that openness
-- leak private state as well: any authenticated client could read another
-- player's wallet balances, language preference and tutorial progress.
--
-- SELECT is now column-scoped to the public player card. The owner reads the
-- private columns through a security definer RPC that only ever returns its
-- own row, so no client-side filter can be tampered with.

revoke select on table public.profiles from anon, authenticated;

grant select (
  id,
  display_name,
  player_code,
  avatar_url,
  trophies,
  blitz_trophies,
  ranked_trophies,
  created_at
) on table public.profiles to authenticated;

create or replace function public.profile_self()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  profile_row public.profiles%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into profile_row from public.profiles where id = me;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  return jsonb_build_object(
    'id', profile_row.id,
    'display_name', profile_row.display_name,
    'player_code', profile_row.player_code,
    'preferred_locale', profile_row.preferred_locale,
    'avatar_url', profile_row.avatar_url,
    'trophies', profile_row.trophies,
    'blitz_trophies', profile_row.blitz_trophies,
    'ranked_trophies', profile_row.ranked_trophies,
    'coins', profile_row.coins,
    'dollars', profile_row.dollars,
    'tutorial_completed_at', profile_row.tutorial_completed_at
  );
end
$$;

revoke all on function public.profile_self() from public, anon;
grant execute on function public.profile_self() to authenticated;

comment on function public.profile_self() is
  'Returns the calling player''s own profile, including the wallet, locale and tutorial columns that table-level SELECT no longer exposes.';

commit;
