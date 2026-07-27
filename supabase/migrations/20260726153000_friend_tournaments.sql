begin;

-- Four-player friend tournaments: two semifinals and a final played as
-- FRIEND-mode rooms. Bracket state is server-owned; clients act only through
-- the validated RPCs below and read state via tournament_mine. Advancement
-- happens inside the authoritative match_persist_finish chain. The champion
-- earns 150 coins through the wallet ledger, idempotent per tournament.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'FINISHED', 'CANCELLED')),
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'INVITED' check (status in ('INVITED', 'ACCEPTED', 'DECLINED')),
  seed integer,
  created_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create table if not exists public.tournament_matches (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  slot integer not null check (slot in (1, 2, 3)),
  room_key text not null unique,
  player_one_id uuid not null references public.profiles(id) on delete cascade,
  player_two_id uuid not null references public.profiles(id) on delete cascade,
  winner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'DONE')),
  created_at timestamptz not null default now(),
  primary key (tournament_id, slot),
  check (player_one_id <> player_two_id)
);

create index if not exists tournament_members_player_idx on public.tournament_members(player_id);

alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.tournament_matches enable row level security;
revoke all on table public.tournaments from public, anon, authenticated;
revoke all on table public.tournament_members from public, anon, authenticated;
revoke all on table public.tournament_matches from public, anon, authenticated;

create or replace function public._tournament_room_key()
returns text language sql volatile set search_path = '' as $$
  select 'trn-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

create or replace function public._tournament_open_for(p_player uuid)
returns uuid language sql stable set search_path = '' as $$
  select t.id
  from public.tournaments t
  join public.tournament_members m on m.tournament_id = t.id
  where m.player_id = p_player
    and m.status <> 'DECLINED'
    and (
      t.status = 'ACTIVE'
      or (t.status = 'PENDING' and t.created_at > now() - interval '24 hours')
    )
  order by t.created_at desc
  limit 1;
$$;

create or replace function public.tournament_create(p_friend_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  friend uuid;
  distinct_friends uuid[];
  tournament_id uuid;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select array_agg(distinct id) into distinct_friends
  from unnest(coalesce(p_friend_ids, array[]::uuid[])) as id
  where id is not null and id <> me;

  if distinct_friends is null or array_length(distinct_friends, 1) <> 3 then
    raise exception 'TOURNAMENT_NEEDS_THREE_FRIENDS';
  end if;

  if public._tournament_open_for(me) is not null then
    raise exception 'TOURNAMENT_ALREADY_ACTIVE';
  end if;

  foreach friend in array distinct_friends loop
    if not exists (
      select 1 from public.friendships f
      where f.status = 'ACCEPTED'
        and ((f.requester_id = me and f.addressee_id = friend)
          or (f.requester_id = friend and f.addressee_id = me))
    ) then
      raise exception 'NOT_FRIENDS';
    end if;
  end loop;

  insert into public.tournaments(creator_id) values (me) returning id into tournament_id;
  insert into public.tournament_members(tournament_id, player_id, status)
  values (tournament_id, me, 'ACCEPTED');

  foreach friend in array distinct_friends loop
    insert into public.tournament_members(tournament_id, player_id, status)
    values (tournament_id, friend, 'INVITED');
    insert into public.app_notifications(recipient_id, actor_id, type, source_key, entity_id, expires_at)
    values (friend, me, 'TOURNAMENT_INVITE', 'tournament:' || tournament_id::text, tournament_id, now() + interval '24 hours')
    on conflict (recipient_id, type, source_key) do nothing;
  end loop;

  return tournament_id;
end
$$;

create or replace function public.tournament_respond(p_tournament_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.tournaments%rowtype;
  accepted_count integer;
  seeds uuid[];
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.id is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;

  if t.status <> 'PENDING' then raise exception 'TOURNAMENT_NOT_PENDING'; end if;

  if t.created_at <= now() - interval '24 hours' then
    update public.tournaments set status = 'CANCELLED' where id = t.id;
    raise exception 'TOURNAMENT_EXPIRED';
  end if;

  update public.tournament_members
  set status = case when p_accept then 'ACCEPTED' else 'DECLINED' end
  where tournament_id = t.id and player_id = me and status = 'INVITED';
  if not found then raise exception 'TOURNAMENT_INVITE_NOT_FOUND'; end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where recipient_id = me and type = 'TOURNAMENT_INVITE'
    and source_key = 'tournament:' || t.id::text;

  if not p_accept then
    update public.tournaments set status = 'CANCELLED' where id = t.id;
    return 'DECLINED';
  end if;

  select count(*) into accepted_count
  from public.tournament_members
  where tournament_id = t.id and status = 'ACCEPTED';

  if accepted_count < 4 then return 'ACCEPTED'; end if;

  select array_agg(player_id order by md5(player_id::text || t.id::text)) into seeds
  from public.tournament_members
  where tournament_id = t.id and status = 'ACCEPTED';

  update public.tournament_members m
  set seed = seed_position.pos
  from (
    select ordered.player_id, ordered.ordinal::integer as pos
    from unnest(seeds) with ordinality as ordered(player_id, ordinal)
  ) seed_position
  where m.tournament_id = t.id and m.player_id = seed_position.player_id;

  insert into public.tournament_matches(tournament_id, slot, room_key, player_one_id, player_two_id)
  values
    (t.id, 1, public._tournament_room_key(), seeds[1], seeds[2]),
    (t.id, 2, public._tournament_room_key(), seeds[3], seeds[4]);

  update public.tournaments set status = 'ACTIVE', activated_at = now() where id = t.id;
  return 'STARTED';
end
$$;

create or replace function public.tournament_mine()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.tournaments%rowtype;
begin
  if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select t2.* into t
  from public.tournaments t2
  join public.tournament_members m on m.tournament_id = t2.id
  where m.player_id = me
    and m.status <> 'DECLINED'
    and (
      t2.status = 'ACTIVE'
      or (t2.status = 'PENDING' and t2.created_at > now() - interval '24 hours')
      or (t2.status = 'FINISHED' and t2.finished_at > now() - interval '3 days')
    )
  order by
    case t2.status when 'ACTIVE' then 0 when 'PENDING' then 1 else 2 end,
    t2.created_at desc
  limit 1;

  if t.id is null then return null; end if;

  return jsonb_build_object(
    'tournament_id', t.id,
    'status', t.status,
    'creator_id', t.creator_id,
    'winner', case when t.winner_id is null then null else (
      select jsonb_build_object('player_id', p.id, 'display_name', p.display_name)
      from public.profiles p where p.id = t.winner_id
    ) end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'player_id', p.id,
        'display_name', p.display_name,
        'status', m.status,
        'is_me', p.id = me
      ) order by m.created_at asc), '[]'::jsonb)
      from public.tournament_members m
      join public.profiles p on p.id = m.player_id
      where m.tournament_id = t.id
    ),
    'matches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', tm.slot,
        'status', tm.status,
        'winner_id', tm.winner_id,
        'player_one', jsonb_build_object('player_id', p1.id, 'display_name', p1.display_name),
        'player_two', jsonb_build_object('player_id', p2.id, 'display_name', p2.display_name),
        'room_key', case
          when tm.status = 'PENDING' and me in (tm.player_one_id, tm.player_two_id) then tm.room_key
          else null
        end
      ) order by tm.slot asc), '[]'::jsonb)
      from public.tournament_matches tm
      join public.profiles p1 on p1.id = tm.player_one_id
      join public.profiles p2 on p2.id = tm.player_two_id
      where tm.tournament_id = t.id
    )
  );
end
$$;

create or replace function public._tournament_advance(
  p_room_key text,
  p_winner uuid,
  p_player_one uuid,
  p_player_two uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  bracket public.tournament_matches%rowtype;
  semi_winners uuid[];
  champion_balance integer;
begin
  select * into bracket
  from public.tournament_matches
  where room_key = p_room_key and status = 'PENDING'
  for update;
  if bracket.tournament_id is null then return; end if;

  if p_winner not in (bracket.player_one_id, bracket.player_two_id) then return; end if;
  if not (
    (p_player_one = bracket.player_one_id and p_player_two = bracket.player_two_id)
    or (p_player_one = bracket.player_two_id and p_player_two = bracket.player_one_id)
  ) then return; end if;

  update public.tournament_matches
  set winner_id = p_winner, status = 'DONE'
  where tournament_id = bracket.tournament_id and slot = bracket.slot;

  if bracket.slot in (1, 2) then
    select array_agg(winner_id order by slot) into semi_winners
    from public.tournament_matches
    where tournament_id = bracket.tournament_id and slot in (1, 2) and status = 'DONE';

    if array_length(semi_winners, 1) = 2 then
      insert into public.tournament_matches(tournament_id, slot, room_key, player_one_id, player_two_id)
      values (bracket.tournament_id, 3, public._tournament_room_key(), semi_winners[1], semi_winners[2])
      on conflict (tournament_id, slot) do nothing;
    end if;
    return;
  end if;

  update public.tournaments
  set status = 'FINISHED', winner_id = p_winner, finished_at = now()
  where id = bracket.tournament_id and status = 'ACTIVE';
  if not found then return; end if;

  update public.profiles set coins = coins + 150 where id = p_winner
  returning coins into champion_balance;

  insert into public.wallet_transactions(player_id, amount, reason, reference_id, balance_after, currency)
  values (p_winner, 150, 'TOURNAMENT_WIN', bracket.tournament_id::text, champion_balance, 'COIN')
  on conflict (player_id, reason, reference_id) do nothing;
end
$$;

-- Latest match_persist_finish (actionable recent matches version) plus the
-- tournament advancement hook, guarded so bracket errors never break match
-- persistence.
create or replace function public.match_persist_finish(
  p_room_key text,
  p_match_winner uuid,
  p_final_scores jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  persisted_match public.matches%rowtype;
  completed_now boolean := false;
  loser uuid;
  season uuid;
  loser_before integer := 0;
  winner_delta integer := 0;
  loser_delta integer := 0;
begin
  select * into strict persisted_match
  from public.matches
  where public.matches.room_key = p_room_key
  for update;

  if p_match_winner not in (persisted_match.player_one_id, persisted_match.player_two_id) then
    raise exception 'INVALID_MATCH_WINNER';
  end if;

  update public.matches
  set status = 'FINISHED',
      winner_id = p_match_winner,
      score_one = coalesce((p_final_scores->>player_one_id::text)::smallint, score_one),
      score_two = coalesce((p_final_scores->>player_two_id::text)::smallint, score_two),
      finished_at = coalesce(finished_at, now())
  where id = persisted_match.id
    and status <> 'FINISHED'
  returning true into completed_now;

  if completed_now then
    perform public._quests_bump(persisted_match.player_one_id, 'MATCH_FINISH', 1);
    perform public._quests_bump(persisted_match.player_two_id, 'MATCH_FINISH', 1);

    loser := case
      when p_match_winner = persisted_match.player_one_id then persisted_match.player_two_id
      else persisted_match.player_one_id
    end;

    if persisted_match.mode in ('QUICK', 'BLITZ', 'RANKED') then
      perform public._quests_bump(persisted_match.player_one_id, 'SOCIAL_TOUCH', 1);
      perform public._quests_bump(persisted_match.player_two_id, 'SOCIAL_TOUCH', 1);
    end if;

    if persisted_match.mode = 'QUICK' then
      select trophies into loser_before from public.profiles where id = loser for update;
      winner_delta := 20;
      loser_delta := -least(loser_before, 8);
      update public.profiles set trophies = trophies + winner_delta where id = p_match_winner;
      update public.profiles set trophies = trophies + loser_delta where id = loser;

      select id into season
      from public.league_seasons
      where active
      order by starts_at desc
      limit 1;

      if season is not null then
        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, p_match_winner, 20, 1, 0)
        on conflict (season_id, player_id) do update
          set trophies = public.league_entries.trophies + 20,
              wins = public.league_entries.wins + 1,
              updated_at = now();

        insert into public.league_entries(season_id, player_id, trophies, wins, losses)
        values (season, loser, 0, 0, 1)
        on conflict (season_id, player_id) do update
          set trophies = greatest(0, public.league_entries.trophies - 8),
              losses = public.league_entries.losses + 1,
              updated_at = now();
      end if;
    elsif persisted_match.mode = 'BLITZ' then
      select blitz_trophies into loser_before from public.profiles where id = loser for update;
      winner_delta := 15;
      loser_delta := -least(loser_before, 5);
      update public.profiles set blitz_trophies = blitz_trophies + winner_delta where id = p_match_winner;
      update public.profiles set blitz_trophies = blitz_trophies + loser_delta where id = loser;
    elsif persisted_match.mode = 'RANKED' then
      select ranked_trophies into loser_before from public.profiles where id = loser for update;
      winner_delta := 25;
      loser_delta := -least(loser_before, 15);
      update public.profiles set ranked_trophies = ranked_trophies + winner_delta where id = p_match_winner;
      update public.profiles set ranked_trophies = ranked_trophies + loser_delta where id = loser;
    end if;

    update public.matches
    set trophy_delta_one = case
          when player_one_id = p_match_winner then winner_delta
          else loser_delta
        end,
        trophy_delta_two = case
          when player_two_id = p_match_winner then winner_delta
          else loser_delta
        end
    where id = persisted_match.id;

    begin
      perform public._achievements_on_match_completed(persisted_match.id);
    exception when others then
      raise warning 'achievement evaluation failed for match %: %', persisted_match.id, sqlerrm;
    end;

    begin
      perform public._tournament_advance(
        p_room_key,
        p_match_winner,
        persisted_match.player_one_id,
        persisted_match.player_two_id
      );
    exception when others then
      raise warning 'tournament advancement failed for match %: %', persisted_match.id, sqlerrm;
    end;
  end if;

  return persisted_match.id;
end
$$;

-- Inbox needs an actionable status for tournament invites.
create or replace function private.notifications_inbox_impl(
  p_limit integer default 50
) returns table(
  notification_id uuid,
  notification_type text,
  actor_id uuid,
  actor_name text,
  entity_id uuid,
  room_key text,
  match_mode text,
  action_status text,
  read_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  return query
  select
    notification.id,
    notification.type,
    notification.actor_id,
    coalesce(actor.display_name, 'Football Link'),
    notification.entity_id,
    notification.room_key,
    notification.match_mode,
    case notification.type
      when 'FRIEND_REQUEST' then coalesce((
        select friendship.status
        from public.friendships friendship
        where friendship.requester_id = notification.actor_id
          and friendship.addressee_id = me
        limit 1
      ), 'RESOLVED')
      when 'FRIEND_MATCH_INVITE' then coalesce((
        select invite.status
        from public.friend_match_invites invite
        where invite.id = notification.entity_id
        limit 1
      ), 'RESOLVED')
      when 'REMATCH_OFFER' then coalesce((
        select offer.status
        from public.rematch_offers offer
        where offer.id = notification.entity_id
        limit 1
      ), 'RESOLVED')
      when 'TOURNAMENT_INVITE' then coalesce((
        select case
          when member.status = 'INVITED' and tournament.status = 'PENDING' then 'PENDING'
          else 'RESOLVED'
        end
        from public.tournament_members member
        join public.tournaments tournament on tournament.id = member.tournament_id
        where member.tournament_id = notification.entity_id
          and member.player_id = me
        limit 1
      ), 'RESOLVED')
      else 'RESOLVED'
    end,
    notification.read_at,
    notification.expires_at,
    notification.created_at
  from public.app_notifications notification
  left join public.profiles actor on actor.id = notification.actor_id
  where notification.recipient_id = me
  order by notification.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end
$$;

revoke all on function public._tournament_room_key() from public, anon, authenticated;
revoke all on function public._tournament_open_for(uuid) from public, anon, authenticated;
revoke all on function public.tournament_create(uuid[]) from public, anon;
revoke all on function public.tournament_respond(uuid, boolean) from public, anon;
revoke all on function public.tournament_mine() from public, anon;
revoke all on function public._tournament_advance(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.tournament_create(uuid[]) to authenticated;
grant execute on function public.tournament_respond(uuid, boolean) to authenticated;
grant execute on function public.tournament_mine() to authenticated;
grant execute on function public._tournament_advance(text, uuid, uuid, uuid) to service_role;

commit;
