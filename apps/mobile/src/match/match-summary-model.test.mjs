import assert from "node:assert/strict";
import test from "node:test";

import {
  MatchSummaryError,
  parseMatchSummary,
} from "./match-summary-model.ts";

function normalSummary(overrides = {}) {
  return {
    match_id: "match-1",
    room_key: "room-1",
    mode: "QUICK",
    finished_at: "2026-07-26T09:00:00.000Z",
    outcome: "WIN",
    score_for: 3,
    score_against: 1,
    trophy_delta: 20,
    opponent: {
      id: "player-2",
      display_name: "Deniz",
      player_code: "ABC123",
    },
    total_round_count: 1,
    truncated: false,
    rounds: [{
      round_id: "round-1",
      round_number: 1,
      sudden_death: false,
      clubs: [
        { id: "club-1", name: "Arsenal" },
        { id: "club-2", name: "Real Madrid" },
      ],
      outcome: "ME",
      me: { answered: true, correct: true, last_second: true },
      opponent: { answered: true, correct: false, last_second: true },
      report_status: "OPEN",
    }],
    ...overrides,
  };
}

test("parses a complete match summary and preserves safe round facts", () => {
  const summary = parseMatchSummary(normalSummary());

  assert.equal(summary.matchId, "match-1");
  assert.equal(summary.roomKey, "room-1");
  assert.equal(summary.outcome, "WIN");
  assert.equal(summary.opponent.name, "Deniz");
  assert.equal(summary.rounds[0]?.clubs[1].name, "Real Madrid");
  assert.deepEqual(summary.rounds[0]?.me, {
    answered: true,
    correct: true,
    lastSecond: true,
  });
  assert.deepEqual(summary.rounds[0]?.opponent, {
    answered: true,
    correct: false,
    lastSecond: false,
  });
  assert.equal(summary.rounds[0]?.reportStatus, "OPEN");
  assert.equal(summary.truncated, false);
});

test("supports incomplete legacy metadata without inventing sensitive data", () => {
  const summary = parseMatchSummary({
    match_id: "legacy-match",
    mode: "FRIEND",
    finished_at: "2025-11-03T18:15:00.000Z",
    outcome: "LOSS",
    score_for: 1,
    score_against: 3,
    opponent: { player_id: "legacy-opponent", display_name: "Ada" },
    rounds: [{
      id: "legacy-round",
      ordinal: 1,
      clubs: [
        { id: "club-a", name: "Ajax" },
        { id: "club-b", name: "Milan" },
      ],
    }],
  });

  assert.equal(summary.roomKey, null);
  assert.equal(summary.mode, "FRIEND");
  assert.equal(summary.finishedAt, "2025-11-03T18:15:00.000Z");
  assert.equal(summary.trophyDelta, null);
  assert.deepEqual(summary.opponent, {
    id: "legacy-opponent",
    name: "Ada",
    code: "",
  });
  assert.deepEqual(summary.rounds[0]?.me, {
    answered: false,
    correct: false,
    lastSecond: false,
  });
  assert.equal(summary.rounds[0]?.outcome, "NONE");
  assert.equal(summary.rounds[0]?.reportStatus, null);
});

test("fails closed when a required root result fact is missing or malformed", () => {
  const invalidRoots = [
    normalSummary({ score_for: undefined }),
    normalSummary({ score_for: "3" }),
    normalSummary({ score_for: -1 }),
    normalSummary({ score_against: Number.POSITIVE_INFINITY }),
    normalSummary({ finished_at: null }),
    normalSummary({ finished_at: "not-a-date" }),
    normalSummary({ finished_at: "2026-07-26" }),
    normalSummary({ mode: "" }),
    normalSummary({ mode: "UNKNOWN_MODE" }),
    normalSummary({ opponent: null }),
    normalSummary({ opponent: { id: "", display_name: "Deniz" } }),
    normalSummary({ opponent: { id: "player-2", display_name: " " } }),
  ];

  for (const value of invalidRoots) {
    assert.throws(
      () => parseMatchSummary(value),
      error => error instanceof MatchSummaryError && error.code === "UNAVAILABLE",
    );
  }
});

test("rejects malformed roots and filters malformed or duplicate rounds", () => {
  for (const value of [null, [], "match", {}, { match_id: "x", outcome: "DRAW" }]) {
    assert.throws(
      () => parseMatchSummary(value),
      error => error instanceof MatchSummaryError && error.code === "UNAVAILABLE",
    );
  }

  const validRound = normalSummary().rounds[0];
  const summary = parseMatchSummary(normalSummary({
    total_round_count: 4,
    rounds: [
      null,
      { round_id: "no-clubs", round_number: 1 },
      validRound,
      { ...validRound, round_number: 2 },
      {
        round_id: "round-3",
        round_number: 3.8,
        clubs: [
          { id: "club-3", name: " Benfica " },
          { id: "club-4", name: " Porto " },
        ],
        outcome: "INVALID",
        me: { answered: false, correct: true, last_second: true },
      },
    ],
  }));

  assert.deepEqual(summary.rounds.map(round => round.id), ["round-1", "round-3"]);
  assert.equal(summary.rounds[1]?.ordinal, 3);
  assert.equal(summary.rounds[1]?.outcome, "NONE");
  assert.deepEqual(summary.rounds[1]?.me, {
    answered: false,
    correct: false,
    lastSecond: false,
  });
  assert.equal(summary.totalRoundCount, 4);
  assert.equal(summary.truncated, true);
});

test("marks summaries as truncated when the RPC returns only a round window", () => {
  const summary = parseMatchSummary(normalSummary({
    total_round_count: 9,
    truncated: false,
  }));

  assert.equal(summary.rounds.length, 1);
  assert.equal(summary.totalRoundCount, 9);
  assert.equal(summary.truncated, true);
});
