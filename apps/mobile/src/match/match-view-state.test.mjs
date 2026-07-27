import assert from "node:assert/strict";
import test from "node:test";

import {
  appendRecentMatchEvent,
  createInitialMatchViewState,
  matchViewReducer,
  parseExpectedMatchServerMessage,
  reduceMatchViewEvents,
} from "./match-view-state.ts";

const copy = {
  badgeFallbackAccent: "#FFB454",
  errorForCode: code => `error:${String(code)}`,
  selectionErrorForReason: reason => `selection:${String(reason)}`,
};

function event(eventType, payload = {}, eventId = `${eventType}-${Math.random()}`) {
  return {
    protocol_version: 1,
    match_id: "long-match",
    event_id: eventId,
    server_timestamp: "2026-07-26T00:00:00.000Z",
    event_type: eventType,
    payload,
  };
}

test("keeps match metadata after the recent event window drops its source events", () => {
  const sourceEvents = [
    event("READY_CHECK_STARTED", {
      deadline: 1000,
      match_mode: "RANKED",
      rules: { winning_score: 5 },
      player_cards: [{
        player_id: "player-1",
        display_name: "Ada",
        player_code: "#ADA001",
        trophies: 42,
        form: ["W"],
        achievements: [{ code: "streak", glyph: "★" }],
      }],
    }, "ready"),
    event("SUDDEN_DEATH_STARTED", {
      clubs: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    }, "sudden-death"),
    ...Array.from({ length: 60 }, (_, index) => event(
      "SCORE_UPDATED",
      { scores: { "player-1": index, "player-2": 0 } },
      `score-${index}`,
    )),
  ];

  const state = reduceMatchViewEvents(createInitialMatchViewState(), sourceEvents, copy);
  const recentEvents = sourceEvents.reduce(
    (recent, nextEvent) => appendRecentMatchEvent(recent, nextEvent),
    [],
  );

  assert.equal(recentEvents.length, 50);
  assert.equal(recentEvents.some(nextEvent => nextEvent.event_id === "ready"), false);
  assert.equal(recentEvents.some(nextEvent => nextEvent.event_id === "sudden-death"), false);
  assert.equal(state.playerCards[0]?.display_name, "Ada");
  assert.equal(state.playerCards[0]?.achievements[0]?.accent, copy.badgeFallbackAccent);
  assert.equal(state.matchMode, "RANKED");
  assert.equal(state.winningScore, 5);
  assert.equal(state.suddenDeath, true);
});

test("processes duplicate and batched events without dropping an update", () => {
  const duplicate = event("TEAM_SELECTION_STARTED", { deadline: 2000 }, "duplicate");
  const state = matchViewReducer(createInitialMatchViewState(), {
    type: "events",
    events: [duplicate, duplicate],
    copy,
  });

  assert.equal(state.selectionCycle, 2);
});

test("cold reconnect snapshots hydrate metadata and reveal or result state", () => {
  const coldReveal = matchViewReducer(createInitialMatchViewState(), {
    type: "events",
    events: [event("PLAYER_RECONNECTED", {
      phase: "REVEAL",
      scores: { "player-1": 1, "player-2": 1 },
      normalRound: 4,
      deadline: 3000,
      suddenDeath: true,
      player_cards: [{ player_id: "player-1", display_name: "Ada" }],
      match_mode: "BLITZ",
      rules: { winning_score: 2, maximum_rounds: 5 },
      reveal: {
        round_winner_id: "player-1",
        submissions: [{ player_id: "player-1", answer: "Ada", correct: true }],
        win_reason: "ONLY_CORRECT",
      },
    })],
    copy,
  });

  assert.equal(coldReveal.playerCards[0]?.display_name, "Ada");
  assert.equal(coldReveal.matchMode, "BLITZ");
  assert.equal(coldReveal.winningScore, 2);
  assert.equal(coldReveal.suddenDeath, true);
  assert.equal(coldReveal.phase, "REVEAL");
  assert.equal(coldReveal.reveal?.round_winner_id, "player-1");

  const coldSuddenDeathReveal = matchViewReducer(createInitialMatchViewState(), {
    type: "events",
    events: [event("PLAYER_RECONNECTED", {
      phase: "SUDDEN_DEATH",
      suddenDeath: true,
      deadline: 3500,
      reveal: {
        round_winner_id: null,
        submissions: [],
        win_reason: "NO_CORRECT",
      },
    })],
    copy,
  });

  assert.equal(coldSuddenDeathReveal.phase, "REVEAL");
  assert.equal(coldSuddenDeathReveal.suddenDeath, true);
  assert.equal(coldSuddenDeathReveal.reveal?.win_reason, "NO_CORRECT");

  const coldFinished = matchViewReducer(createInitialMatchViewState(), {
    type: "events",
    events: [event("PLAYER_RECONNECTED", {
      phase: "FINISHED",
      scores: { "player-1": 2, "player-2": 1 },
      winnerId: "player-1",
      result: { winner_id: "player-1", sudden_death: false },
    })],
    copy,
  });

  assert.equal(coldFinished.phase, "FINISHED");
  assert.deepEqual(coldFinished.result, { winner_id: "player-1", sudden_death: false });
});

test("relocalizes retained error details without replaying event history", () => {
  const localized = reduceMatchViewEvents(createInitialMatchViewState(), [
    event("ERROR", { code: "INVALID_PHASE" }),
    event("TEAM_SELECTION_INVALID", { reason: "SAME_CLUB" }),
  ], copy);
  const nextCopy = {
    ...copy,
    errorForCode: code => `translated-error:${String(code)}`,
    selectionErrorForReason: reason => `translated-selection:${String(reason)}`,
  };
  const relocalized = matchViewReducer(localized, { type: "relocalize", copy: nextCopy });

  assert.equal(relocalized.error, "translated-error:INVALID_PHASE");
  assert.equal(relocalized.selectionNotice, "translated-selection:SAME_CLUB");
});

test("dismisses only the quick message whose visibility window elapsed", () => {
  const withMessage = reduceMatchViewEvents(createInitialMatchViewState(), [
    event("QUICK_MESSAGE", {
      player_id: "player-1",
      kind: "TEXT",
      message_id: "NICE_ONE",
    }, "quick-1"),
  ], copy);
  const afterStaleTimer = matchViewReducer(withMessage, {
    type: "dismissQuickMessage",
    eventId: "older-message",
  });
  const afterCurrentTimer = matchViewReducer(afterStaleTimer, {
    type: "dismissQuickMessage",
    eventId: "quick-1",
  });

  assert.equal(afterStaleTimer.quickMessage?.eventId, "quick-1");
  assert.equal(afterCurrentTimer.quickMessage, undefined);
});

test("rejects malformed or cross-match socket messages", () => {
  const valid = event("SCORE_UPDATED", { scores: {} }, "expected");

  assert.equal(parseExpectedMatchServerMessage(JSON.stringify(valid), "long-match")?.event_id, "expected");
  assert.equal(parseExpectedMatchServerMessage(JSON.stringify(valid), "another-match"), undefined);
  assert.equal(parseExpectedMatchServerMessage("{bad-json", "long-match"), undefined);
});
