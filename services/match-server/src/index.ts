import { DurableObject } from "cloudflare:workers";
import { normalizeAnswer } from "@football-link/answer-normalizer";
import { MatchEngine, pairKey, type SerializedEngineState } from "@football-link/game-engine";
import { ALL_EMOTE_IDS, FREE_EMOTE_IDS, PROTOCOL_VERSION, type ClientMessage, type EmoteId, type MatchPhase, type QuickMessageId, type ServerEventType, type ServerMessage } from "@football-link/shared";
import { applyMatchModeRules, createMatchData, loadLiveEventScope, type EventScope, type MatchData } from "./data";
import { createMatchTicket, verifyMatchTicket, verifySupabaseAccessToken, type MatchTicketMode } from "./auth";
import { resolveAnswerPayload, type AnswerChoice } from "./choices";
import { isQueueAbuseStateExpired, queueCooldownRemaining, recordQueueCancellation, type QueueAbuseState } from "./queue-abuse";
import { addQueueCancelFence, addQueueMatchReceipt, findQueueMatchReceipt, hasActiveQueueCancelFence, normalizeQueueRequestId, pruneQueueCancelFences, pruneQueueMatchReceipts, queueRequestIdsMatch, removeFencedQueueEntries, removeQueueEntriesForCancellation, shouldDeliverQueueAssignment, type QueueCancelFences, type QueueMatchReceipts } from "./queue-fence";
import { rematchModeFromMatchId } from "./rematch-mode";
import { checkPushReceipts, handleNotificationDispatch, runSystemNotificationSweeps, type NotificationEnv } from "./notifications";

interface Env extends NotificationEnv { MATCH_ROOM: DurableObjectNamespace<MatchRoom>; MATCH_QUEUE: DurableObjectNamespace<MatchQueue>; MATCH_TOKEN_SECRET: string }
type Pause = { phase: MatchPhase; remainingMs: number; disconnectedPlayer: string; deadline: number };
type CompetitiveMatchMode = "QUICK" | "BLITZ" | "RANKED";
type RoomMatchMode = CompetitiveMatchMode | "FRIEND" | "EVENT" | "BOT";
type StoredRoom = { matchId: string; engine: SerializedEngineState; pause: Pause | null; dataVersionId: string; persistedRounds?: number; rematch?: { requester: string; matchId: string } | null; leagueFilter?: string | null; event?: EventScope | null; matchMode?: RoomMatchMode; answerChoices?: AnswerChoice[]; playerCards?: Record<string, unknown>[] };
const BOT_PLAYER_ID = "test-bot";
const quickMessageIds = new Set<QuickMessageId>(["GOOD_LUCK", "NICE_ONE", "SO_CLOSE", "READY", "REMATCH"]);
const freeEmoteIds = new Set<string>(FREE_EMOTE_IDS);
const allEmoteIds = new Set<string>(ALL_EMOTE_IDS);
const chatStyleIds = new Set(["chat-classic", "chat-floodlight", "chat-derby", "chat-neon", "chat-aurora", "chat-champion"]);
const EMOTE_COOLDOWN_MS = 1_500;

type RegionClass = "TR" | "EU" | "OTHER";
type QueueKind = "quick" | "blitz" | "ranked" | "event";
type QueueEntry = { playerId: string; enqueuedAt: number; trophies: number; region: RegionClass; requestId?: string };
type QueueAssignment = string | { matchId: string; requestId?: string };
const QUEUE_TTL_MS = 120_000;
const QUEUE_CANCEL_FENCES_KEY = "queue_cancel_fences_v1";
const QUEUE_MATCH_RECEIPTS_KEY = "queue_match_receipts_v1";
const cupBand = (waitMs: number) => waitMs < 15_000 ? 50 : waitMs < 45_000 ? 100 : Number.POSITIVE_INFINITY;
const withinBand = (a: number, b: number, band: number) => Math.abs(a - b) <= band;
const normalizeRegion = (value: unknown): RegionClass => value === "TR" || value === "EU" ? value : "OTHER";
const normalizeQueueKind = (value: unknown): QueueKind => value === "blitz" ? "blitz" : value === "ranked" ? "ranked" : value === "event" ? "event" : "quick";
const ticketModeForRoom = (mode: RoomMatchMode): MatchTicketMode | undefined =>
  mode === "QUICK" ? "quick" : mode === "BLITZ" ? "blitz" : mode === "RANKED" ? "ranked" : mode === "EVENT" ? "event" : undefined;
const queueStorageKeys = (kind: QueueKind) => {
  if (kind === "blitz") return { queueKey: "queue_blitz", assignKey: "assignments_blitz" };
  if (kind === "ranked") return { queueKey: "queue_ranked", assignKey: "assignments_ranked" };
  if (kind === "event") return { queueKey: "queue_event", assignKey: "assignments_event" };
  return { queueKey: "queue", assignKey: "assignments" };
};
const queueAssignmentMatchId = (assignment: QueueAssignment): string =>
  typeof assignment === "string" ? assignment : assignment.matchId;
const queueAssignmentRequestId = (assignment: QueueAssignment): string | undefined =>
  typeof assignment === "string" ? undefined : assignment.requestId;
const queueRecordsEqual = <T>(
  stored: Record<string, T> | undefined,
  normalized: Record<string, T>,
  valuesEqual: (left: T, right: T) => boolean,
): boolean => {
  const storedEntries = Object.entries(stored ?? {});
  if (storedEntries.length !== Object.keys(normalized).length) return false;
  return storedEntries.every(([key, value]) =>
    Object.prototype.hasOwnProperty.call(normalized, key)
    && valuesEqual(value, normalized[key]!),
  );
};

export class MatchQueue extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const body = await request.json<{ action?: "join" | "cancel" | "cleanup"; playerId?: string; trophies?: number; region?: string; queue?: string; request_id?: string }>();
    const playerId = body.playerId;
    if (!playerId) return Response.json({ error: "INVALID_PLAYER" }, { status: 400 });
    const requestId = normalizeQueueRequestId(body.request_id);
    if (body.request_id != null && !requestId) return Response.json({ error: "INVALID_REQUEST_ID" }, { status: 400 });
    const kind = normalizeQueueKind(body.queue);
    const now = Date.now();
    const { queueKey, assignKey } = queueStorageKeys(kind);
    const abuseKey = `queue_abuse:${playerId}`;
    const storedQueue = ((await this.ctx.storage.get<QueueEntry[]>(queueKey)) ?? []).filter(entry => now - entry.enqueuedAt < QUEUE_TTL_MS);
    const assignments = (await this.ctx.storage.get<Record<string, QueueAssignment>>(assignKey)) ?? {};
    const storedCancelFences = await this.ctx.storage.get<QueueCancelFences>(QUEUE_CANCEL_FENCES_KEY);
    const storedMatchReceipts = await this.ctx.storage.get<QueueMatchReceipts>(QUEUE_MATCH_RECEIPTS_KEY);
    let cancelFences = pruneQueueCancelFences(storedCancelFences, now);
    let matchReceipts = pruneQueueMatchReceipts(storedMatchReceipts, now);
    const bookkeepingWrites: Promise<unknown>[] = [];
    if (!queueRecordsEqual(storedCancelFences, cancelFences, (left, right) => left === right)) {
      bookkeepingWrites.push(Object.keys(cancelFences).length > 0
        ? this.ctx.storage.put(QUEUE_CANCEL_FENCES_KEY, cancelFences)
        : this.ctx.storage.delete(QUEUE_CANCEL_FENCES_KEY));
    }
    if (!queueRecordsEqual(
      storedMatchReceipts,
      matchReceipts,
      (left, right) =>
        left !== null
        && typeof left === "object"
        && left.matchId === right.matchId
        && left.expiresAt === right.expiresAt,
    )) {
      bookkeepingWrites.push(Object.keys(matchReceipts).length > 0
        ? this.ctx.storage.put(QUEUE_MATCH_RECEIPTS_KEY, matchReceipts)
        : this.ctx.storage.delete(QUEUE_MATCH_RECEIPTS_KEY));
    }
    await Promise.all(bookkeepingWrites);
    const queue = removeFencedQueueEntries(storedQueue, cancelFences, kind, now);
    let abuseState = await this.ctx.storage.get<QueueAbuseState>(abuseKey);
    if (isQueueAbuseStateExpired(abuseState, now)) {
      abuseState = undefined;
      await this.ctx.storage.delete(abuseKey);
    }

    const assignment = assignments[playerId];
    if (assignment && shouldDeliverQueueAssignment(body.action, queueAssignmentRequestId(assignment), requestId)) {
      const matchId = queueAssignmentMatchId(assignment);
      delete assignments[playerId];
      matchReceipts = addQueueMatchReceipt(matchReceipts, { kind, matchId, playerId, requestId, now });
      await Promise.all([
        this.ctx.storage.put(assignKey, assignments),
        this.ctx.storage.put(QUEUE_MATCH_RECEIPTS_KEY, matchReceipts),
        this.ctx.storage.delete(abuseKey),
      ]);
      return Response.json({ status: "MATCHED", match_id: matchId, mode: kind, request_id: requestId });
    }

    const committedMatchId = findQueueMatchReceipt(matchReceipts, { kind, playerId, requestId, now });
    if (committedMatchId) {
      await this.ctx.storage.delete(abuseKey);
      return Response.json({ status: "MATCHED", match_id: committedMatchId, mode: kind, request_id: requestId });
    }

    const isCancellation = body.action === "cancel" || body.action === "cleanup";
    if (!isCancellation && hasActiveQueueCancelFence(cancelFences, { kind, playerId, requestId, now })) {
      return Response.json({ status: "CANCELLED", cooldown_ms: 0, mode: kind, request_id: requestId });
    }

    if (isCancellation) {
      cancelFences = addQueueCancelFence(cancelFences, { kind, playerId, requestId, now });
      const { wasQueued, remaining } = removeQueueEntriesForCancellation(queue, playerId, requestId);
      if (body.action === "cleanup") {
        await Promise.all([
          this.ctx.storage.put(queueKey, remaining),
          requestId ? this.ctx.storage.put(QUEUE_CANCEL_FENCES_KEY, cancelFences) : Promise.resolve(),
        ]);
        return Response.json({ status: "CANCELLED", cooldown_ms: 0, mode: kind, request_id: requestId });
      }
      if (!wasQueued) {
        await Promise.all([
          this.ctx.storage.put(queueKey, remaining),
          requestId ? this.ctx.storage.put(QUEUE_CANCEL_FENCES_KEY, cancelFences) : Promise.resolve(),
        ]);
        return Response.json({ status: "CANCELLED", cooldown_ms: 0, cancel_count: abuseState?.cancelCount ?? 0, mode: kind, request_id: requestId });
      }
      const cancellation = recordQueueCancellation(abuseState, now);
      await Promise.all([
        this.ctx.storage.put(queueKey, remaining),
        this.ctx.storage.put(abuseKey, cancellation.state),
        requestId ? this.ctx.storage.put(QUEUE_CANCEL_FENCES_KEY, cancelFences) : Promise.resolve(),
      ]);
      return Response.json({
        status: "CANCELLED",
        cooldown_ms: cancellation.cooldownMs,
        cancel_count: cancellation.cancelCount,
        remaining_before_penalty: cancellation.remainingBeforePenalty,
        mode: kind,
        request_id: requestId,
      });
    }

    const cooldownMs = queueCooldownRemaining(abuseState, now);
    if (cooldownMs > 0) {
      cancelFences = addQueueCancelFence(cancelFences, { kind, playerId, requestId, now });
      const { remaining } = removeQueueEntriesForCancellation(queue, playerId, requestId);
      await Promise.all([
        this.ctx.storage.put(queueKey, remaining),
        requestId ? this.ctx.storage.put(QUEUE_CANCEL_FENCES_KEY, cancelFences) : Promise.resolve(),
      ]);
      return Response.json({ status: "COOLDOWN", cooldown_ms: cooldownMs, mode: kind });
    }

    const trophies = Number.isFinite(body.trophies) ? Math.max(0, Math.floor(Number(body.trophies))) : 0;
    const region = normalizeRegion(body.region);
    const selfBand = kind === "event" ? Number.POSITIVE_INFINITY : cupBand(0);

    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < queue.length; i++) {
      const candidate = queue[i]!;
      if (candidate.playerId === playerId) continue;
      const waitMs = Math.max(now - candidate.enqueuedAt, 0);
      // Event queue: fun mode — ignore cup bands, soft region prefer only
      if (kind !== "event") {
        const band = cupBand(waitMs);
        if (!withinBand(trophies, candidate.trophies, band)) continue;
      }
      const regionPenalty = candidate.region === region ? 0 : 1_000_000;
      const cupGap = kind === "event" ? 0 : Math.abs(trophies - candidate.trophies);
      const ageBonus = now - candidate.enqueuedAt;
      const score = regionPenalty + cupGap * 10 - ageBonus;
      if (score < bestScore) { bestScore = score; bestIndex = i; }
    }

    if (bestIndex < 0 && kind !== "event") {
      for (let i = 0; i < queue.length; i++) {
        const candidate = queue[i]!;
        if (candidate.playerId === playerId) continue;
        const waitMs = now - candidate.enqueuedAt;
        if (!withinBand(trophies, candidate.trophies, cupBand(waitMs))) continue;
        bestIndex = i;
        break;
      }
    }

    if (bestIndex < 0) {
      const existing = queue.find(entry =>
        entry.playerId === playerId && queueRequestIdsMatch(entry.requestId, requestId),
      );
      const withoutSelf = queue.filter(entry => entry.playerId !== playerId);
      withoutSelf.push({ playerId, enqueuedAt: existing?.enqueuedAt ?? now, trophies, region, ...(requestId ? { requestId } : {}) });
      await this.ctx.storage.put(queueKey, withoutSelf);
      return Response.json({ status: "WAITING", band: selfBand === Number.POSITIVE_INFINITY ? "GLOBAL" : selfBand, region, mode: kind, request_id: requestId });
    }

    const opponent = queue[bestIndex]!;
    const remaining = queue.filter((_, index) => index !== bestIndex).filter(entry => entry.playerId !== playerId);
    const matchId = `${kind}-${crypto.randomUUID()}`;
    assignments[opponent.playerId] = { matchId, ...(opponent.requestId ? { requestId: opponent.requestId } : {}) };
    matchReceipts = addQueueMatchReceipt(matchReceipts, { kind, matchId, playerId, requestId, now });
    matchReceipts = addQueueMatchReceipt(matchReceipts, {
      kind,
      matchId,
      playerId: opponent.playerId,
      requestId: opponent.requestId,
      now,
    });
    await Promise.all([
      this.ctx.storage.put(queueKey, remaining),
      this.ctx.storage.put(assignKey, assignments),
      this.ctx.storage.put(QUEUE_MATCH_RECEIPTS_KEY, matchReceipts),
      this.ctx.storage.delete(abuseKey),
      this.ctx.storage.delete(`queue_abuse:${opponent.playerId}`),
    ]);
    return Response.json({ status: "MATCHED", match_id: matchId, mode: kind, matched_region: opponent.region === region ? region : "MIXED", request_id: requestId });
  }
}

export class MatchRoom extends DurableObject<Env> {
  private engine: MatchEngine | null = null;
  private data: MatchData | null = null;
  private sockets = new Map<WebSocket, string>();
  private commands = new Set<string>();
  private matchId = "";
  private pause: Pause | null = null;
  private persistedRounds = 0;
  private rematch: { requester: string; matchId: string } | null = null;
  private chatStyles = new Map<string, string>();
  private lastEmoteAt = new Map<string, number>();
  private eventScope: EventScope | null = null;
  private matchMode: RoomMatchMode = "FRIEND";
  private answerChoices: AnswerChoice[] = [];
  private playerCards: Record<string, unknown>[] = [];
  private playerCardsHydrated = false;

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);
    this.matchId = url.pathname.split("/").pop() || "dev";
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket required", { status: 426 });
    const token = url.searchParams.get("token");
    if (!token || !this.env.MATCH_TOKEN_SECRET) return new Response("match ticket required", { status: 401 });
    let ticket;
    try { ticket = await verifyMatchTicket(token, this.matchId, this.env.MATCH_TOKEN_SECRET); }
    catch { return new Response("invalid match ticket", { status: 401 }); }
    const player = ticket.playerId;
    const wantsBot = ticket.mode === "bot";
    const quickMatch = ticket.mode === "quick";
    const blitzMatch = ticket.mode === "blitz";
    const rankedMatch = ticket.mode === "ranked";
    const eventMatch = ticket.mode === "event";
    const current = [...this.sockets].find(([, id]) => id === player);
    if (current) { current[0].close(1000, "replaced"); this.sockets.delete(current[0]); }
    const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]); pair[1].serializeAttachment({ player }); this.sockets.set(pair[1], player);
    const players = [...new Set(this.sockets.values())];
    if (!this.engine && (players.length === 2 || (players.length === 1 && wantsBot))) {
      let event: EventScope | null = null;
      if (eventMatch) {
        event = await loadLiveEventScope(this.env);
        if (!event) {
          this.sockets.delete(pair[1]);
          pair[1].close(1008, "EVENT_NOT_LIVE");
          return new Response("event not live", { status: 409 });
        }
        this.eventScope = event;
      }
      this.data = await createMatchData(this.env, {
        leagueFilter: event?.league ?? null,
        event,
      });
      if (blitzMatch) this.data.rules = applyMatchModeRules(this.data.rules, "blitz");
      if (rankedMatch) this.data.rules = applyMatchModeRules(this.data.rules, "ranked");
      this.matchMode = eventMatch ? "EVENT" : blitzMatch ? "BLITZ" : rankedMatch ? "RANKED" : quickMatch ? "QUICK" : wantsBot ? "BOT" : "FRIEND";
      const opponent = wantsBot ? BOT_PLAYER_ID : players[1]!;
      this.engine = new MatchEngine([players[0]!, opponent], this.data.rules);
      if (wantsBot) this.engine.ready(BOT_PLAYER_ID);
      else await this.data.persistStart(
        this.matchId,
        this.engine.state.players,
        this.matchMode === "BOT" ? "FRIEND" : this.matchMode,
      );
      this.engine.state.deadline = Date.now() + (blitzMatch ? 8_000 : rankedMatch ? 15_000 : 10_000);
      this.playerCards = wantsBot ? [] : await this.loadPlayerCards(this.engine.state.players);
      this.playerCardsHydrated = wantsBot || this.playerCards.length > 0;
      this.broadcast("READY_CHECK_STARTED", {
        deadline: this.engine.state.deadline,
        player_cards: this.playerCards,
        match_mode: this.matchMode,
        event: event ? { id: event.id, league: event.league, title_tr: event.title_tr, title_en: event.title_en, accent: event.accent } : null,
        rules: {
          winning_score: this.data.rules.winningScore,
          maximum_rounds: this.data.rules.maximumRounds,
          answer_ms: this.data.rules.answerMs,
          selection_ms: this.data.rules.selectionMs,
        },
      });
    } else if (this.engine) {
      if (this.pause?.disconnectedPlayer === player) await this.resume(player);
      else {
        this.send(pair[1], "PLAYER_RECONNECTED", await this.reconnectSnapshotFor(player));
        if (this.engine.state.phase === "ANSWERING" && this.isChoiceMode()) this.sendAnswerPhaseTo(player);
        if (this.rematch) this.send(pair[1], player === this.rematch.requester ? "REMATCH_REQUESTED" : "REMATCH_OFFER", { match_id: this.rematch.matchId, mode: ticketModeForRoom(this.matchMode) });
      }
    }
    await this.persist(); return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      await this.ensureLoaded();
      const cmd = JSON.parse(String(message)) as ClientMessage;
      if (cmd.protocol_version !== PROTOCOL_VERSION || cmd.match_id !== this.matchId) throw new Error("INVALID_ENVELOPE");
      if (this.commands.has(cmd.command_id)) throw new Error("DUPLICATE_COMMAND"); this.commands.add(cmd.command_id);
      const player = this.sockets.get(ws); if (!player || !this.engine || !this.data) throw new Error("ROOM_NOT_READY");
      await this.handle(player, cmd); await this.persist();
    } catch (error) { this.send(ws, "ERROR", { code: error instanceof Error ? error.message : "UNKNOWN" }); }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ensureLoaded();
    const player = this.sockets.get(ws); this.sockets.delete(ws);
    if (!player || !this.engine || this.engine.state.phase === "FINISHED" || this.pause) return;
    const now = Date.now(); const remainingMs = Math.max(0, (this.engine.state.deadline ?? now) - now);
    this.pause = { phase: this.engine.state.phase, remainingMs, disconnectedPlayer: player, deadline: now + (this.data?.rules.reconnectMs ?? 60_000) };
    this.engine.state.phase = "PAUSED"; this.engine.state.deadline = this.pause.deadline;
    this.broadcast("MATCH_PAUSED", { reconnect_deadline: this.pause.deadline }); await this.ctx.storage.setAlarm(this.pause.deadline); await this.persist();
  }

  private async handle(player: string, cmd: ClientMessage): Promise<void> {
    const engine = this.engine!, data = this.data!;
    switch (cmd.event_type) {
      case "READY_CONFIRM": if (engine.ready(player)) {
        this.playerCards = this.hasBot() ? [] : await this.loadPlayerCards(engine.state.players);
        this.playerCardsHydrated = this.hasBot() || this.playerCards.length > 0;
        this.broadcast("MATCH_STARTED", { football_data_version_id: data.versionId, player_cards: this.playerCards, match_mode: this.matchMode });
        await this.startSelection();
      } break;
      case "TEAM_SELECT": engine.select(player, String(cmd.payload.club_id)); break;
      case "TEAM_CONFIRM": {
        if (this.hasBot() && player !== BOT_PLAYER_ID) {
          engine.confirm(player);
          if (await this.completeBotSelection(player)) await this.validateSelections();
        } else if (engine.confirm(player)) await this.validateSelections();
        else this.sendTo(player, "TEAM_SELECTION_LOCKED", {});
        break;
      }
      case "ANSWER_SUBMIT": {
        const clubs = [...engine.state.selections.values()] as [string, string];
        const raw = resolveAnswerPayload(this.isChoiceMode(), this.answerChoices, cmd.payload);
        const normalized = normalizeAnswer(raw);
        const correct = normalized ? await data.validate(clubs[0], clubs[1], normalized) : false;
        const receivedAt = Date.now(); engine.submit(player, raw, receivedAt, correct ? new Set([normalized]) : new Set());
        // correct flag is private to submitter only — never broadcast
        this.sendTo(player, "ANSWER_ACCEPTED", { correct, last_second: engine.state.deadline != null && engine.state.deadline - receivedAt <= 2_500 });
        if (engine.state.submissions.size === 2) await this.startReveal(); break;
      }
      case "EMOTE_SEND": {
        if (engine.state.phase === "FINISHED" || engine.state.phase === "PAUSED") throw new Error("INVALID_PHASE");
        const now = Date.now(); if (now - (this.lastEmoteAt.get(player) ?? 0) < EMOTE_COOLDOWN_MS) throw new Error("EMOTE_COOLDOWN"); this.lastEmoteAt.set(player, now);
        const kind = String(cmd.payload.kind ?? "TEXT");
        // Never trust the client-provided style id: premium chat ownership and
        // equipped state are server-sourced. Cache it for the life of the room.
        let chatStyleId = this.chatStyles.get(player);
        if (!chatStyleId) {
          try {
            const equippedStyle = await data.getPlayerChatStyle(player);
            chatStyleId = chatStyleIds.has(equippedStyle) ? equippedStyle : "chat-classic";
          } catch { chatStyleId = "chat-classic"; }
        }
        this.chatStyles.set(player, chatStyleId);

        if (kind === "EMOJI") {
          const emoteId = String(cmd.payload.emote_id ?? "") as EmoteId;
          if (!allEmoteIds.has(emoteId)) throw new Error("INVALID_EMOTE");
          if (!freeEmoteIds.has(emoteId)) {
            const owned = await data.playerOwnsEmote(player, emoteId);
            if (!owned) throw new Error("EMOTE_NOT_OWNED");
          }
          this.broadcast("QUICK_MESSAGE", { player_id: player, kind: "EMOJI", emote_id: emoteId, chat_style_id: chatStyleId });
          break;
        }

        const messageId = String(cmd.payload.message_id) as QuickMessageId;
        if (!quickMessageIds.has(messageId)) throw new Error("INVALID_QUICK_MESSAGE");
        this.broadcast("QUICK_MESSAGE", { player_id: player, kind: "TEXT", message_id: messageId, chat_style_id: chatStyleId });
        break;
      }
      case "RECONNECT": {
        const snapshot = await this.reconnectSnapshotFor(player);
        if (engine.state.phase === "READY_CHECK") {
          this.sendTo(player, "READY_CHECK_STARTED", {
            deadline: engine.state.deadline ?? Date.now() + 10_000,
            player_cards: snapshot.player_cards,
            match_mode: snapshot.match_mode,
            rules: snapshot.rules,
          });
        } else {
          this.sendTo(player, "PLAYER_RECONNECTED", snapshot);
        }
        break;
      }
      case "LEAVE_MATCH": await this.finishForfeit(player); break;
      case "REMATCH_REQUEST": {
        if (this.hasBot() || engine.state.phase !== "FINISHED") throw new Error("REMATCH_UNAVAILABLE");
        const opponent = engine.state.players.find(id => id !== player)!;
        const matchId = `${this.matchId}-rematch-${Date.now().toString(36)}`;
        this.rematch = { requester: player, matchId };
        await this.persistRematchOffer(player, opponent, matchId);
        const mode = ticketModeForRoom(this.matchMode);
        this.sendTo(player, "REMATCH_REQUESTED", { match_id: matchId, mode });
        this.sendTo(opponent, "REMATCH_OFFER", { match_id: matchId, mode });
        break;
      }
      case "REMATCH_ACCEPT": {
        if (!this.rematch || player === this.rematch.requester || engine.state.phase !== "FINISHED") throw new Error("REMATCH_UNAVAILABLE");
        await this.updateRematchOfferStatus(this.rematch.matchId, "ACCEPTED");
        this.broadcast("REMATCH_STARTED", { match_id: this.rematch.matchId, mode: ticketModeForRoom(this.matchMode) });
        this.rematch = null;
        break;
      }
      case "REMATCH_DECLINE": {
        if (!this.rematch || player === this.rematch.requester) throw new Error("REMATCH_UNAVAILABLE");
        await this.updateRematchOfferStatus(this.rematch.matchId, "DECLINED");
        this.sendTo(this.rematch.requester, "REMATCH_DECLINED", {});
        this.rematch = null;
        break;
      }
    }
  }

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    if (!this.engine || !this.data) return;
    try {
      if (this.engine.state.phase === "PAUSED") { if (this.pause && Date.now() >= this.pause.deadline) await this.finishForfeit(this.pause.disconnectedPlayer); }
      else if (this.engine.state.phase === "TEAM_SELECTION") await this.autoCompleteSelection();
      else if (this.engine.state.phase === "COUNTDOWN") {
        this.engine.startAnswering(Date.now() + this.data.rules.answerMs);
        if (this.hasBot()) this.engine.submit(BOT_PLAYER_ID, "cevap yok", Date.now(), new Set());
        this.answerChoices = [];
        if (this.isChoiceMode()) {
          const clubs = [...this.engine.state.selections.values()] as [string, string];
          const labels = this.hasBot()
            ? await this.data.trainingChoices(clubs[0]!, clubs[1]!, 3)
            : await this.data.competitiveChoices(clubs[0]!, clubs[1]!, 4);
          const required = this.hasBot() ? 3 : 4;
          if (labels.length < required) {
            if (!this.hasBot()) {
              this.broadcast("TEAM_SELECTION_INVALID", { reason: "CHOICES_UNAVAILABLE" });
              await this.startSelection();
              return;
            }
          } else {
            this.answerChoices = labels.slice(0, required).map(label => ({ id: crypto.randomUUID(), label }));
          }
        }
        if (this.isChoiceMode() && this.answerChoices.length) {
          for (const player of this.engine.state.players) if (player !== BOT_PLAYER_ID) this.sendAnswerPhaseTo(player);
        } else {
          this.broadcast("ANSWER_PHASE_STARTED", { deadline: this.engine.state.deadline, input_mode: "TEXT" });
        }
        await this.ctx.storage.setAlarm(this.engine.state.deadline!);
      }
      else if (this.engine.state.phase === "ANSWERING") await this.startReveal();
      else if (this.engine.state.phase === "REVEAL") await this.startSelection();
      else if (this.engine.state.phase === "SUDDEN_DEATH") await this.startSuddenDeath();
    } finally { await this.persist(); }
  }

  private async startSelection(): Promise<void> {
    const deadline = Date.now() + this.data!.rules.selectionMs;
    const suggestions = [...this.data!.clubs].sort(() => Math.random() - 0.5).slice(0, this.data!.rules.teamPoolSize);
    this.engine!.startSelection(this.data!.clubs, deadline, suggestions);
    this.broadcast("NEXT_ROUND", { round: this.engine!.state.normalRound + 1 });
    this.broadcast("TEAM_POOL_CREATED", { clubs: suggestions, searchable_clubs: this.data!.clubs }); this.broadcast("TEAM_SELECTION_STARTED", { deadline });
    await this.ctx.storage.setAlarm(deadline);
  }

  private async validateSelections(): Promise<void> {
    const engine = this.engine!, [a, b] = engine.state.players.map(p => engine.state.selections.get(p)) as [string, string];
    const hasPair = a !== b && !engine.state.usedPairs.has(pairKey(a, b)) && await this.data!.hasPair(a, b);
    const result = engine.validateSelection({ hasPair: () => hasPair, answers: () => new Set() });
    if (!result.valid) { this.broadcast("TEAM_SELECTION_INVALID", { reason: result.reason ?? "RESELECT_REQUIRED" }); await this.startSelection(); return; }
    await this.startCountdown(result.clubs!);
  }

  private async autoCompleteSelection(): Promise<void> {
    const engine = this.engine!, [p1, p2] = engine.state.players; let a = engine.state.selections.get(p1), b = engine.state.selections.get(p2);
    if (a && !b) b = await this.partnerFor(a); else if (!a && b) a = await this.partnerFor(b);
    if (!a || !b || a === b || !(await this.data!.hasPair(a, b))) {
      const picked = await this.data!.pickPair([...engine.state.usedPairs], this.data!.rules.suddenDeathMinAnswers); if (!picked) throw new Error("NO_UNUSED_PAIR"); [a, b] = picked.clubs.map(c => c.id) as [string, string];
    }
    engine.state.selections.set(p1, a); engine.state.selections.set(p2, b); engine.state.confirmed.add(p1); engine.state.confirmed.add(p2); await this.validateSelections();
  }

  private async partnerFor(club: string): Promise<string | undefined> {
    for (const candidate of this.data!.clubs) if (candidate.id !== club && !this.engine!.state.usedPairs.has(pairKey(club, candidate.id)) && await this.data!.hasPair(club, candidate.id)) return candidate.id;
    return undefined;
  }

  private hasBot(): boolean { return this.engine?.state.players.includes(BOT_PLAYER_ID) ?? false; }
  private isChoiceMode(): boolean { return this.matchMode === "QUICK" || this.matchMode === "BLITZ" || this.matchMode === "BOT"; }
  private sendAnswerPhaseTo(player: string): void {
    const choices = [...this.answerChoices].sort(() => Math.random() - 0.5);
    this.sendTo(player, "ANSWER_PHASE_STARTED", { deadline: this.engine?.state.deadline, input_mode: "CHOICE", choices });
  }

  private async completeBotSelection(player: string): Promise<boolean> {
    const selected = this.engine!.state.selections.get(player);
    if (!selected) throw new Error("NO_SELECTION");
    const botClub = await this.partnerFor(selected);
    if (!botClub) {
      this.broadcast("TEAM_SELECTION_INVALID", { reason: "NO_COMMON_PLAYER" });
      await this.startSelection();
      return false;
    }
    this.engine!.select(BOT_PLAYER_ID, botClub);
    this.engine!.confirm(BOT_PLAYER_ID);
    return true;
  }

  private async startCountdown(clubs: [string, string]): Promise<void> {
    this.broadcast("TEAMS_REVEALED", { club_ids: clubs }); this.engine!.state.phase = "COUNTDOWN"; this.engine!.state.deadline = Date.now() + 3_000;
    this.broadcast("COUNTDOWN_STARTED", { seconds: 3, deadline: this.engine!.state.deadline }); await this.ctx.storage.setAlarm(this.engine!.state.deadline);
  }

  private async startSuddenDeath(): Promise<void> {
    const picked = await this.data!.pickPair([...this.engine!.state.usedPairs], this.data!.rules.suddenDeathMinAnswers);
    if (!picked) throw new Error("NO_UNUSED_PAIR"); const [a, b] = picked.clubs.map(c => c.id) as [string, string];
    this.engine!.state.usedPairs.add(pairKey(a, b)); this.engine!.state.selections.clear(); this.engine!.state.selections.set(this.engine!.state.players[0], a); this.engine!.state.selections.set(this.engine!.state.players[1], b);
    this.broadcast("SUDDEN_DEATH_STARTED", { clubs: picked.clubs }); await this.startCountdown([a, b]);
  }

  private async startReveal(): Promise<void> {
    const engine = this.engine!; const clubs = [...engine.state.selections.values()] as [string, string]; const suddenDeath = engine.state.suddenDeath;
    const result = engine.reveal(); this.persistedRounds++;
    const ranked = [...engine.state.submissions.values()].filter(item => item.correct).sort((a, b) => a.sequence - b.sequence);
    const marginMs = ranked.length >= 2 ? Math.max(0, ranked[1]!.receivedAt - ranked[0]!.receivedAt) : null;
    const winReason = ranked.length >= 2 ? "FIRST_CORRECT" : ranked.length === 1 ? "ONLY_CORRECT" : "NO_CORRECT";
    // Hold reveal long enough for momentum beat; floor at 1s even if admin sets lower
    const revealMs = Math.max(1_000, this.data!.rules.revealMs);
    if (!this.hasBot()) await this.data!.persistRound({ roomKey: this.matchId, ordinal: this.persistedRounds, suddenDeath, clubs, winnerId: result.roundWinnerId, submissions: [...engine.state.submissions.values()].map(item => ({ player_id: item.playerId, raw_answer: item.raw, normalized_answer: item.normalized, is_correct: item.correct, last_second: engine.state.deadline != null && item.receivedAt <= engine.state.deadline && engine.state.deadline - item.receivedAt <= 1_000, received_at_ms: item.receivedAt, sequence: item.sequence })), scores: engine.state.scores });
    this.broadcast("REVEAL_STARTED", {
      submissions: [...engine.state.submissions.values()].map(({ playerId, raw, correct, receivedAt, sequence }) => ({ player_id: playerId, answer: raw, correct, received_at_ms: receivedAt, sequence })),
      round_winner_id: result.roundWinnerId,
      scores: engine.state.scores,
      margin_ms: marginMs,
      win_reason: winReason,
      reveal_ms: revealMs,
      reveal_deadline: result.finished ? null : Date.now() + revealMs,
    });
    this.broadcast("SCORE_UPDATED", { scores: engine.state.scores });
    if (result.finished) {
      if (!this.hasBot()) await this.data!.persistFinish(this.matchId, engine.state.winnerId!, engine.state.scores);
      this.broadcast("MATCH_FINISHED", { winner_id: engine.state.winnerId });
    } else {
      engine.state.deadline = Date.now() + revealMs;
      await this.ctx.storage.setAlarm(engine.state.deadline);
    }
  }
  private async persistRematchOffer(requester: string, recipient: string, nextMatchKey: string): Promise<void> {
    const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/rematch_offers`, { method: "POST", headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ room_key: this.matchId, requester_id: requester, recipient_id: recipient, next_match_key: nextMatchKey, match_mode: this.matchMode }) });
    if (!response.ok) throw new Error("REMATCH_PERSIST_FAILED");
  }
  private async updateRematchOfferStatus(nextMatchKey: string, status: "ACCEPTED" | "DECLINED"): Promise<void> {
    const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/rematch_offers?room_key=eq.${encodeURIComponent(this.matchId)}&next_match_key=eq.${encodeURIComponent(nextMatchKey)}&status=eq.PENDING`, {
      method: "PATCH",
      headers: {
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error("REMATCH_STATUS_UPDATE_FAILED");
  }

  private async resume(_player: string): Promise<void> {
    const pause = this.pause!;
    this.pause = null;
    this.engine!.state.phase = pause.phase;
    this.engine!.state.deadline = Date.now() + pause.remainingMs;
    for (const player of this.engine!.state.players) {
      this.sendTo(player, "PLAYER_RECONNECTED", await this.reconnectSnapshotFor(player));
      if (pause.phase === "ANSWERING" && this.isChoiceMode() && player !== BOT_PLAYER_ID) {
        this.sendAnswerPhaseTo(player);
      }
    }
    if (pause.remainingMs > 0) await this.ctx.storage.setAlarm(this.engine!.state.deadline);
    else await this.alarm();
  }
  private async finishForfeit(leaver: string): Promise<void> { const winner = this.engine!.state.players.find(p => p !== leaver)!; this.pause = null; this.engine!.state.winnerId = winner; this.engine!.state.phase = "FINISHED"; this.engine!.state.deadline = null; if (!this.hasBot()) await this.data!.persistFinish(this.matchId, winner, this.engine!.state.scores); this.broadcast("MATCH_FINISHED", { winner_id: winner, forfeit: true }); }
  private async ensureLoaded(): Promise<void> {
    if (this.engine && this.data) return;
    const stored = await this.ctx.storage.get<StoredRoom>("room");
    if (stored) {
      this.matchId = stored.matchId;
      this.engine = MatchEngine.restore(stored.engine);
      this.pause = stored.pause;
      this.persistedRounds = stored.persistedRounds ?? 0;
      this.rematch = stored.rematch ?? null;
      this.eventScope = stored.event ?? null;
      this.matchMode = stored.matchMode ?? (stored.matchId.startsWith("blitz-") ? "BLITZ" : stored.matchId.startsWith("ranked-") ? "RANKED" : stored.matchId.startsWith("quick-") ? "QUICK" : "FRIEND");
      this.answerChoices = stored.answerChoices ?? [];
      this.playerCards = stored.playerCards ?? [];
      this.playerCardsHydrated = this.hasBot() || (stored.playerCards?.length ?? 0) > 0;
    }
    if (!this.data && this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY) {
      const restoreOpts: { requestedVersion?: string; leagueFilter?: string | null; event?: EventScope | null } = {
        leagueFilter: stored?.leagueFilter ?? stored?.event?.league ?? null,
        event: stored?.event ?? null,
      };
      if (stored?.dataVersionId) restoreOpts.requestedVersion = stored.dataVersionId;
      this.data = await createMatchData(this.env, restoreOpts);
      if (this.matchMode === "BLITZ") this.data.rules = applyMatchModeRules(this.data.rules, "blitz");
      if (this.matchMode === "RANKED") this.data.rules = applyMatchModeRules(this.data.rules, "ranked");
    }
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { player?: string } | null;
      if (attachment?.player) this.sockets.set(ws, attachment.player);
    }
  }
  private async persist(): Promise<void> {
    if (!this.engine || !this.data) return;
    await this.ctx.storage.put("room", {
      matchId: this.matchId,
      engine: this.engine.serialize(),
      pause: this.pause,
      dataVersionId: this.data.versionId,
      persistedRounds: this.persistedRounds,
      rematch: this.rematch,
      leagueFilter: this.data.leagueFilter,
      event: this.eventScope ?? this.data.event,
      matchMode: this.matchMode,
      answerChoices: this.answerChoices,
      playerCards: this.playerCards,
    } satisfies StoredRoom);
  }
  private async reconnectSnapshotFor(player: string) {
    if (!this.playerCardsHydrated) {
      this.playerCards = this.hasBot() ? [] : await this.loadPlayerCards(this.engine!.state.players);
      this.playerCardsHydrated = true;
    }
    const snapshot = this.engine!.snapshotFor(player);
    return {
      ...snapshot,
      player_cards: this.playerCards,
      match_mode: this.matchMode,
      rules: {
        ...snapshot.rules,
        answer_ms: this.data!.rules.answerMs,
        selection_ms: this.data!.rules.selectionMs,
      },
    };
  }
  private async loadPlayerCards(playerIds: string[]): Promise<Record<string, unknown>[]> {
    try {
      if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) return [];
      const uuids = playerIds.filter(id => id !== BOT_PLAYER_ID && /^[0-9a-f-]{36}$/i.test(id));
      if (!uuids.length) return [];
      const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/rpc/match_player_cards`, {
        method: "POST",
        headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_player_ids: uuids }),
      });
      if (!response.ok) return [];
      const value = await response.json();
      if (!Array.isArray(value)) return [];
      if (this.matchMode !== "QUICK" && this.matchMode !== "BLITZ" && this.matchMode !== "RANKED") return value as Record<string, unknown>[];
      const profileResponse = await fetch(`${this.env.SUPABASE_URL}/rest/v1/profiles?id=in.(${uuids.join(",")})&select=id,trophies,blitz_trophies,ranked_trophies`, {
        headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (!profileResponse.ok) return value as Record<string, unknown>[];
      const profiles = await profileResponse.json() as { id: string; trophies: number; blitz_trophies: number; ranked_trophies: number }[];
      const trophyByPlayer = new Map(profiles.map(profile => [profile.id, this.matchMode === "BLITZ" ? profile.blitz_trophies : this.matchMode === "RANKED" ? profile.ranked_trophies : profile.trophies]));
      return (value as Record<string, unknown>[]).map(card => ({ ...card, trophies: trophyByPlayer.get(String(card.player_id)) ?? Number(card.trophies ?? 0) }));
    } catch { return []; }
  }
  private envelope(type: ServerEventType, payload: Record<string, unknown>): ServerMessage { return { protocol_version: 1, match_id: this.matchId, event_id: crypto.randomUUID(), server_timestamp: new Date().toISOString(), event_type: type, payload }; }
  private send(ws: WebSocket, type: ServerEventType, payload: Record<string, unknown>): void { ws.send(JSON.stringify(this.envelope(type, payload))); }
  private broadcast(type: ServerEventType, payload: Record<string, unknown>): void { for (const ws of this.sockets.keys()) this.send(ws, type, payload); }
  private sendTo(player: string, type: ServerEventType, payload: Record<string, unknown>): void { for (const [ws, id] of this.sockets) if (id === player) this.send(ws, type, payload); }
}

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (url.pathname === "/notification-dispatch" && request.method === "POST") {
    return handleNotificationDispatch(request, env);
  }
  if (url.pathname === "/match-token" && request.method === "POST") {
    try {
      const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!bearer || !env.MATCH_TOKEN_SECRET) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders });
      const playerId = await verifySupabaseAccessToken(bearer, env);
      const body = await request.json<{ match_id?: string; mode?: string }>();
      const matchId = body.match_id?.trim();
      if (!matchId || matchId.length > 100) return Response.json({ error: "INVALID_MATCH_ID" }, { status: 400, headers: corsHeaders });
      const requestedMode: MatchTicketMode | undefined =
        body.mode === "bot" || body.mode === "quick" || body.mode === "blitz" || body.mode === "ranked" || body.mode === "event" ? body.mode : undefined;
      const mode = rematchModeFromMatchId(matchId) ?? requestedMode;
      const token = await createMatchTicket({ playerId, matchId, mode }, env.MATCH_TOKEN_SECRET);
      return Response.json({ token, expires_in: 60 }, { headers: corsHeaders });
    } catch { return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders }); }
  }
  if ((url.pathname === "/quick-match" || url.pathname === "/blitz-match" || url.pathname === "/ranked-match" || url.pathname === "/event-match") && request.method === "POST") {
    try {
      const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!bearer) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders });
      const playerId = await verifySupabaseAccessToken(bearer, env);
      const body = await request.json<{ action?: "join" | "cancel"; region?: string; request_id?: string }>();
      const requestId = normalizeQueueRequestId(body.request_id);
      if (body.request_id != null && !requestId) {
        return Response.json({ error: "INVALID_REQUEST_ID" }, { status: 400, headers: corsHeaders });
      }
      const queueKind: QueueKind = url.pathname === "/blitz-match" ? "blitz" : url.pathname === "/ranked-match" ? "ranked" : url.pathname === "/event-match" ? "event" : "quick";
      const externalAction = body.action === "cancel" ? "cancel" : "join";
      const queue = env.MATCH_QUEUE.get(env.MATCH_QUEUE.idFromName("global"));
      const cleanupBeforeTerminal = async (terminal: Record<string, unknown>): Promise<Response> => {
        try {
          const cleanupResponse = await queue.fetch(new Request("https://queue/", {
            method: "POST",
            body: JSON.stringify({
              action: "cleanup",
              playerId,
              queue: queueKind,
              request_id: requestId,
            }),
            headers: { "Content-Type": "application/json" },
          }));
          if (!cleanupResponse.ok) {
            return new Response(cleanupResponse.body, {
              status: cleanupResponse.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const cleanupResult = await cleanupResponse.json<{ status?: string; match_id?: string }>();
          if (cleanupResult.status === "MATCHED" && cleanupResult.match_id) {
            return Response.json(cleanupResult, { headers: corsHeaders });
          }
          return Response.json(terminal, { headers: corsHeaders });
        } catch {
          return Response.json({ error: "QUEUE_CLEANUP_FAILED" }, { status: 503, headers: corsHeaders });
        }
      };
      if (queueKind === "event" && externalAction !== "cancel") {
        const live = await loadLiveEventScope(env);
        if (!live) return cleanupBeforeTerminal({ status: "NO_EVENT", mode: "event" });
      }
      if (queueKind === "ranked" && externalAction !== "cancel") {
        const unlockedResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ranked_player_unlocked`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_player_id: playerId }),
        });
        const unlocked = unlockedResponse.ok && await unlockedResponse.json() === true;
        if (!unlocked) {
          return cleanupBeforeTerminal({ status: "RANKED_LOCKED", required_quick_matches: 5, mode: "ranked" });
        }
      }
      // Trophies come from DB, never the client. Each competitive mode has its own ladder.
      let trophies = 0;
      if (externalAction !== "cancel" && queueKind !== "event" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const select = queueKind === "blitz" ? "blitz_trophies" : queueKind === "ranked" ? "ranked_trophies" : "trophies";
          const profileResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${playerId}&select=${select}`, {
            headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
          });
          if (profileResponse.ok) {
            const rows = await profileResponse.json() as { trophies?: number; blitz_trophies?: number; ranked_trophies?: number }[];
            const raw = queueKind === "blitz" ? rows[0]?.blitz_trophies : queueKind === "ranked" ? rows[0]?.ranked_trophies : rows[0]?.trophies;
            trophies = Math.max(0, Math.floor(Number(raw ?? 0)));
          }
        } catch { /* queue still works with 0 trophies fallback */ }
      }
      const response = await queue.fetch(new Request("https://queue/", {
        method: "POST",
        body: JSON.stringify({
          action: externalAction,
          playerId,
          trophies,
          region: body.region,
          queue: queueKind,
          request_id: requestId,
        }),
        headers: { "Content-Type": "application/json" },
      }));
      return new Response(response.body, { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch { return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders }); }
  }
  if (!url.pathname.startsWith("/match/")) return new Response("football-link match server");
  const id = env.MATCH_ROOM.idFromName(url.pathname.split("/").pop()!); return env.MATCH_ROOM.get(id).fetch(request);
}, async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(checkPushReceipts(env));
  ctx.waitUntil(runSystemNotificationSweeps(env, new Date(_controller.scheduledTime)));
} };
