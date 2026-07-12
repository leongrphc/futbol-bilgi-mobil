-- Match emotes: free starter set + premium shop items (ownership only; no gameplay power)

alter table public.cosmetic_items drop constraint if exists cosmetic_items_kind_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_kind_check
  check (kind in ('PITCH_THEME', 'BADGE', 'CHAT_STYLE', 'EMOTE'));

alter table public.cosmetic_items
  add column if not exists is_premium boolean not null default false;

alter table public.cosmetic_items
  add column if not exists glyph text;

-- Free starter emotes (everyone)
insert into public.cosmetic_items (id, name, kind, accent, available, is_premium, glyph) values
  ('emote-fire', 'Ateş', 'EMOTE', '#FF8A5C', true, false, '🔥'),
  ('emote-clap', 'Alkış', 'EMOTE', '#F4C95D', true, false, '👏'),
  ('emote-ball', 'Top', 'EMOTE', '#34D6A4', true, false, '⚽'),
  ('emote-eyes', 'Göz', 'EMOTE', '#72C7FF', true, false, '👀')
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  accent = excluded.accent,
  available = excluded.available,
  is_premium = excluded.is_premium,
  glyph = excluded.glyph;

-- Premium emotes (shop unlock)
insert into public.cosmetic_items (id, name, kind, accent, available, is_premium, glyph) values
  ('emote-goat', 'GOAT', 'EMOTE', '#F4C95D', true, true, '🐐'),
  ('emote-crown', 'Taç', 'EMOTE', '#B896FF', true, true, '👑'),
  ('emote-bolt', 'Şimşek', 'EMOTE', '#72C7FF', true, true, '⚡'),
  ('emote-trophy', 'Kupa', 'EMOTE', '#F4C95D', true, true, '🏆'),
  ('emote-skull', 'Kafa', 'EMOTE', '#FF8A5C', true, true, '💀'),
  ('emote-party', 'Parti', 'EMOTE', '#34D6A4', true, true, '🎉'),
  ('emote-cold', 'Buz', 'EMOTE', '#72C7FF', true, true, '🥶'),
  ('emote-heart', 'Kalp', 'EMOTE', '#FF6B6B', true, true, '❤️')
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  accent = excluded.accent,
  available = excluded.available,
  is_premium = excluded.is_premium,
  glyph = excluded.glyph;

-- Catalog + ownership: auto-grant only non-premium starters
drop function if exists public.cosmetics_mine();
create or replace function public.cosmetics_mine()
returns table(
  item_id text,
  name text,
  kind text,
  accent text,
  equipped boolean,
  is_premium boolean,
  glyph text,
  owned boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  insert into public.user_cosmetics(player_id, item_id)
  select me, c.id
  from public.cosmetic_items c
  where c.available and not c.is_premium
  on conflict do nothing;

  insert into public.user_cosmetic_loadouts(player_id, pitch_theme_id, badge_id, chat_style_id)
  values (me, 'pitch-classic', 'badge-link', 'chat-classic')
  on conflict (player_id) do nothing;

  update public.user_cosmetic_loadouts
  set chat_style_id = coalesce(chat_style_id, 'chat-classic')
  where player_id = me;

  return query
  select
    c.id,
    c.name,
    c.kind,
    c.accent,
    (l.pitch_theme_id = c.id or l.badge_id = c.id or l.chat_style_id = c.id) as equipped,
    c.is_premium,
    c.glyph,
    exists (
      select 1 from public.user_cosmetics u
      where u.player_id = me and u.item_id = c.id
    ) as owned
  from public.cosmetic_items c
  join public.user_cosmetic_loadouts l on l.player_id = me
  where c.available
  order by
    case c.kind
      when 'EMOTE' then 0
      when 'CHAT_STYLE' then 1
      when 'PITCH_THEME' then 2
      else 3
    end,
    c.is_premium,
    c.id;
end;
$$;

create or replace function public.cosmetics_equip(p_item_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.cosmetic_items%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into strict item from public.cosmetic_items where id = p_item_id and available;
  if item.kind = 'EMOTE' then
    raise exception 'EMOTE_NOT_EQUIPPABLE';
  end if;
  if not exists (select 1 from public.user_cosmetics where player_id = me and item_id = item.id) then
    raise exception 'COSMETIC_NOT_OWNED';
  end if;
  insert into public.user_cosmetic_loadouts(player_id, pitch_theme_id, badge_id, chat_style_id)
  values (me, null, null, null)
  on conflict (player_id) do nothing;
  if item.kind = 'PITCH_THEME' then
    update public.user_cosmetic_loadouts set pitch_theme_id = item.id, updated_at = now() where player_id = me;
  elsif item.kind = 'CHAT_STYLE' then
    update public.user_cosmetic_loadouts set chat_style_id = item.id, updated_at = now() where player_id = me;
  else
    update public.user_cosmetic_loadouts set badge_id = item.id, updated_at = now() where player_id = me;
  end if;
end;
$$;

-- Soft purchase until real IAP: grants ownership only (no pay-to-win)
create or replace function public.cosmetics_purchase(p_item_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item public.cosmetic_items%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into item from public.cosmetic_items where id = p_item_id and available;
  if not found then raise exception 'COSMETIC_NOT_FOUND'; end if;
  if not item.is_premium then
    insert into public.user_cosmetics(player_id, item_id) values (me, item.id) on conflict do nothing;
    return true;
  end if;
  insert into public.user_cosmetics(player_id, item_id) values (me, item.id) on conflict do nothing;
  return true;
end;
$$;

-- Owned free+premium emotes for match UI (auto-grant free starters)
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
  select me, c.id
  from public.cosmetic_items c
  where c.available and c.kind = 'EMOTE' and not c.is_premium
  on conflict do nothing;

  return query
  select c.id, c.name, coalesce(c.glyph, '•'), c.is_premium
  from public.cosmetic_items c
  join public.user_cosmetics u on u.item_id = c.id and u.player_id = me
  where c.available and c.kind = 'EMOTE'
  order by c.is_premium, c.id;
end;
$$;

-- Service-role ownership check for match-server
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
    left join public.user_cosmetics u
      on u.item_id = c.id and u.player_id = p_player_id
    where c.id = p_emote_id
      and c.kind = 'EMOTE'
      and c.available
      and (not c.is_premium or u.player_id is not null)
  );
$$;

revoke all on function public.cosmetics_mine() from public, anon;
revoke all on function public.cosmetics_equip(text) from public, anon;
revoke all on function public.cosmetics_purchase(text) from public, anon;
revoke all on function public.emotes_mine() from public, anon;
revoke all on function public.player_owns_emote(uuid, text) from public, anon, authenticated;

grant execute on function public.cosmetics_mine() to authenticated;
grant execute on function public.cosmetics_equip(text) to authenticated;
grant execute on function public.cosmetics_purchase(text) to authenticated;
grant execute on function public.emotes_mine() to authenticated;
grant execute on function public.player_owns_emote(uuid, text) to service_role;
