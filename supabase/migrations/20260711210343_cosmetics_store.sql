create table public.cosmetic_items (id text primary key, name text not null, kind text not null check(kind in ('PITCH_THEME','BADGE')), accent text not null, available boolean not null default true);
create table public.user_cosmetics (player_id uuid not null references public.profiles(id) on delete cascade, item_id text not null references public.cosmetic_items(id) on delete cascade, acquired_at timestamptz not null default now(), primary key(player_id,item_id));
create table public.user_cosmetic_loadouts (player_id uuid primary key references public.profiles(id) on delete cascade, pitch_theme_id text references public.cosmetic_items(id), badge_id text references public.cosmetic_items(id), updated_at timestamptz not null default now());
alter table public.cosmetic_items enable row level security; alter table public.user_cosmetics enable row level security; alter table public.user_cosmetic_loadouts enable row level security;
insert into public.cosmetic_items(id,name,kind,accent) values ('pitch-classic','Klasik Çim','PITCH_THEME','#34D6A4'),('pitch-copper','Bakır Deplasman','PITCH_THEME','#F4C95D'),('badge-link','Bağlantı Rozeti','BADGE','#8CA6FF') on conflict(id) do nothing;
create or replace function public.cosmetics_mine()
returns table(item_id text, name text, kind text, accent text, equipped boolean)
language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  insert into public.user_cosmetics(player_id,item_id) select me,id from public.cosmetic_items where available on conflict do nothing;
  insert into public.user_cosmetic_loadouts(player_id,pitch_theme_id,badge_id) values(me,'pitch-classic','badge-link') on conflict(player_id) do nothing;
  return query select c.id,c.name,c.kind,c.accent,(l.pitch_theme_id=c.id or l.badge_id=c.id) from public.cosmetic_items c join public.user_cosmetics u on u.item_id=c.id and u.player_id=me join public.user_cosmetic_loadouts l on l.player_id=me where c.available order by c.kind,c.id;
end $$;
create or replace function public.cosmetics_equip(p_item_id text)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); item public.cosmetic_items%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into strict item from public.cosmetic_items where id=p_item_id and available;
  if not exists(select 1 from public.user_cosmetics where player_id=me and item_id=item.id) then raise exception 'COSMETIC_NOT_OWNED'; end if;
  insert into public.user_cosmetic_loadouts(player_id,pitch_theme_id,badge_id) values(me,null,null) on conflict(player_id) do nothing;
  if item.kind='PITCH_THEME' then update public.user_cosmetic_loadouts set pitch_theme_id=item.id,updated_at=now() where player_id=me; else update public.user_cosmetic_loadouts set badge_id=item.id,updated_at=now() where player_id=me; end if;
end $$;
revoke all on function public.cosmetics_mine() from public,anon; revoke all on function public.cosmetics_equip(text) from public,anon;
grant execute on function public.cosmetics_mine() to authenticated; grant execute on function public.cosmetics_equip(text) to authenticated;
