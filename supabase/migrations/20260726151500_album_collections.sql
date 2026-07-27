begin;

-- League collection goals for the player album. Progress is the number of
-- distinct album players who have a contract with a club in the target
-- league; rewards are claimed once per player per collection and flow
-- through the wallet ledger. Definitions are server-owned; clients only read
-- progress through the RPC below.

create table if not exists public.album_collection_defs (
  id text primary key,
  league text not null,
  target integer not null check (target > 0),
  reward_coins integer not null check (reward_coins > 0),
  active boolean not null default true,
  sort integer not null default 100
);

create table if not exists public.album_collection_claims (
  player_id uuid not null references public.profiles(id) on delete cascade,
  collection_id text not null references public.album_collection_defs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, collection_id)
);

alter table public.album_collection_defs enable row level security;
alter table public.album_collection_claims enable row level security;
revoke all on table public.album_collection_defs from public, anon, authenticated;
revoke all on table public.album_collection_claims from public, anon, authenticated;

insert into public.album_collection_defs (id, league, target, reward_coins, sort) values
  ('super-lig', 'Süper Lig', 10, 100, 10),
  ('premier-league', 'Premier League', 12, 80, 20),
  ('la-liga', 'La Liga', 12, 80, 30),
  ('serie-a', 'Serie A', 12, 80, 40),
  ('bundesliga', 'Bundesliga', 10, 80, 50),
  ('ligue-1', 'Ligue 1', 10, 80, 60)
on conflict (id) do nothing;

create or replace function public._album_collection_progress(p_player uuid, p_league text)
returns integer language sql stable set search_path = '' as $$
  select count(distinct pae.football_player_id)::integer
  from public.player_album_entries pae
  where pae.player_id = p_player
    and exists (
      select 1
      from public.player_club_contracts pcc
      join public.clubs c on c.id = pcc.club_id
      where pcc.player_id = pae.football_player_id
        and c.league = p_league
    );
$$;

create or replace function public.album_collections_mine()
returns table(
  collection_id text,
  league text,
  target integer,
  reward_coins integer,
  progress integer,
  claimed boolean
)
language sql security definer set search_path = '' as $$
  select
    d.id,
    d.league,
    d.target,
    d.reward_coins,
    least(public._album_collection_progress(auth.uid(), d.league), d.target),
    exists (
      select 1 from public.album_collection_claims c
      where c.player_id = auth.uid() and c.collection_id = d.id
    )
  from public.album_collection_defs d
  where auth.uid() is not null and d.active
  order by d.sort asc, d.id asc;
$$;

create or replace function public.album_collection_claim(p_collection_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  def public.album_collection_defs%rowtype;
  balance integer;
  progress integer;
  inserted boolean := false;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select coins into balance from public.profiles where id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select * into def from public.album_collection_defs where id = p_collection_id and active;
  if def.id is null then raise exception 'COLLECTION_NOT_FOUND'; end if;

  progress := public._album_collection_progress(me, def.league);
  if progress < def.target then raise exception 'COLLECTION_INCOMPLETE'; end if;

  insert into public.album_collection_claims(player_id, collection_id)
  values (me, def.id)
  on conflict (player_id, collection_id) do nothing
  returning true into inserted;

  if not coalesce(inserted, false) then
    return jsonb_build_object('granted', 0, 'balance', balance, 'claimed', true);
  end if;

  update public.profiles set coins = coins + def.reward_coins where id = me returning coins into balance;

  insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
  values (me, def.reward_coins, 'ALBUM_COLLECTION', def.id, balance, 'COIN');

  return jsonb_build_object('granted', def.reward_coins, 'balance', balance, 'claimed', true);
end
$$;

revoke all on function public._album_collection_progress(uuid, text) from public, anon, authenticated;
revoke all on function public.album_collections_mine() from public, anon;
revoke all on function public.album_collection_claim(text) from public, anon;
grant execute on function public.album_collections_mine() to authenticated;
grant execute on function public.album_collection_claim(text) to authenticated;

commit;
