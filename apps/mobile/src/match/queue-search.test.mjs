import assert from "node:assert/strict";
import test from "node:test";

import { QueueRequestError, requestQueueAction, startQueueSearch } from "./queue-search.ts";

function deferred() {
  let resolve;
  const promise = new Promise(next => {
    resolve = next;
  });
  return { promise, resolve };
}

test("waits for an in-flight join before sending cancel and does not poll again", async () => {
  const joinResult = deferred();
  const calls = [];
  let joinCount = 0;
  let cancelCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      calls.push("join");
      const result = await joinResult.promise;
      calls.push("join-settled");
      return result;
    },
    cancel: async () => {
      cancelCount += 1;
      calls.push("cancel");
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
  });

  search.cancel();
  assert.equal(cancelCount, 0);
  joinResult.resolve({ status: "WAITING", band: 50 });

  assert.deepEqual(await search.done, { type: "CANCELLED", cooldownMs: 0 });
  assert.deepEqual(calls, ["join", "join-settled", "cancel"]);
  assert.equal(joinCount, 1);
});

test("wakes a scheduled poll immediately when the user cancels", async () => {
  const waiting = deferred();
  let joinCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      return { status: "WAITING", band: 50 };
    },
    cancel: async () => ({ status: "CANCELLED" }),
    onWaiting: () => waiting.resolve(),
    pollIntervalMs: 60_000,
  });

  await waiting.promise;
  search.cancel();

  assert.deepEqual(await search.done, { type: "CANCELLED", cooldownMs: 0 });
  assert.equal(joinCount, 1);
});

test("treats a match committed by the late join as authoritative after cancel", async () => {
  const joinResult = deferred();
  let cancelCount = 0;
  const search = startQueueSearch({
    join: () => joinResult.promise,
    cancel: async () => {
      cancelCount += 1;
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
  });

  search.cancel();
  joinResult.resolve({ status: "MATCHED", match_id: "quick-committed" });

  assert.deepEqual(await search.done, {
    type: "MATCHED",
    matchId: "quick-committed",
    committedAfterCancel: true,
  });
  assert.equal(cancelCount, 1);
});

test("treats MATCHED returned by the cancel request as authoritative", async () => {
  const joinResult = deferred();
  const search = startQueueSearch({
    join: () => joinResult.promise,
    cancel: async () => ({ status: "MATCHED", match_id: "quick-assigned" }),
    pollIntervalMs: 0,
  });

  search.cancel();
  joinResult.resolve({ status: "WAITING", band: 50 });

  assert.deepEqual(await search.done, {
    type: "MATCHED",
    matchId: "quick-assigned",
    committedAfterCancel: true,
  });
});

test("stops polling when the server fences a late join as cancelled", async () => {
  let joinCount = 0;
  let cancelCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      return { status: "CANCELLED", cooldown_ms: 0 };
    },
    cancel: async () => {
      cancelCount += 1;
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
  });

  assert.deepEqual(await search.done, { type: "CANCELLED", cooldownMs: 0 });
  assert.equal(joinCount, 1);
  assert.equal(cancelCount, 0);
});

test("cleans a previously waiting event run before returning NO_EVENT", async () => {
  const calls = [];
  let joinCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      const status = joinCount === 1 ? "WAITING" : "NO_EVENT";
      calls.push(`join:${status}`);
      return { status };
    },
    cancel: async () => {
      calls.push("cancel");
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
  });

  assert.deepEqual(await search.done, { type: "NO_EVENT" });
  assert.deepEqual(calls, ["join:WAITING", "join:NO_EVENT", "cancel"]);
});

test("cleans a previously waiting run before preserving a COOLDOWN outcome", async () => {
  let joinCount = 0;
  let cancelCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      return joinCount === 1
        ? { status: "WAITING" }
        : { status: "COOLDOWN", cooldown_ms: 1_500 };
    },
    cancel: async () => {
      cancelCount += 1;
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
  });

  assert.deepEqual(await search.done, { type: "COOLDOWN", cooldownMs: 1_500 });
  assert.equal(cancelCount, 1);
});

test("keeps MATCHED from terminal cleanup authoritative", async () => {
  let joinCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      return joinCount === 1
        ? { status: "WAITING" }
        : { status: "RANKED_LOCKED", required_quick_matches: 5 };
    },
    cancel: async () => ({ status: "MATCHED", match_id: "ranked-committed" }),
    pollIntervalMs: 0,
  });

  assert.deepEqual(await search.done, {
    type: "MATCHED",
    matchId: "ranked-committed",
    committedAfterCancel: true,
  });
});

test("does not send cleanup for a terminal preflight before a run was waiting", async () => {
  let cancelCount = 0;
  const search = startQueueSearch({
    join: async () => ({ status: "RANKED_LOCKED", required_quick_matches: 5 }),
    cancel: async () => {
      cancelCount += 1;
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
  });

  assert.deepEqual(await search.done, {
    type: "RANKED_LOCKED",
    requiredQuickMatches: 5,
  });
  assert.equal(cancelCount, 0);
});

test("stops immediately on an auth failure", async () => {
  let joinCount = 0;
  let cancelCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      throw new QueueRequestError("AUTH", false);
    },
    cancel: async () => {
      cancelCount += 1;
      throw new QueueRequestError("AUTH", false);
    },
    pollIntervalMs: 0,
  });

  assert.deepEqual(await search.done, { type: "FAILED", reason: "AUTH" });
  assert.equal(joinCount, 1);
  assert.equal(cancelCount, 1);
});

test("bounds transient retries and performs a final server cleanup", async () => {
  let joinCount = 0;
  let cancelCount = 0;
  const search = startQueueSearch({
    join: async () => {
      joinCount += 1;
      throw new QueueRequestError("NETWORK", true);
    },
    cancel: async () => {
      cancelCount += 1;
      return { status: "CANCELLED" };
    },
    pollIntervalMs: 0,
    maxConsecutiveFailures: 3,
  });

  assert.deepEqual(await search.done, { type: "FAILED", reason: "NETWORK" });
  assert.equal(joinCount, 3);
  assert.equal(cancelCount, 1);
});

test("sends the same request id with queue join and cancel actions", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ status: "CANCELLED" });
  };
  try {
    const base = {
      baseUrl: "https://match.example",
      path: "/quick-match",
      region: "TR",
      requestId: "request-same",
      token: "token",
    };
    await requestQueueAction({ ...base, action: "join" });
    await requestQueueAction({ ...base, action: "cancel" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(bodies, [
    { action: "join", region: "TR", request_id: "request-same" },
    { action: "cancel", request_id: "request-same" },
  ]);
});
