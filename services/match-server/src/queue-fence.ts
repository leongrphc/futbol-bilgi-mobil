export const QUEUE_CANCEL_FENCE_TTL_MS = 120_000;
export const QUEUE_MATCH_RECEIPT_TTL_MS = 120_000;
export const QUEUE_BOOKKEEPING_MAX_PER_PLAYER = 8;
export const QUEUE_BOOKKEEPING_MAX_TOTAL = 512;

export type QueueCancelFences = Record<string, number>;
export type QueueMatchReceipts = Record<string, { matchId: string; expiresAt: number }>;

export function normalizeQueueRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(normalized) ? normalized : undefined;
}

export function queueRequestIdsMatch(storedRequestId: string | undefined, incomingRequestId: string | undefined): boolean {
  return !storedRequestId || !incomingRequestId || storedRequestId === incomingRequestId;
}

export function shouldDeliverQueueAssignment(
  action: "join" | "cancel" | "cleanup" | undefined,
  storedRequestId: string | undefined,
  incomingRequestId: string | undefined,
): boolean {
  // `cleanup` is an internal preflight for a new join. A committed match must
  // therefore win even if it belongs to the immediately preceding request.
  return action !== "cancel"
    || queueRequestIdsMatch(storedRequestId, incomingRequestId);
}

export function removeQueueEntriesForCancellation<T extends { playerId: string; requestId?: string }>(
  queue: readonly T[],
  playerId: string,
  requestId: string | undefined,
): { wasQueued: boolean; remaining: T[] } {
  const belongsToRequest = (entry: T) =>
    entry.playerId === playerId && queueRequestIdsMatch(entry.requestId, requestId);
  return {
    wasQueued: queue.some(belongsToRequest),
    remaining: queue.filter(entry => !belongsToRequest(entry)),
  };
}

export function pruneQueueCancelFences(fences: QueueCancelFences | undefined, now: number): QueueCancelFences {
  const active = Object.fromEntries(
    Object.entries(fences ?? {}).filter(([key, expiresAt]) =>
      queueRecordPlayerId(key) !== undefined
      && typeof expiresAt === "number"
      && Number.isFinite(expiresAt)
      && expiresAt > now,
    ),
  );
  return boundQueueBookkeeping(active, expiresAt => expiresAt);
}

export function addQueueCancelFence(
  fences: QueueCancelFences,
  {
    kind,
    playerId,
    requestId,
    now,
  }: {
    kind: string;
    playerId: string;
    requestId: string | undefined;
    now: number;
  },
): QueueCancelFences {
  if (!requestId) return fences;
  return pruneQueueCancelFences({
    ...fences,
    [queueCancelFenceKey(kind, playerId, requestId)]: now + QUEUE_CANCEL_FENCE_TTL_MS,
  }, now);
}

export function hasActiveQueueCancelFence(
  fences: QueueCancelFences,
  {
    kind,
    playerId,
    requestId,
    now,
  }: {
    kind: string;
    playerId: string;
    requestId: string | undefined;
    now: number;
  },
): boolean {
  if (!requestId) return false;
  return (fences[queueCancelFenceKey(kind, playerId, requestId)] ?? 0) > now;
}

export function removeFencedQueueEntries<T extends { playerId: string; requestId?: string }>(
  queue: readonly T[],
  fences: QueueCancelFences,
  kind: string,
  now: number,
): T[] {
  return queue.filter(entry => !hasActiveQueueCancelFence(fences, {
    kind,
    playerId: entry.playerId,
    requestId: entry.requestId,
    now,
  }));
}

export function pruneQueueMatchReceipts(receipts: QueueMatchReceipts | undefined, now: number): QueueMatchReceipts {
  const active = Object.fromEntries(
    Object.entries(receipts ?? {}).filter(([key, receipt]) =>
      queueRecordPlayerId(key) !== undefined
      && receipt !== null
      && typeof receipt === "object"
      && typeof receipt.matchId === "string"
      && receipt.matchId.length > 0
      && Number.isFinite(receipt.expiresAt)
      && receipt.expiresAt > now,
    ),
  );
  return boundQueueBookkeeping(active, receipt => receipt.expiresAt);
}

export function addQueueMatchReceipt(
  receipts: QueueMatchReceipts,
  {
    kind,
    matchId,
    playerId,
    requestId,
    now,
  }: {
    kind: string;
    matchId: string;
    playerId: string;
    requestId: string | undefined;
    now: number;
  },
): QueueMatchReceipts {
  if (!requestId) return receipts;
  return pruneQueueMatchReceipts({
    ...receipts,
    [queueRequestKey(kind, playerId, requestId)]: {
      matchId,
      expiresAt: now + QUEUE_MATCH_RECEIPT_TTL_MS,
    },
  }, now);
}

export function findQueueMatchReceipt(
  receipts: QueueMatchReceipts,
  {
    kind,
    playerId,
    requestId,
    now,
  }: {
    kind: string;
    playerId: string;
    requestId: string | undefined;
    now: number;
  },
): string | undefined {
  if (!requestId) return undefined;
  const receipt = receipts[queueRequestKey(kind, playerId, requestId)];
  return receipt && receipt.expiresAt > now ? receipt.matchId : undefined;
}

function queueCancelFenceKey(kind: string, playerId: string, requestId: string): string {
  return queueRequestKey(kind, playerId, requestId);
}

function queueRequestKey(kind: string, playerId: string, requestId: string): string {
  return `${kind}:${playerId}:${requestId}`;
}

function queueRecordPlayerId(key: string): string | undefined {
  const firstSeparator = key.indexOf(":");
  const lastSeparator = key.lastIndexOf(":");
  if (firstSeparator < 1 || lastSeparator <= firstSeparator + 1 || lastSeparator === key.length - 1) {
    return undefined;
  }
  return key.slice(firstSeparator + 1, lastSeparator);
}

function boundQueueBookkeeping<T>(
  records: Record<string, T>,
  expiresAtFor: (value: T) => number,
): Record<string, T> {
  const candidates = Object.entries(records).map(([key, value], index) => ({
    expiresAt: expiresAtFor(value),
    index,
    key,
    playerId: queueRecordPlayerId(key)!,
    value,
  }));
  candidates.sort((left, right) =>
    right.expiresAt - left.expiresAt || right.index - left.index,
  );

  const kept: typeof candidates = [];
  const perPlayerCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const playerCount = perPlayerCounts.get(candidate.playerId) ?? 0;
    if (playerCount >= QUEUE_BOOKKEEPING_MAX_PER_PLAYER) continue;
    kept.push(candidate);
    perPlayerCounts.set(candidate.playerId, playerCount + 1);
    if (kept.length >= QUEUE_BOOKKEEPING_MAX_TOTAL) break;
  }

  kept.sort((left, right) => left.index - right.index);
  return Object.fromEntries(kept.map(({ key, value }) => [key, value]));
}
