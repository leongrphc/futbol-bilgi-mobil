-- Category shop with coin basics and dollar-exclusive cosmetics.

alter table public.profiles
  add column if not exists dollars integer not null default 0 check (dollars >= 0);

-- Wallet columns stay server-owned; only harmless profile fields are client editable.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

alter table public.cosmetic_items
  add column if not exists price_dollars integer not null default 0 check (price_dollars >= 0);

insert into public.cosmetic_items(id, name, kind, accent, available, is_premium, price_coins, price_dollars) values
  ('pitch-floodlight', 'Projektör Sahası', 'PITCH_THEME', '#72C7FF', true, false, 28, 0),
  ('pitch-midnight', 'Gece Finali', 'PITCH_THEME', '#B896FF', true, true, 0, 5)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  accent = excluded.accent,
  available = excluded.available,
  is_premium = excluded.is_premium,
  price_coins = excluded.price_coins,
  price_dollars = excluded.price_dollars;

-- Every visible item has exactly one price. Coin items are regular; dollar items are special.
update public.cosmetic_items set
  price_coins = case id
    when 'emote-fire' then 6
    when 'emote-clap' then 6
    when 'emote-ball' then 8
    when 'emote-eyes' then 8
    when 'emote-heart' then 12
    when 'emote-party' then 14
    when 'emote-bolt' then 15
    when 'emote-skull' then 16
    when 'emote-goat' then 18
    when 'emote-cold' then 20
    when 'chat-classic' then 10
    when 'chat-floodlight' then 18
    when 'chat-derby' then 22
    when 'pitch-classic' then 15
    when 'pitch-floodlight' then 28
    when 'badge-link' then 12
    when 'badge-bronze-season' then 20
    when 'badge-silver-season' then 30
    when 'emote-crown' then 0
    when 'emote-trophy' then 0
    when 'chat-neon' then 0
    when 'pitch-copper' then 0
    when 'pitch-midnight' then 0
    when 'badge-gold-season' then 0
    when 'badge-elite-season' then 0
    else greatest(price_coins, 10)
  end,
  price_dollars = case id
    when 'emote-crown' then 2
    when 'emote-trophy' then 3
    when 'chat-neon' then 3
    when 'pitch-copper' then 4
    when 'pitch-midnight' then 5
    when 'badge-gold-season' then 3
    when 'badge-elite-season' then 5
    else 0
  end
where available;

update public.cosmetic_items set is_premium = price_dollars > 0 where available;

alter table public.cosmetic_items drop constraint if exists cosmetic_items_single_currency_price;
alter table public.cosmetic_items
  add constraint cosmetic_items_single_currency_price check (
    not available or ((price_coins > 0)::integer + (price_dollars > 0)::integer = 1)
  );

alter table public.coin_transactions rename to wallet_transactions;
alter index if exists coin_transactions_player_created_idx rename to wallet_transactions_player_created_idx;
alter table public.wallet_transactions
  add column if not exists currency text not null default 'COIN' check (currency in ('COIN', 'DOLLAR'));
revoke all on public.wallet_transactions from public, anon, authenticated;

drop function if exists public.cosmetics_mine();
create function public.cosmetics_mine()
returns table(
  item_id text,
  name text,
  kind text,
  accent text,
  equipped boolean,
  is_premium boolean,
  glyph text,
  owned boolean,
  price_coins integer,
  price_dollars integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  insert into public.user_cosmetic_loadouts(player_id, pitch_theme_id, badge_id, chat_style_id)
  values (me, 'pitch-classic', 'badge-link', 'chat-classic')
  on conflict (player_id) do nothing;

  return query
  select c.id, c.name, c.kind, c.accent,
         (l.pitch_theme_id = c.id or l.badge_id = c.id or l.chat_style_id = c.id),
         c.is_premium, c.glyph,
         exists (select 1 from public.user_cosmetics u where u.player_id = me and u.item_id = c.id),
         c.price_coins, c.price_dollars
  from public.cosmetic_items c
  join public.user_cosmetic_loadouts l on l.player_id = me
  where c.available
  order by case c.kind when 'EMOTE' then 0 when 'CHAT_STYLE' then 1 when 'PITCH_THEME' then 2 else 3 end,
           c.is_premium, coalesce(nullif(c.price_coins, 0), c.price_dollars), c.id;
end;
$$;

drop function if exists public.cosmetics_purchase(text);
create function public.cosmetics_purchase(p_item_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.cosmetic_items%rowtype;
  new_balance integer;
  spent_currency text;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into item from public.cosmetic_items where id = p_item_id and available;
  if not found then raise exception 'COSMETIC_NOT_FOUND'; end if;

  -- One profile-row lock serializes both currencies for concurrent purchases.
  perform 1 from public.profiles p where p.id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if exists (select 1 from public.user_cosmetics where player_id = me and item_id = item.id) then
    if item.price_dollars > 0 then
      select dollars into new_balance from public.profiles where id = me;
    else
      select coins into new_balance from public.profiles where id = me;
    end if;
    return new_balance;
  end if;

  if item.price_dollars > 0 then
    spent_currency := 'DOLLAR';
    update public.profiles
    set dollars = dollars - item.price_dollars
    where id = me and dollars >= item.price_dollars
    returning dollars into new_balance;
    if not found then raise exception 'INSUFFICIENT_DOLLARS'; end if;
    insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
    values (me, -item.price_dollars, 'COSMETIC_PURCHASE', item.id, new_balance, spent_currency);
  elsif item.price_coins > 0 then
    spent_currency := 'COIN';
    update public.profiles
    set coins = coins - item.price_coins
    where id = me and coins >= item.price_coins
    returning coins into new_balance;
    if not found then raise exception 'INSUFFICIENT_COINS'; end if;
    insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
    values (me, -item.price_coins, 'COSMETIC_PURCHASE', item.id, new_balance, spent_currency);
  else
    raise exception 'COSMETIC_NOT_FOR_SALE';
  end if;

  insert into public.user_cosmetics(player_id, item_id) values (me, item.id);
  return new_balance;
end;
$$;

drop function if exists public.emotes_mine();
create function public.emotes_mine()
returns table(item_id text, name text, glyph text, is_premium boolean)
language sql
security definer
set search_path = ''
stable
as $$
  select c.id, c.name, coalesce(c.glyph, '•'), c.is_premium
  from public.cosmetic_items c
  join public.user_cosmetics u on u.item_id = c.id and u.player_id = auth.uid()
  where c.available and c.kind = 'EMOTE'
  order by c.is_premium, c.id;
$$;

create or replace function public.player_owns_emote(p_player_id uuid, p_emote_id text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.cosmetic_items c
    join public.user_cosmetics u on u.item_id = c.id and u.player_id = p_player_id
    where c.id = p_emote_id and c.kind = 'EMOTE' and c.available
  );
$$;

revoke all on function public.cosmetics_mine() from public, anon;
revoke all on function public.cosmetics_purchase(text) from public, anon;
revoke all on function public.emotes_mine() from public, anon;
revoke all on function public.player_owns_emote(uuid, text) from public, anon, authenticated;
grant execute on function public.cosmetics_mine() to authenticated;
grant execute on function public.cosmetics_purchase(text) to authenticated;
grant execute on function public.emotes_mine() to authenticated;
grant execute on function public.player_owns_emote(uuid, text) to service_role;
