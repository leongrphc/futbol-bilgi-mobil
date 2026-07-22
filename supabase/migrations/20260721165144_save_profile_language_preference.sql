alter table public.profiles
  add column if not exists preferred_locale text
  check (preferred_locale in ('tr', 'en'));

-- Profile updates remain protected by profile_self_update. Granting only this
-- column keeps trophies and wallet balances server-owned.
grant update (preferred_locale) on public.profiles to authenticated;

comment on column public.profiles.preferred_locale is
  'Optional ISO language selected by the player; currently tr or en.';
