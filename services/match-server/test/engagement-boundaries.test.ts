import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);
const files = readdirSync(migrationsDirectory);

function load(suffix: string): string {
  const name = files.find(file => file.endsWith(suffix));
  if (!name) throw new Error(`Migration ${suffix} is missing.`);
  return readFileSync(
    fileURLToPath(new URL(`../../../supabase/migrations/${name}`, import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ");
}

const streak = load("_login_streak.sql");
const weeklyReward = load("_weekly_league_reward.sql");
const h2h = load("_head_to_head_cards.sql");
const collections = load("_album_collections.sql");
const systemNotifications = load("_system_notification_triggers.sql");
const tournaments = load("_friend_tournaments.sql");

describe("login streak boundaries", () => {
  it("keeps streak state server-owned and coins in the ledger", () => {
    expect(streak).toMatch(/revoke all on table public\.login_streaks from public, anon, authenticated/i);
    expect(streak).toMatch(/create or replace function public\.streak_claim\(\)[\s\S]*?security definer set search_path = ''/i);
    expect(streak).toMatch(/for update/i);
    expect(streak).toMatch(/insert into public\.wallet_transactions[\s\S]*?'LOGIN_STREAK', today::text/i);
    expect(streak).toMatch(/grant execute on function public\.streak_claim\(\) to authenticated/i);
  });

  it("extends the wallet reason whitelist with the new server reasons only", () => {
    expect(streak).toMatch(/'LOGIN_STREAK', 'WEEKLY_LEAGUE', 'ALBUM_COLLECTION', 'TOURNAMENT_WIN'/i);
  });
});

describe("weekly league reward boundaries", () => {
  it("recomputes the previous week server-side and claims idempotently", () => {
    expect(weeklyReward).toMatch(/revoke all on table public\.weekly_league_claims from public, anon, authenticated/i);
    expect(weeklyReward).toMatch(/date_trunc\('week', now\(\)\) - interval '7 days'/i);
    expect(weeklyReward).toMatch(/on conflict \(player_id, week_start\) do nothing/i);
    expect(weeklyReward).toMatch(/raise exception 'NOT_WEEKLY_CHAMPION'/i);
    expect(weeklyReward).toMatch(/f\.status = 'ACCEPTED'/i);
  });
});

describe("head-to-head boundaries", () => {
  it("exposes only aggregate win counts and keeps card RPC service-role", () => {
    expect(h2h).toMatch(/create or replace function public\._h2h_wins[\s\S]*?stable set search_path = ''/i);
    expect(h2h).toMatch(/m\.status = 'FINISHED'/i);
    expect(h2h).toMatch(/grant execute on function public\.match_player_cards\(uuid\[\]\) to service_role/i);
    expect(h2h).not.toMatch(/grant execute on function public\.match_player_cards\(uuid\[\]\) to authenticated/i);
    expect(h2h).not.toMatch(/submissions|raw_answer/i);
  });
});

describe("album collection boundaries", () => {
  it("locks definitions and claims behind RPCs with ledgered rewards", () => {
    expect(collections).toMatch(/revoke all on table public\.album_collection_defs from public, anon, authenticated/i);
    expect(collections).toMatch(/revoke all on table public\.album_collection_claims from public, anon, authenticated/i);
    expect(collections).toMatch(/raise exception 'COLLECTION_INCOMPLETE'/i);
    expect(collections).toMatch(/on conflict \(player_id, collection_id\) do nothing/i);
    expect(collections).toMatch(/'ALBUM_COLLECTION', def\.id/i);
  });
});

describe("system notification boundaries", () => {
  it("keeps enqueue functions service-role only and idempotent per source key", () => {
    expect(systemNotifications).toMatch(/grant execute on function public\.system_enqueue_streak_reminders\(\) to service_role/i);
    expect(systemNotifications).toMatch(/grant execute on function public\.system_enqueue_weekly_reward_reminders\(\) to service_role/i);
    expect(systemNotifications).toMatch(/revoke all on function public\.system_enqueue_streak_reminders\(\) from public, anon, authenticated/i);
    expect(systemNotifications).toMatch(/on conflict \(recipient_id, type, source_key\) do nothing/i);
    expect(systemNotifications).toMatch(/'STREAK_REMINDER', 'WEEKLY_REWARD_READY', 'TOURNAMENT_INVITE'/i);
  });
});

describe("tournament boundaries", () => {
  it("locks bracket tables and advancement behind server control", () => {
    expect(tournaments).toMatch(/revoke all on table public\.tournaments from public, anon, authenticated/i);
    expect(tournaments).toMatch(/revoke all on table public\.tournament_members from public, anon, authenticated/i);
    expect(tournaments).toMatch(/revoke all on table public\.tournament_matches from public, anon, authenticated/i);
    expect(tournaments).toMatch(/grant execute on function public\._tournament_advance\(text, uuid, uuid, uuid\) to service_role/i);
    expect(tournaments).not.toMatch(/grant execute on function public\._tournament_advance\(text, uuid, uuid, uuid\) to authenticated/i);
  });

  it("requires accepted friendships and verifies participants before advancing", () => {
    expect(tournaments).toMatch(/raise exception 'NOT_FRIENDS'/i);
    expect(tournaments).toMatch(/raise exception 'TOURNAMENT_NEEDS_THREE_FRIENDS'/i);
    expect(tournaments).toMatch(/p_winner not in \(bracket\.player_one_id, bracket\.player_two_id\)/i);
    expect(tournaments).toMatch(/room_key = p_room_key and status = 'PENDING' for update/i);
  });

  it("pays the champion once through the ledger and hides room keys from spectators", () => {
    expect(tournaments).toMatch(/'TOURNAMENT_WIN', bracket\.tournament_id::text/i);
    expect(tournaments).toMatch(/on conflict \(player_id, reason, reference_id\) do nothing/i);
    expect(tournaments).toMatch(/when tm\.status = 'PENDING' and me in \(tm\.player_one_id, tm\.player_two_id\) then tm\.room_key/i);
  });

  it("keeps the tournament hook from breaking match persistence", () => {
    expect(tournaments).toMatch(/exception when others then raise warning 'tournament advancement failed/i);
  });
});
