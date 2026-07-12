-- Match history: last 10 finished matches only

create or replace function public.competition_my_history()
returns table(match_id uuid, mode text, opponent_name text, score_for smallint, score_against smallint, outcome text, finished_at timestamptz)
language sql security definer set search_path='' as $$
  select m.id, m.mode, opponent.display_name,
    case when m.player_one_id = auth.uid() then m.score_one else m.score_two end,
    case when m.player_one_id = auth.uid() then m.score_two else m.score_one end,
    case when m.winner_id = auth.uid() then 'WIN' else 'LOSS' end, m.finished_at
  from public.matches m
  join public.profiles opponent on opponent.id = case when m.player_one_id = auth.uid() then m.player_two_id else m.player_one_id end
  where auth.uid() is not null
    and auth.uid() in (m.player_one_id, m.player_two_id)
    and m.status = 'FINISHED'
  order by m.finished_at desc nulls last
  limit 10;
$$;

revoke all on function public.competition_my_history() from public, anon;
grant execute on function public.competition_my_history() to authenticated;
