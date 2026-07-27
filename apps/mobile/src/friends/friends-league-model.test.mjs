import assert from "node:assert/strict";
import test from "node:test";

import { buildFriendsLeague, formatWeeklyDelta } from "./friends-league-model.ts";

const row = (overrides = {}) => ({
  player_id: "id-" + Math.trunc(Math.random() * 1e9),
  display_name: "Player",
  player_code: "AB12CD",
  is_me: false,
  weekly_trophy_delta: 0,
  weekly_wins: 0,
  weekly_losses: 0,
  weekly_matches: 0,
  ...overrides,
});

test("orders by weekly trophy delta, then wins, then name", () => {
  const standings = buildFriendsLeague([
    row({ player_id: "a", display_name: "Zeynep", weekly_trophy_delta: 40, weekly_wins: 2 }),
    row({ player_id: "b", display_name: "Ali", weekly_trophy_delta: 55, weekly_wins: 3 }),
    row({ player_id: "c", display_name: "Cem", weekly_trophy_delta: 40, weekly_wins: 3 }),
    row({ player_id: "d", display_name: "Bora", weekly_trophy_delta: 40, weekly_wins: 2 }),
  ]);
  assert.deepEqual(standings.map(s => s.playerId), ["b", "c", "d", "a"]);
});

test("tied delta and wins share the same rank, next rank skips", () => {
  const standings = buildFriendsLeague([
    row({ player_id: "a", display_name: "Ada", weekly_trophy_delta: 20, weekly_wins: 1 }),
    row({ player_id: "b", display_name: "Ben", weekly_trophy_delta: 20, weekly_wins: 1 }),
    row({ player_id: "c", display_name: "Can", weekly_trophy_delta: 5, weekly_wins: 1 }),
  ]);
  assert.deepEqual(standings.map(s => s.rank), [1, 1, 3]);
});

test("keeps my row flagged and zero-week friends listed", () => {
  const standings = buildFriendsLeague([
    row({ player_id: "me", display_name: "Ben", is_me: true, weekly_trophy_delta: -8, weekly_losses: 1, weekly_matches: 1 }),
    row({ player_id: "idle", display_name: "Idle Friend" }),
  ]);
  assert.equal(standings.length, 2);
  assert.equal(standings[0].playerId, "idle");
  assert.equal(standings[1].isMe, true);
  assert.equal(standings[1].trophyDelta, -8);
});

test("drops malformed rows and coerces non-finite counters to zero", () => {
  const standings = buildFriendsLeague([
    row({ player_id: "ok", weekly_trophy_delta: "12", weekly_wins: Number.NaN, weekly_matches: null }),
    { ...row(), player_id: "" },
    null,
  ]);
  assert.equal(standings.length, 1);
  assert.equal(standings[0].trophyDelta, 12);
  assert.equal(standings[0].wins, 0);
  assert.equal(standings[0].matches, 0);
});

test("falls back to player code when display name is blank", () => {
  const standings = buildFriendsLeague([row({ player_id: "x", display_name: "  ", player_code: "ZZ99XX" })]);
  assert.equal(standings[0].displayName, "ZZ99XX");
});

test("formats weekly deltas with explicit sign", () => {
  assert.equal(formatWeeklyDelta(25), "+25");
  assert.equal(formatWeeklyDelta(0), "0");
  assert.equal(formatWeeklyDelta(-15), "−15");
});
