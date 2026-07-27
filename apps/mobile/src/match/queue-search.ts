export type QueueKind = "quick" | "blitz" | "ranked" | "event";

export type QueueServerResult = {
  status?: string;
  match_id?: string;
  cooldown_ms?: number;
  band?: number | string;
  required_quick_matches?: number;
};

export type QueueFailureReason = "AUTH" | "NETWORK" | "SERVER";

export type QueueSearchOutcome =
  | { type: "MATCHED"; matchId: string; committedAfterCancel: boolean }
  | { type: "CANCELLED"; cooldownMs: number }
  | { type: "NO_EVENT" }
  | { type: "RANKED_LOCKED"; requiredQuickMatches?: number }
  | { type: "COOLDOWN"; cooldownMs: number }
  | { type: "FAILED"; reason: QueueFailureReason };

export class QueueRequestError extends Error {
  readonly reason: QueueFailureReason;
  readonly retryable: boolean;

  constructor(reason: QueueFailureReason, retryable: boolean) {
    super(reason);
    this.reason = reason;
    this.retryable = retryable;
  }
}

type QueueSearchOptions = {
  join: () => Promise<QueueServerResult>;
  cancel: () => Promise<QueueServerResult>;
  onRetry?: () => void;
  onWaiting?: (result: QueueServerResult) => void;
  pollIntervalMs?: number;
  maxConsecutiveFailures?: number;
};

export type QueueSearchController = {
  cancel: () => void;
  done: Promise<QueueSearchOutcome>;
};

const defaultDelay = (milliseconds: number) => new Promise<void>(resolve => {
  setTimeout(resolve, milliseconds);
});

export function startQueueSearch({
  join,
  cancel,
  onRetry,
  onWaiting,
  pollIntervalMs = 2_000,
  maxConsecutiveFailures = 3,
}: QueueSearchOptions): QueueSearchController {
  let cancelled = false;
  let wasWaiting = false;
  let wakeDelay: (() => void) | undefined;

  const waitForNextPoll = () => new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      wakeDelay = undefined;
      resolve();
    };
    const timer = setTimeout(finish, pollIntervalMs);
    wakeDelay = () => {
      clearTimeout(timer);
      finish();
    };
  });

  const requestCancellation = async (lateMatchId?: string): Promise<QueueSearchOutcome> => {
    let lastFailure: QueueFailureReason = "NETWORK";
    for (let attempt = 0; attempt < maxConsecutiveFailures; attempt += 1) {
      try {
        const result = await cancel();
        const matchId = lateMatchId ?? (result.status === "MATCHED" ? result.match_id : undefined);
        if (matchId) return { type: "MATCHED", matchId, committedAfterCancel: true };
        if (result.status === "CANCELLED") {
          return { type: "CANCELLED", cooldownMs: Math.max(0, Number(result.cooldown_ms ?? 0)) };
        }
        if (result.status === "COOLDOWN") {
          return { type: "CANCELLED", cooldownMs: Math.max(0, Number(result.cooldown_ms ?? 0)) };
        }
        return lateMatchId
          ? { type: "MATCHED", matchId: lateMatchId, committedAfterCancel: true }
          : { type: "FAILED", reason: "SERVER" };
      } catch (error) {
        const requestError = asQueueRequestError(error);
        lastFailure = requestError.reason;
        if (!requestError.retryable || attempt === maxConsecutiveFailures - 1) break;
        await defaultDelay(Math.min(250 * (attempt + 1), 750));
      }
    }
    return lateMatchId
      ? { type: "MATCHED", matchId: lateMatchId, committedAfterCancel: true }
      : { type: "FAILED", reason: lastFailure };
  };

  const finishAfterTerminalCleanup = async (
    terminalOutcome: QueueSearchOutcome,
  ): Promise<QueueSearchOutcome> => {
    if (!wasWaiting) return terminalOutcome;
    const cleanup = await requestCancellation();
    return cleanup.type === "MATCHED" ? cleanup : terminalOutcome;
  };

  const done = (async (): Promise<QueueSearchOutcome> => {
    let consecutiveFailures = 0;
    while (!cancelled) {
      let result: QueueServerResult;
      try {
        result = await join();
        consecutiveFailures = 0;
      } catch (error) {
        const requestError = asQueueRequestError(error);
        if (cancelled) return requestCancellation();
        consecutiveFailures += 1;
        if (!requestError.retryable || consecutiveFailures >= maxConsecutiveFailures) {
          const cleanup = await requestCancellation();
          return cleanup.type === "MATCHED" ? cleanup : { type: "FAILED", reason: requestError.reason };
        }
        onRetry?.();
        await waitForNextPoll();
        continue;
      }

      if (cancelled) {
        return requestCancellation(result.status === "MATCHED" ? result.match_id : undefined);
      }

      if (result.status === "MATCHED" && result.match_id) {
        return { type: "MATCHED", matchId: result.match_id, committedAfterCancel: false };
      }
      if (result.status === "NO_EVENT") {
        return finishAfterTerminalCleanup({ type: "NO_EVENT" });
      }
      if (result.status === "RANKED_LOCKED") {
        return finishAfterTerminalCleanup({
          type: "RANKED_LOCKED",
          requiredQuickMatches: result.required_quick_matches,
        });
      }
      if (result.status === "COOLDOWN") {
        return finishAfterTerminalCleanup({
          type: "COOLDOWN",
          cooldownMs: Math.max(0, Number(result.cooldown_ms ?? 0)),
        });
      }
      if (result.status === "CANCELLED") {
        return { type: "CANCELLED", cooldownMs: Math.max(0, Number(result.cooldown_ms ?? 0)) };
      }
      if (result.status !== "WAITING") {
        const cleanup = await requestCancellation();
        return cleanup.type === "MATCHED" ? cleanup : { type: "FAILED", reason: "SERVER" };
      }

      wasWaiting = true;
      onWaiting?.(result);
      await waitForNextPoll();
    }

    return requestCancellation();
  })();

  return {
    cancel: () => {
      cancelled = true;
      wakeDelay?.();
    },
    done,
  };
}

export async function requestQueueAction({
  action,
  baseUrl,
  path,
  region,
  requestId,
  token,
  timeoutMs = 10_000,
}: {
  action: "join" | "cancel";
  baseUrl: string;
  path: string;
  region: string;
  requestId: string;
  token: string;
  timeoutMs?: number;
}): Promise<QueueServerResult> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(action === "join"
          ? { action, region, request_id: requestId }
          : { action, request_id: requestId }),
        signal: abortController.signal,
      });
    } catch {
      throw new QueueRequestError("NETWORK", true);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new QueueRequestError("AUTH", false);
      }
      if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
        throw new QueueRequestError("NETWORK", true);
      }
      throw new QueueRequestError("SERVER", false);
    }

    try {
      const result = await response.json() as unknown;
      if (!result || typeof result !== "object") throw new Error("invalid queue response");
      return result as QueueServerResult;
    } catch {
      throw new QueueRequestError("SERVER", false);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function asQueueRequestError(error: unknown): QueueRequestError {
  return error instanceof QueueRequestError
    ? error
    : new QueueRequestError("NETWORK", true);
}
