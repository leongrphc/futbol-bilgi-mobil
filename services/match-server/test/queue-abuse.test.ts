import { describe, expect, it } from "vitest";
import {
  QUEUE_ABUSE_COOLDOWN_MS,
  QUEUE_CANCEL_THRESHOLD,
  QUEUE_CANCEL_WINDOW_MS,
  isQueueAbuseStateExpired,
  queueCooldownRemaining,
  recordQueueCancellation,
  type QueueAbuseState,
} from "../src/queue-abuse";

describe("queue cancel abuse policy", () => {
  it("keeps the first nine consecutive queue exits penalty-free", () => {
    let state: QueueAbuseState | undefined;
    for (let count = 1; count < QUEUE_CANCEL_THRESHOLD; count++) {
      const result = recordQueueCancellation(state, count * 1_000);
      state = result.state;
      expect(result).toMatchObject({ cancelCount: count, cooldownMs: 0, penalized: false });
    }
  });

  it("applies the cooldown on the tenth consecutive exit", () => {
    let state: QueueAbuseState | undefined;
    let result = recordQueueCancellation(state, 0);
    state = result.state;
    for (let count = 2; count <= QUEUE_CANCEL_THRESHOLD; count++) {
      result = recordQueueCancellation(state, count * 1_000);
      state = result.state;
    }
    expect(result).toMatchObject({ cancelCount: 10, remainingBeforePenalty: 0, cooldownMs: QUEUE_ABUSE_COOLDOWN_MS, penalized: true });
    expect(queueCooldownRemaining(state, 10_500)).toBe(QUEUE_ABUSE_COOLDOWN_MS - 500);
  });

  it("starts a fresh sequence after the abuse window", () => {
    const first = recordQueueCancellation(undefined, 1_000);
    const next = recordQueueCancellation(first.state, 1_000 + QUEUE_CANCEL_WINDOW_MS + 1);
    expect(next).toMatchObject({ cancelCount: 1, cooldownMs: 0, remainingBeforePenalty: 9 });
  });

  it("allows stale abuse state to be removed", () => {
    const first = recordQueueCancellation(undefined, 1_000);
    expect(isQueueAbuseStateExpired(first.state, 1_000 + QUEUE_CANCEL_WINDOW_MS + 1)).toBe(true);
  });
});
