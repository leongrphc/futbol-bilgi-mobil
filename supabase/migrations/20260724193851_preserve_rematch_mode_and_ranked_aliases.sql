begin;

alter table public.rematch_offers
  add column if not exists match_mode text not null default 'FRIEND'
  check (match_mode in ('FRIEND', 'QUICK', 'BLITZ', 'RANKED', 'EVENT'));

update public.rematch_offers
set match_mode = case
  when room_key like 'quick-%' then 'QUICK'
  when room_key like 'blitz-%' then 'BLITZ'
  when room_key like 'ranked-%' then 'RANKED'
  when room_key like 'event-%' then 'EVENT'
  else 'FRIEND'
end;

revoke update on table public.rematch_offers from authenticated;
grant update (status) on table public.rematch_offers to authenticated;

insert into public.player_aliases
  (player_id, alias, normalized_alias, is_accepted_answer, source)
select id, alias, normalized_alias, true, 'MANUAL'
from public.players
cross join (
  values
    ('Alex', 'alex'),
    ('Alex de Souza', 'alex de souza')
) as accepted_aliases(alias, normalized_alias)
where external_id = 'Q507815'
on conflict (player_id, normalized_alias) do update
set alias = excluded.alias,
    is_accepted_answer = true,
    source = 'MANUAL';

insert into public.player_aliases
  (player_id, alias, normalized_alias, is_accepted_answer, source)
select id, 'Şahin', 'sahin', true, 'MANUAL'
from public.players
where external_id = 'Q75857'
on conflict (player_id, normalized_alias) do update
set alias = excluded.alias,
    is_accepted_answer = true,
    source = 'MANUAL';

update public.player_aliases
set is_accepted_answer = false,
    source = 'MANUAL'
where normalized_alias = 'nuri'
  and player_id = (
    select id
    from public.players
    where external_id = 'Q75857'
  );

commit;
