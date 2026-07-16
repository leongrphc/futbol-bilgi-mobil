-- Store-verified entitlements. Clients can read only their own active status;
-- receipt verification will be added server-side when store accounts exist.
create table public.player_entitlements (
  player_id uuid not null references public.profiles(id) on delete cascade,
  entitlement text not null check (entitlement in ('REMOVE_ADS')),
  status text not null check (status in ('ACTIVE', 'EXPIRED', 'REVOKED')),
  store text not null check (store in ('GOOGLE_PLAY', 'APP_STORE', 'PROMO')),
  product_id text not null,
  original_transaction_id text,
  verified_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, entitlement),
  check (status <> 'REVOKED' or revoked_at is not null)
);

create unique index player_entitlements_store_transaction_uidx
  on public.player_entitlements(store, original_transaction_id)
  where original_transaction_id is not null;

alter table public.player_entitlements enable row level security;

create policy player_entitlements_select_own
  on public.player_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = player_id);

revoke all on table public.player_entitlements from public, anon, authenticated;
grant select on table public.player_entitlements to authenticated;

create function public.monetization_status()
returns table (ads_removed boolean, source text, expires_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.player_entitlements e
      where e.player_id = (select auth.uid())
        and e.entitlement = 'REMOVE_ADS'
        and e.status = 'ACTIVE'
        and (e.expires_at is null or e.expires_at > now())
    ) as ads_removed,
    (
      select e.store
      from public.player_entitlements e
      where e.player_id = (select auth.uid())
        and e.entitlement = 'REMOVE_ADS'
        and e.status = 'ACTIVE'
        and (e.expires_at is null or e.expires_at > now())
      limit 1
    ) as source,
    (
      select e.expires_at
      from public.player_entitlements e
      where e.player_id = (select auth.uid())
        and e.entitlement = 'REMOVE_ADS'
        and e.status = 'ACTIVE'
        and (e.expires_at is null or e.expires_at > now())
      limit 1
    ) as expires_at;
$$;

revoke all on function public.monetization_status() from public, anon;
grant execute on function public.monetization_status() to authenticated;
