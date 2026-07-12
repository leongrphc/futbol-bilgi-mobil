alter table public.cosmetic_items drop constraint if exists cosmetic_items_kind_check;
alter table public.cosmetic_items add constraint cosmetic_items_kind_check check(kind in ('PITCH_THEME','BADGE','CHAT_STYLE'));
alter table public.user_cosmetic_loadouts add column if not exists chat_style_id text references public.cosmetic_items(id);
insert into public.cosmetic_items(id,name,kind,accent) values
  ('chat-classic','Klasik Tribün','CHAT_STYLE','#34D6A4'),
  ('chat-floodlight','Projektör','CHAT_STYLE','#EAF6FF'),
  ('chat-derby','Derbi Ateşi','CHAT_STYLE','#FF8A5C'),
  ('chat-neon','Gece Deplasmanı','CHAT_STYLE','#B896FF')
on conflict(id) do nothing;

create or replace function public.cosmetics_mine()
returns table(item_id text, name text, kind text, accent text, equipped boolean)
language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  insert into public.user_cosmetics(player_id,item_id) select me,id from public.cosmetic_items where available on conflict do nothing;
  insert into public.user_cosmetic_loadouts(player_id,pitch_theme_id,badge_id,chat_style_id) values(me,'pitch-classic','badge-link','chat-classic') on conflict(player_id) do nothing;
  update public.user_cosmetic_loadouts set chat_style_id=coalesce(chat_style_id,'chat-classic') where player_id=me;
  return query select c.id,c.name,c.kind,c.accent,(l.pitch_theme_id=c.id or l.badge_id=c.id or l.chat_style_id=c.id)
  from public.cosmetic_items c join public.user_cosmetics u on u.item_id=c.id and u.player_id=me join public.user_cosmetic_loadouts l on l.player_id=me
  where c.available order by case c.kind when 'CHAT_STYLE' then 1 when 'PITCH_THEME' then 2 else 3 end,c.id;
end $$;

create or replace function public.cosmetics_equip(p_item_id text)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); item public.cosmetic_items%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into strict item from public.cosmetic_items where id=p_item_id and available;
  if not exists(select 1 from public.user_cosmetics where player_id=me and item_id=item.id) then raise exception 'COSMETIC_NOT_OWNED'; end if;
  insert into public.user_cosmetic_loadouts(player_id,pitch_theme_id,badge_id,chat_style_id) values(me,null,null,null) on conflict(player_id) do nothing;
  if item.kind='PITCH_THEME' then update public.user_cosmetic_loadouts set pitch_theme_id=item.id,updated_at=now() where player_id=me;
  elsif item.kind='CHAT_STYLE' then update public.user_cosmetic_loadouts set chat_style_id=item.id,updated_at=now() where player_id=me;
  else update public.user_cosmetic_loadouts set badge_id=item.id,updated_at=now() where player_id=me; end if;
end $$;

create or replace function public.get_player_chat_style(p_player_id uuid)
returns text language sql security invoker set search_path='' stable as $$
  select coalesce((select chat_style_id from public.user_cosmetic_loadouts where player_id=p_player_id),'chat-classic');
$$;
revoke all on function public.get_player_chat_style(uuid) from public,anon,authenticated;
grant execute on function public.get_player_chat_style(uuid) to service_role;
