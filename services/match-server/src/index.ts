import { DurableObject } from "cloudflare:workers";
import { normalizeAnswer } from "@football-link/answer-normalizer";
import { MatchEngine, pairKey, type SerializedEngineState } from "@football-link/game-engine";
import { PROTOCOL_VERSION, type ClientMessage, type MatchPhase, type QuickMessageId, type ServerEventType, type ServerMessage } from "@football-link/shared";
import { createMatchData, type MatchData } from "./data";
import { createMatchTicket, verifyMatchTicket, verifySupabaseAccessToken } from "./auth";

interface Env { MATCH_ROOM: DurableObjectNamespace<MatchRoom>; MATCH_QUEUE: DurableObjectNamespace<MatchQueue>; SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; MATCH_TOKEN_SECRET: string }
type Pause = { phase: MatchPhase; remainingMs: number; disconnectedPlayer: string; deadline: number };
type StoredRoom = { matchId: string; engine: SerializedEngineState; pause: Pause | null; dataVersionId: string; persistedRounds?: number; rematch?: { requester: string; matchId: string } | null };
const BOT_PLAYER_ID = "test-bot";
const quickMessageIds = new Set<QuickMessageId>(["GOOD_LUCK", "NICE_ONE", "SO_CLOSE", "READY", "REMATCH"]);
const chatStyleIds = new Set(["chat-classic", "chat-floodlight", "chat-derby", "chat-neon"]);
const EMOTE_COOLDOWN_MS = 1_500;

type QueueEntry = { playerId: string; enqueuedAt: number };
export class MatchQueue extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const body = await request.json<{ action?: "join" | "cancel"; playerId?: string }>();
    const playerId = body.playerId;
    if (!playerId) return Response.json({ error: "INVALID_PLAYER" }, { status: 400 });
    const queue = (await this.ctx.storage.get<QueueEntry[]>("queue")) ?? [];
    const assignments = (await this.ctx.storage.get<Record<string, string>>("assignments")) ?? {};
    if (assignments[playerId]) { const matchId = assignments[playerId]!; delete assignments[playerId]; await this.ctx.storage.put("assignments", assignments); return Response.json({ status: "MATCHED", match_id: matchId }); }
    const filtered = queue.filter(entry => entry.playerId !== playerId && Date.now() - entry.enqueuedAt < 120_000);
    if (body.action === "cancel") { await this.ctx.storage.put("queue", filtered); return Response.json({ status: "CANCELLED" }); }
    const opponent = filtered.shift();
    if (!opponent) { filtered.push({ playerId, enqueuedAt: Date.now() }); await this.ctx.storage.put("queue", filtered); return Response.json({ status: "WAITING" }); }
    const matchId = `quick-${crypto.randomUUID()}`;
    assignments[opponent.playerId] = matchId;
    await Promise.all([this.ctx.storage.put("queue", filtered), this.ctx.storage.put("assignments", assignments)]);
    return Response.json({ status: "MATCHED", match_id: matchId });
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
    const current = [...this.sockets].find(([, id]) => id === player);
    if (current) { current[0].close(1000, "replaced"); this.sockets.delete(current[0]); }
    const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]); pair[1].serializeAttachment({ player }); this.sockets.set(pair[1], player);
    const players = [...new Set(this.sockets.values())];
    if (!this.engine && (players.length === 2 || (players.length === 1 && wantsBot))) {
      this.data = await createMatchData(this.env);
      const opponent = wantsBot ? BOT_PLAYER_ID : players[1]!;
      this.engine = new MatchEngine([players[0]!, opponent], this.data.rules);
      if (wantsBot) this.engine.ready(BOT_PLAYER_ID);
      else await this.data.persistStart(this.matchId, this.engine.state.players, quickMatch ? "QUICK" : "FRIEND");
      this.engine.state.deadline = Date.now() + 10_000;
      this.broadcast("READY_CHECK_STARTED", { deadline: this.engine.state.deadline });
    } else if (this.engine) {
      if (this.pause?.disconnectedPlayer === player) await this.resume(player);
      else {
        this.send(pair[1], "PLAYER_RECONNECTED", this.engine.snapshotFor(player));
        if (this.rematch) this.send(pair[1], player === this.rematch.requester ? "REMATCH_REQUESTED" : "REMATCH_OFFER", { match_id: this.rematch.matchId });
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
      case "READY_CONFIRM": if (engine.ready(player)) { this.broadcast("MATCH_STARTED", { football_data_version_id: data.versionId }); await this.startSelection(); } break;
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
        const clubs = [...engine.state.selections.values()] as [string, string]; const raw = String(cmd.payload.answer ?? ""); const normalized = normalizeAnswer(raw);
        const correct = normalized ? await data.validate(clubs[0], clubs[1], normalized) : false;
        const receivedAt = Date.now(); engine.submit(player, raw, receivedAt, correct ? new Set([normalized]) : new Set()); this.sendTo(player, "ANSWER_ACCEPTED", { last_second: engine.state.deadline != null && engine.state.deadline - receivedAt <= 2_500 });
        if (engine.state.submissions.size === 2) await this.startReveal(); break;
      }
      case "EMOTE_SEND": {
        if (engine.state.phase === "FINISHED" || engine.state.phase === "PAUSED") throw new Error("INVALID_PHASE");
        const now = Date.now(); if (now - (this.lastEmoteAt.get(player) ?? 0) < EMOTE_COOLDOWN_MS) throw new Error("EMOTE_COOLDOWN"); this.lastEmoteAt.set(player, now);
        const messageId = String(cmd.payload.message_id) as QuickMessageId;
        if (!quickMessageIds.has(messageId)) throw new Error("INVALID_QUICK_MESSAGE");
        const requestedStyle = String(cmd.payload.chat_style_id ?? "");
        let chatStyleId = chatStyleIds.has(requestedStyle) ? requestedStyle : this.chatStyles.get(player);
        if (!chatStyleId) { try { chatStyleId = await data.getPlayerChatStyle(player); } catch { chatStyleId = "chat-classic"; } }
        this.chatStyles.set(player, chatStyleId);
        this.broadcast("QUICK_MESSAGE", { player_id: player, message_id: messageId, chat_style_id: chatStyleId });
        break;
      }
      case "RECONNECT": {
        if (engine.state.phase === "READY_CHECK") this.sendTo(player, "READY_CHECK_STARTED", { deadline: engine.state.deadline ?? Date.now() + 10_000 });
        else this.sendTo(player, "PLAYER_RECONNECTED", engine.snapshotFor(player));
        break;
      }
      case "LEAVE_MATCH": await this.finishForfeit(player); break;
      case "REMATCH_REQUEST": {
        if (this.hasBot() || engine.state.phase !== "FINISHED") throw new Error("REMATCH_UNAVAILABLE");
        const opponent = engine.state.players.find(id => id !== player)!;
        const matchId = `${this.matchId}-rematch-${Date.now().toString(36)}`;
        this.rematch = { requester: player, matchId };
        await this.persistRematchOffer(player, opponent, matchId);
        this.sendTo(player, "REMATCH_REQUESTED", { match_id: matchId });
        this.sendTo(opponent, "REMATCH_OFFER", { match_id: matchId });
        break;
      }
      case "REMATCH_ACCEPT": {
        if (!this.rematch || player === this.rematch.requester || engine.state.phase !== "FINISHED") throw new Error("REMATCH_UNAVAILABLE");
        this.broadcast("REMATCH_STARTED", { match_id: this.rematch.matchId });
        this.rematch = null;
        break;
      }
      case "REMATCH_DECLINE": {
        if (!this.rematch || player === this.rematch.requester) throw new Error("REMATCH_UNAVAILABLE");
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
        this.broadcast("ANSWER_PHASE_STARTED", { deadline: this.engine.state.deadline }); await this.ctx.storage.setAlarm(this.engine.state.deadline!);
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
    if (!this.hasBot()) await this.data!.persistRound({ roomKey: this.matchId, ordinal: this.persistedRounds, suddenDeath, clubs, winnerId: result.roundWinnerId, submissions: [...engine.state.submissions.values()].map(item => ({ player_id: item.playerId, raw_answer: item.raw, normalized_answer: item.normalized, is_correct: item.correct, received_at_ms: item.receivedAt, sequence: item.sequence })), scores: engine.state.scores });
    this.broadcast("REVEAL_STARTED", { submissions: [...this.engine!.state.submissions.values()].map(({ playerId, raw, correct }) => ({ player_id: playerId, answer: raw, correct })), round_winner_id: result.roundWinnerId, scores: this.engine!.state.scores });
    this.broadcast("SCORE_UPDATED", { scores: this.engine!.state.scores });
    if (result.finished) { if (!this.hasBot()) await this.data!.persistFinish(this.matchId, this.engine!.state.winnerId!, this.engine!.state.scores); this.broadcast("MATCH_FINISHED", { winner_id: this.engine!.state.winnerId }); } else { this.engine!.state.deadline = Date.now() + this.data!.rules.revealMs; await this.ctx.storage.setAlarm(this.engine!.state.deadline); }
  }
  private async persistRematchOffer(requester: string, recipient: string, nextMatchKey: string): Promise<void> {
    const response = await fetch(`${this.env.SUPABASE_URL}/rest/v1/rematch_offers`, { method: "POST", headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ room_key: this.matchId, requester_id: requester, recipient_id: recipient, next_match_key: nextMatchKey }) });
    if (!response.ok) throw new Error("REMATCH_PERSIST_FAILED");
  }

  private async resume(_player: string): Promise<void> { const pause = this.pause!; this.pause = null; this.engine!.state.phase = pause.phase; this.engine!.state.deadline = Date.now() + pause.remainingMs; for (const player of this.engine!.state.players) this.sendTo(player, "PLAYER_RECONNECTED", this.engine!.snapshotFor(player)); if (pause.remainingMs > 0) await this.ctx.storage.setAlarm(this.engine!.state.deadline); else await this.alarm(); }
  private async finishForfeit(leaver: string): Promise<void> { const winner = this.engine!.state.players.find(p => p !== leaver)!; this.pause = null; this.engine!.state.winnerId = winner; this.engine!.state.phase = "FINISHED"; this.engine!.state.deadline = null; if (!this.hasBot()) await this.data!.persistFinish(this.matchId, winner, this.engine!.state.scores); this.broadcast("MATCH_FINISHED", { winner_id: winner, forfeit: true }); }
  private async ensureLoaded(): Promise<void> { if (this.engine && this.data) return; const stored=await this.ctx.storage.get<StoredRoom>("room"); if(stored){this.matchId=stored.matchId;this.engine=MatchEngine.restore(stored.engine);this.pause=stored.pause;this.persistedRounds=stored.persistedRounds??0;this.rematch=stored.rematch??null;} if(!this.data&&this.env.SUPABASE_URL&&this.env.SUPABASE_SERVICE_ROLE_KEY)this.data=await createMatchData(this.env,stored?.dataVersionId); for(const ws of this.ctx.getWebSockets()){const attachment=ws.deserializeAttachment() as {player?:string}|null;if(attachment?.player)this.sockets.set(ws,attachment.player);} }
  private async persist():Promise<void>{if(!this.engine||!this.data)return;await this.ctx.storage.put("room",{matchId:this.matchId,engine:this.engine.serialize(),pause:this.pause,dataVersionId:this.data.versionId,persistedRounds:this.persistedRounds,rematch:this.rematch} satisfies StoredRoom);}
  private envelope(type: ServerEventType, payload: Record<string, unknown>): ServerMessage { return { protocol_version: 1, match_id: this.matchId, event_id: crypto.randomUUID(), server_timestamp: new Date().toISOString(), event_type: type, payload }; }
  private send(ws: WebSocket, type: ServerEventType, payload: Record<string, unknown>): void { ws.send(JSON.stringify(this.envelope(type, payload))); }
  private broadcast(type: ServerEventType, payload: Record<string, unknown>): void { for (const ws of this.sockets.keys()) this.send(ws, type, payload); }
  private sendTo(player: string, type: ServerEventType, payload: Record<string, unknown>): void { for (const [ws, id] of this.sockets) if (id === player) this.send(ws, type, payload); }
}

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (url.pathname === "/match-token" && request.method === "POST") {
    try {
      const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!bearer || !env.MATCH_TOKEN_SECRET) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders });
      const playerId = await verifySupabaseAccessToken(bearer, env);
      const body = await request.json<{ match_id?: string; mode?: string }>();
      const matchId = body.match_id?.trim();
      if (!matchId || matchId.length > 100) return Response.json({ error: "INVALID_MATCH_ID" }, { status: 400, headers: corsHeaders });
      const token = await createMatchTicket({ playerId, matchId, mode: body.mode === "bot" || body.mode === "quick" ? body.mode : undefined }, env.MATCH_TOKEN_SECRET);
      return Response.json({ token, expires_in: 60 }, { headers: corsHeaders });
    } catch { return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders }); }
  }
  if (url.pathname === "/quick-match" && request.method === "POST") {
    try {
      const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!bearer) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders });
      const playerId = await verifySupabaseAccessToken(bearer, env);
      const body = await request.json<{ action?: "join" | "cancel" }>();
      const queue = env.MATCH_QUEUE.get(env.MATCH_QUEUE.idFromName("global"));
      const response = await queue.fetch(new Request("https://queue/", { method: "POST", body: JSON.stringify({ action: body.action === "cancel" ? "cancel" : "join", playerId }), headers: { "Content-Type": "application/json" } }));
      return new Response(response.body, { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch { return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: corsHeaders }); }
  }
  if (!url.pathname.startsWith("/match/")) return new Response("football-link match server");
  const id = env.MATCH_ROOM.idFromName(url.pathname.split("/").pop()!); return env.MATCH_ROOM.get(id).fetch(request);
} };
