import { describe, expect, it } from "vitest";
import {
  QUEUE_BOOKKEEPING_MAX_PER_PLAYER,
  QUEUE_BOOKKEEPING_MAX_TOTAL,
  QUEUE_CANCEL_FENCE_TTL_MS,
  QUEUE_MATCH_RECEIPT_TTL_MS,
  addQueueCancelFence,
  addQueueMatchReceipt,
  findQueueMatchReceipt,
  hasActiveQueueCancelFence,
  normalizeQueueRequestId,
  pruneQueueCancelFences,
  pruneQueueMatchReceipts,
  queueRequestIdsMatch,
  removeFencedQueueEntries,
  removeQueueEntriesForCancellation,
  shouldDeliverQueueAssignment,
} from "../src/queue-fence";

describe("queue request cancellation fences", () => {
  it("blocks only the cancelled run when cancel reaches the queue before join", () => {
    const now = 10_000;
    const fences = addQueueCancelFence({}, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-a",
      now,
    });

    expect(hasActiveQueueCancelFence(fences, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-a",
      now: now + QUEUE_CANCEL_FENCE_TTL_MS - 1,
    })).toBe(true);
    expect(hasActiveQueueCancelFence(fences, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-b",
      now: now + 1,
    })).toBe(false);
    expect(hasActiveQueueCancelFence(fences, {
      kind: "blitz",
      playerId: "player-1",
      requestId: "request-a",
      now: now + 1,
    })).toBe(false);
  });

  it("lets a request id be reused only after its short-lived fence expires", () => {
    const now = 20_000;
    const fences = addQueueCancelFence({}, {
      kind: "ranked",
      playerId: "player-1",
      requestId: "request-a",
      now,
    });

    expect(hasActiveQueueCancelFence(fences, {
      kind: "ranked",
      playerId: "player-1",
      requestId: "request-a",
      now: now + QUEUE_CANCEL_FENCE_TTL_MS,
    })).toBe(false);
  });

  it("removes fenced runs from the opponent candidate pool", () => {
    const now = 30_000;
    const fences = addQueueCancelFence({}, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-a",
      now,
    });
    const queue = [
      { playerId: "player-1", requestId: "request-a" },
      { playerId: "player-1", requestId: "request-b" },
      { playerId: "player-2", requestId: "request-c" },
    ];

    expect(removeFencedQueueEntries(queue, fences, "quick", now + 1)).toEqual([
      queue[1],
      queue[2],
    ]);
  });

  it("recovers a committed match when its direct MATCHED response is lost", () => {
    const now = 40_000;
    const receipts = addQueueMatchReceipt({}, {
      kind: "quick",
      matchId: "quick-committed",
      playerId: "player-1",
      requestId: "request-a",
      now,
    });

    expect(findQueueMatchReceipt(receipts, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-a",
      now: now + QUEUE_MATCH_RECEIPT_TTL_MS - 1,
    })).toBe("quick-committed");
    expect(findQueueMatchReceipt(receipts, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-b",
      now: now + 1,
    })).toBeUndefined();
    expect(findQueueMatchReceipt(receipts, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-a",
      now: now + QUEUE_MATCH_RECEIPT_TTL_MS,
    })).toBeUndefined();
  });

  it("removes and penalizes only the queue entry owned by the cancelled run", () => {
    const queue = [
      { playerId: "player-1", requestId: "request-new", marker: "new" },
      { playerId: "player-2", requestId: "request-other", marker: "other" },
    ];
    const staleCancel = removeQueueEntriesForCancellation(queue, "player-1", "request-old");
    expect(staleCancel.wasQueued).toBe(false);
    expect(staleCancel.remaining).toEqual(queue);

    const activeCancel = removeQueueEntriesForCancellation(queue, "player-1", "request-new");
    expect(activeCancel.wasQueued).toBe(true);
    expect(activeCancel.remaining).toEqual([queue[1]]);
  });

  it("keeps legacy clients compatible while fencing new request ids precisely", () => {
    expect(queueRequestIdsMatch(undefined, "request-new")).toBe(true);
    expect(queueRequestIdsMatch("request-old", undefined)).toBe(true);
    expect(queueRequestIdsMatch("request-a", "request-a")).toBe(true);
    expect(queueRequestIdsMatch("request-a", "request-b")).toBe(false);
  });

  it("delivers a committed assignment to a new join but not to a stale cancel", () => {
    expect(shouldDeliverQueueAssignment("join", "request-old", "request-new")).toBe(true);
    expect(shouldDeliverQueueAssignment(undefined, "request-old", "request-new")).toBe(true);
    expect(shouldDeliverQueueAssignment("cancel", "request-old", "request-new")).toBe(false);
    expect(shouldDeliverQueueAssignment("cancel", "request-old", "request-old")).toBe(true);
    expect(shouldDeliverQueueAssignment("cleanup", "request-old", "request-new")).toBe(true);
    expect(shouldDeliverQueueAssignment("cleanup", "request-old", "request-old")).toBe(true);
  });

  it("accepts bounded opaque request ids and rejects malformed values", () => {
    expect(normalizeQueueRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(normalizeQueueRequestId("short")).toBeUndefined();
    expect(normalizeQueueRequestId("request id with spaces")).toBeUndefined();
    expect(normalizeQueueRequestId("x".repeat(101))).toBeUndefined();
  });

  it("bounds cancel fences per player and globally while retaining the newest runs", () => {
    const now = 50_000;
    let perPlayer = {};
    for (let index = 0; index < QUEUE_BOOKKEEPING_MAX_PER_PLAYER + 2; index += 1) {
      perPlayer = addQueueCancelFence(perPlayer, {
        kind: "quick",
        playerId: "player-1",
        requestId: `request-${index}`,
        now: now + index,
      });
    }
    expect(Object.keys(perPlayer)).toHaveLength(QUEUE_BOOKKEEPING_MAX_PER_PLAYER);
    expect(hasActiveQueueCancelFence(perPlayer, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-0",
      now: now + 20,
    })).toBe(false);
    expect(hasActiveQueueCancelFence(perPlayer, {
      kind: "quick",
      playerId: "player-1",
      requestId: `request-${QUEUE_BOOKKEEPING_MAX_PER_PLAYER + 1}`,
      now: now + 20,
    })).toBe(true);

    const oversized = Object.fromEntries(
      Array.from({ length: QUEUE_BOOKKEEPING_MAX_TOTAL + 20 }, (_, index) => [
        `quick:player-${index}:request-${index}`,
        now + 1_000 + index,
      ]),
    );
    const bounded = pruneQueueCancelFences(oversized, now);
    expect(Object.keys(bounded)).toHaveLength(QUEUE_BOOKKEEPING_MAX_TOTAL);
    expect(bounded["quick:player-0:request-0"]).toBeUndefined();
    expect(bounded[`quick:player-${QUEUE_BOOKKEEPING_MAX_TOTAL + 19}:request-${QUEUE_BOOKKEEPING_MAX_TOTAL + 19}`]).toBeDefined();
  });

  it("bounds match receipts per player and globally while retaining committed matches", () => {
    const now = 60_000;
    let perPlayer = {};
    for (let index = 0; index < QUEUE_BOOKKEEPING_MAX_PER_PLAYER + 2; index += 1) {
      perPlayer = addQueueMatchReceipt(perPlayer, {
        kind: "quick",
        matchId: `quick-match-${index}`,
        playerId: "player-1",
        requestId: `request-${index}`,
        now: now + index,
      });
    }
    expect(Object.keys(perPlayer)).toHaveLength(QUEUE_BOOKKEEPING_MAX_PER_PLAYER);
    expect(findQueueMatchReceipt(perPlayer, {
      kind: "quick",
      playerId: "player-1",
      requestId: "request-0",
      now: now + 20,
    })).toBeUndefined();
    expect(findQueueMatchReceipt(perPlayer, {
      kind: "quick",
      playerId: "player-1",
      requestId: `request-${QUEUE_BOOKKEEPING_MAX_PER_PLAYER + 1}`,
      now: now + 20,
    })).toBe(`quick-match-${QUEUE_BOOKKEEPING_MAX_PER_PLAYER + 1}`);

    const oversized = Object.fromEntries(
      Array.from({ length: QUEUE_BOOKKEEPING_MAX_TOTAL + 20 }, (_, index) => [
        `quick:player-${index}:request-${index}`,
        { matchId: `quick-match-${index}`, expiresAt: now + 1_000 + index },
      ]),
    );
    const bounded = pruneQueueMatchReceipts(oversized, now);
    expect(Object.keys(bounded)).toHaveLength(QUEUE_BOOKKEEPING_MAX_TOTAL);
    expect(bounded["quick:player-0:request-0"]).toBeUndefined();
    expect(bounded[`quick:player-${QUEUE_BOOKKEEPING_MAX_TOTAL + 19}:request-${QUEUE_BOOKKEEPING_MAX_TOTAL + 19}`]?.matchId)
      .toBe(`quick-match-${QUEUE_BOOKKEEPING_MAX_TOTAL + 19}`);
  });

  it("prunes expired and malformed bookkeeping values", () => {
    const now = 70_000;
    expect(pruneQueueCancelFences({
      "quick:player-1:request-active": now + 1,
      "quick:player-1:request-expired": now,
      "malformed-key": now + 1,
    }, now)).toEqual({
      "quick:player-1:request-active": now + 1,
    });

    expect(pruneQueueMatchReceipts({
      "quick:player-1:request-active": { matchId: "quick-active", expiresAt: now + 1 },
      "quick:player-1:request-expired": { matchId: "quick-expired", expiresAt: now },
      "quick:player-1:request-empty": { matchId: "", expiresAt: now + 1 },
    }, now)).toEqual({
      "quick:player-1:request-active": { matchId: "quick-active", expiresAt: now + 1 },
    });
  });
});
