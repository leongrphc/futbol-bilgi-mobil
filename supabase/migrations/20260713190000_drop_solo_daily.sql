-- Remove solo daily board (product decision: easy to cheat via web search; training stays bot MCQ)

drop function if exists public.solo_daily_summary();
drop function if exists public.solo_daily_submit(smallint, text);
drop function if exists public.solo_daily_board();
drop function if exists public._solo_pair_difficulty(integer);
drop function if exists public._solo_active_version();
drop function if exists public._solo_board_day();
drop table if exists public.solo_daily_attempts;
