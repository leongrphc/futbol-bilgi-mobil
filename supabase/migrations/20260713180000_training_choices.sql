-- Training/bot multiple-choice helpers. Service-role only — never expose full answer keys to clients.

create or replace function public.match_training_choices(
  version_id uuid,
  club_a_external text,
  club_b_external text,
  choice_count integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  n integer := greatest(2, least(coalesce(choice_count, 3), 5));
  correct_name text;
  names text[] := array[]::text[];
  distractor text;
  result jsonb := '[]'::jsonb;
begin
  if version_id is null or club_a_external is null or club_b_external is null then
    return '[]'::jsonb;
  end if;

  select p.game_name into correct_name
  from club_pair_players cpp
  join clubs a on a.id in (cpp.club_low_id, cpp.club_high_id)
  join clubs b on b.id in (cpp.club_low_id, cpp.club_high_id)
  join players p on p.id = cpp.player_id
  where cpp.football_data_version_id = version_id
    and cpp.is_active
    and a.external_id = club_a_external
    and b.external_id = club_b_external
    and a.id <> b.id
  order by random()
  limit 1;

  if correct_name is null then
    return '[]'::jsonb;
  end if;

  names := array_append(names, correct_name);

  for distractor in
    select p.game_name
    from players p
    where p.game_name is not null
      and length(trim(p.game_name)) > 1
      and p.game_name <> correct_name
      and exists (
        select 1 from player_aliases pa
        where pa.player_id = p.id and pa.is_accepted_answer
      )
      and not exists (
        select 1
        from club_pair_players cpp
        join clubs a on a.id in (cpp.club_low_id, cpp.club_high_id)
        join clubs b on b.id in (cpp.club_low_id, cpp.club_high_id)
        where cpp.football_data_version_id = version_id
          and cpp.is_active
          and a.external_id = club_a_external
          and b.external_id = club_b_external
          and a.id <> b.id
          and cpp.player_id = p.id
      )
    order by random()
    limit (n - 1)
  loop
    names := array_append(names, distractor);
  end loop;

  -- shuffle
  select coalesce(jsonb_agg(name order by random()), '[]'::jsonb)
  into result
  from unnest(names) as name;

  return result;
end $$;

revoke all on function public.match_training_choices(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.match_training_choices(uuid, text, text, integer) to service_role;
