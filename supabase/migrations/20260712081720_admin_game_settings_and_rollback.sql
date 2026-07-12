create table public.game_settings (
  key text primary key,
  value integer not null,
  minimum integer not null,
  maximum integer not null,
  description text not null,
  updated_at timestamptz not null default now(),
  check (minimum <= value and value <= maximum)
);
alter table public.game_settings enable row level security;
revoke all on table public.game_settings from public, anon, authenticated;
grant select, insert, update on table public.game_settings to service_role;

insert into public.game_settings(key,value,minimum,maximum,description) values
  ('team_pool_size',10,4,30,'Maç başında sunulan takım sayısı'),
  ('selection_seconds',20,5,60,'Takım seçimi süresi'),
  ('answer_seconds',15,5,45,'Cevap süresi'),
  ('reveal_seconds',4,2,15,'Round sonucu gösterim süresi'),
  ('reconnect_seconds',60,10,120,'Yeniden bağlanma penceresi'),
  ('maximum_rounds',9,3,15,'Normal maç maksimum round sayısı'),
  ('winning_score',3,1,7,'Maçı kazanmak için gereken puan'),
  ('sudden_death_min_answers',1,1,10,'Ani ölüm pair minimum cevap sayısı'),
  ('quick_win_trophies',25,1,100,'Hızlı maç galibiyet kupa ödülü'),
  ('quick_loss_trophies',10,0,100,'Hızlı maç mağlubiyet kupa kaybı'),
  ('ad_match_frequency',3,1,10,'Geçiş reklamı maç sıklığı')
on conflict(key) do nothing;

create or replace function public.admin_activate_football_version(p_version_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.football_data_versions where id=p_version_id and status in ('ACTIVE','ARCHIVED','ROLLED_BACK')) then
    raise exception 'VERSION_NOT_ACTIVATABLE';
  end if;
  update public.football_data_versions set status='ARCHIVED' where status='ACTIVE' and id<>p_version_id;
  update public.football_data_versions set status='ACTIVE',published_at=coalesce(published_at,now()) where id=p_version_id;
end $$;
revoke all on function public.admin_activate_football_version(uuid) from public,anon,authenticated;
grant execute on function public.admin_activate_football_version(uuid) to service_role;
