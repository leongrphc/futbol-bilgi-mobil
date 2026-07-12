-- Blitz ladder visibility for competition screen (separate from season trophies)

create or replace function public.competition_blitz_nearby()
returns table(
  rank bigint,
  display_name text,
  player_code text,
  blitz_trophies integer,
  is_me boolean
)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select
      row_number() over (order by p.blitz_trophies desc, p.created_at asc) as rank,
      p.id,
      p.display_name,
      p.player_code,
      p.blitz_trophies
    from public.profiles p
    where p.blitz_trophies > 0
       or p.id = auth.uid()
  ),
  me as (
    select rank from ranked where id = auth.uid()
  )
  select r.rank, r.display_name, r.player_code, r.blitz_trophies, r.id = auth.uid() as is_me
  from ranked r
  left join me on true
  where auth.uid() is not null
    and (
      me.rank is null and r.rank <= 20
      or me.rank is not null and r.rank between greatest(1, me.rank - 5) and me.rank + 5
      or r.rank <= 10
    )
  order by r.rank
  limit 25;
$$;

revoke all on function public.competition_blitz_nearby() from public, anon;
grant execute on function public.competition_blitz_nearby() to authenticated;
