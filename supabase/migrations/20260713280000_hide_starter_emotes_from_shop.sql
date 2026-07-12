-- Starter emotes belong to every player and are not shop products.

alter table public.cosmetic_items
  add column if not exists shop_visible boolean not null default true;

update public.cosmetic_items
set shop_visible = false
where id in ('emote-fire', 'emote-clap', 'emote-ball', 'emote-eyes');

-- Backfill every existing player, including accounts that never opened the emote tray.
insert into public.user_cosmetics(player_id, item_id)
select p.id, c.id
from public.profiles p
cross join public.cosmetic_items c
where c.id in ('emote-fire', 'emote-clap', 'emote-ball', 'emote-eyes')
on conflict do nothing;

create or replace function public.grant_starter_cosmetics_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_cosmetics(player_id, item_id)
  select new.id, c.id
  from public.cosmetic_items c
  where c.id in ('emote-fire', 'emote-clap', 'emote-ball', 'emote-eyes')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists grant_starter_cosmetics_after_profile on public.profiles;
create trigger grant_starter_cosmetics_after_profile
after insert on public.profiles
for each row execute function public.grant_starter_cosmetics_for_profile();

revoke all on function public.grant_starter_cosmetics_for_profile() from public, anon, authenticated;

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
  where c.available and c.shop_visible
  order by case c.kind when 'EMOTE' then 0 when 'CHAT_STYLE' then 1 when 'PITCH_THEME' then 2 else 3 end,
           c.is_premium, coalesce(nullif(c.price_coins, 0), c.price_dollars), c.id;
end;
$$;

create or replace function public.emotes_mine()
returns table(item_id text, name text, glyph text, is_premium boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  insert into public.user_cosmetics(player_id, item_id)
  select me, c.id from public.cosmetic_items c
  where not c.shop_visible and c.available and c.kind = 'EMOTE'
  on conflict do nothing;

  return query
  select c.id, c.name, coalesce(c.glyph, '•'), c.is_premium
  from public.cosmetic_items c
  join public.user_cosmetics u on u.item_id = c.id and u.player_id = me
  where c.available and c.kind = 'EMOTE'
  order by c.shop_visible, c.is_premium, c.id;
end;
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
    left join public.user_cosmetics u on u.item_id = c.id and u.player_id = p_player_id
    where c.id = p_emote_id
      and c.kind = 'EMOTE'
      and c.available
      and (not c.shop_visible or u.player_id is not null)
  );
$$;

revoke all on function public.cosmetics_mine() from public, anon;
revoke all on function public.emotes_mine() from public, anon;
revoke all on function public.player_owns_emote(uuid, text) from public, anon, authenticated;
grant execute on function public.cosmetics_mine() to authenticated;
grant execute on function public.emotes_mine() to authenticated;
grant execute on function public.player_owns_emote(uuid, text) to service_role;
