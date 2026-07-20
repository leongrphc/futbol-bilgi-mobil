export interface QueueAbuseState {
  cancelCount: number;
  windowStartedAt: number;
  lastCancelledAt: number;
  cooldownUntil: number;
}

export const QUEUE_CANCEL_THRESHOLD = 10;
export const QUEUE_CANCEL_WINDOW_MS = 10 * 60_000;
export const QUEUE_ABUSE_COOLDOWN_MS = 45_000;

export interface QueueCancelResult {
  state: QueueAbuseState;
  cancelCount: number;
  remainingBeforePenalty: number;
  cooldownMs: number;
  penalized: boolean;
}

export function queueCooldownRemaining(state: QueueAbuseState | undefined, now: number): number {
  return Math.max(0, (state?.cooldownUntil ?? 0) - now);
}

export function isQueueAbuseStateExpired(state: QueueAbuseState | undefined, now: number): boolean {
  if (!state) return false;
  return state.cooldownUntil <= now && now - state.lastCancelledAt > QUEUE_CANCEL_WINDOW_MS;
}

export function recordQueueCancellation(state: QueueAbuseState | undefined, now: number): QueueCancelResult {
  const activeCooldown = queueCooldownRemaining(state, now);
  if (state && activeCooldown > 0) {
    return {
      state,
      cancelCount: state.cancelCount,
      remainingBeforePenalty: Math.max(0, QUEUE_CANCEL_THRESHOLD - state.cancelCount),
      cooldownMs: activeCooldown,
      penalized: true,
    };
  }

  const insideWindow = !!state && now - state.windowStartedAt <= QUEUE_CANCEL_WINDOW_MS;
  const nextCount = insideWindow ? state.cancelCount + 1 : 1;
  const windowStartedAt = insideWindow ? state.windowStartedAt : now;

  if (nextCount >= QUEUE_CANCEL_THRESHOLD) {
    return {
      state: {
        cancelCount: 0,
        windowStartedAt: now,
        lastCancelledAt: now,
        cooldownUntil: now + QUEUE_ABUSE_COOLDOWN_MS,
      },
      cancelCount: nextCount,
      remainingBeforePenalty: 0,
      cooldownMs: QUEUE_ABUSE_COOLDOWN_MS,
      penalized: true,
    };
  }

  return {
    state: {
      cancelCount: nextCount,
      windowStartedAt,
      lastCancelledAt: now,
      cooldownUntil: 0,
    },
    cancelCount: nextCount,
    remainingBeforePenalty: QUEUE_CANCEL_THRESHOLD - nextCount,
    cooldownMs: 0,
    penalized: false,
  };
}
