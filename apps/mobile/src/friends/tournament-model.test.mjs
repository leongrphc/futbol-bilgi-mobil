import assert from "node:assert/strict";
import test from "node:test";

import { parseTournament } from "./tournament-model.ts";

const payload = {
  tournament_id: "t1",
  status: "ACTIVE",
  creator_id: "me",
  winner: null,
  members: [
    { player_id: "me", display_name: "Ben", status: "ACCEPTED", is_me: true },
    { player_id: "a", display_name: "Ayşe", status: "ACCEPTED", is_me: false },
    { player_id: "b", display_name: "Berk", status: "ACCEPTED", is_me: false },
    { player_id: "c", display_name: "Can", status: "ACCEPTED", is_me: false },
  ],
  matches: [
    { slot: 2, status: "PENDING", winner_id: null, player_one: { player_id: "b", display_name: "Berk" }, player_two: { player_id: "c", display_name: "Can" }, room_key: null },
    { slot: 1, status: "PENDING", winner_id: null, player_one: { player_id: "me", display_name: "Ben" }, player_two: { player_id: "a", display_name: "Ayşe" }, room_key: "trn-abc123" },
  ],
};

test("parses an active bracket and finds my pending match", () => {
  const view = parseTournament(payload, "me");
  assert.ok(view);
  assert.equal(view.status, "ACTIVE");
  assert.deepEqual(view.matches.map(match => match.slot), [1, 2]);
  assert.equal(view.myPendingMatch?.roomKey, "trn-abc123");
  assert.equal(view.matches[1].involvesMe, false);
  assert.equal(view.matches[1].roomKey, null);
});

test("finished tournament exposes winner and no pending match", () => {
  const view = parseTournament({
    ...payload,
    status: "FINISHED",
    winner: { player_id: "a", display_name: "Ayşe" },
    matches: payload.matches.map(match => ({ ...match, status: "DONE", winner_id: "a", room_key: null })),
  }, "me");
  assert.ok(view);
  assert.equal(view.winner?.displayName, "Ayşe");
  assert.equal(view.myPendingMatch, null);
});

test("null and malformed payloads return null", () => {
  assert.equal(parseTournament(null, "me"), null);
  assert.equal(parseTournament({ status: "ACTIVE" }, "me"), null);
  assert.equal(parseTournament({ tournament_id: "x", status: "WEIRD" }, "me"), null);
});

test("drops malformed members and matches but keeps valid ones", () => {
  const view = parseTournament({
    tournament_id: "t2",
    status: "PENDING",
    creator_id: "me",
    members: [{ player_id: "", status: "ACCEPTED" }, { player_id: "ok", display_name: "", status: "INVITED" }],
    matches: [{ slot: 9, status: "PENDING" }],
  }, "me");
  assert.ok(view);
  assert.equal(view.members.length, 1);
  assert.equal(view.members[0].displayName, "?");
  assert.equal(view.matches.length, 0);
});
