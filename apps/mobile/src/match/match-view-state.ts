import type { Club, EmoteId, QuickMessageId, ServerMessage } from "@football-link/shared";

export const QUICK_MESSAGE_VISIBLE_MS = 1550;

export type MatchUiPhase =
  | "WAITING"
  | "READY"
  | "SELECTING"
  | "COUNTDOWN"
  | "ANSWERING"
  | "REVEAL"
  | "FINISHED"
  | "PAUSED";

export type MatchAnswerFeedback = "correct" | "wrong" | null;
export type MatchAnswerChoice = { id: string; label: string };
type ShowcaseBadge = {
  code: string;
  title_tr: string;
  title_en: string;
  glyph: string;
  accent: string;
};

export type MatchPlayerCard = {
  player_id: string;
  display_name: string;
  player_code: string;
  trophies: number;
  form: string[];
  achievements: ShowcaseBadge[];
  h2hWins: number | null;
};

type QuickMessageState = {
  eventId: string;
  playerId: string;
  kind: "TEXT" | "EMOJI";
  messageId?: QuickMessageId;
  emoteId?: EmoteId;
  styleId: string;
};

export type MatchViewState = {
  phase: MatchUiPhase;
  pool: Club[];
  searchableClubs: Club[];
  deadline: number | null;
  reveal: Record<string, unknown> | undefined;
  result: Record<string, unknown> | undefined;
  round: number;
  locked: boolean;
  teams: string[];
  selectionCycle: number;
  scores: Record<string, number>;
  error: string | undefined;
  errorCode: string | undefined;
  selectionNotice: string | undefined;
  selectionReason: string | undefined;
  selectionNoticeId: string | undefined;
  rematchOfferId: string | undefined;
  rematchPending: boolean;
  lastSecond: boolean;
  answerFeedback: MatchAnswerFeedback;
  suddenDeath: boolean;
  suddenDeathPulse: number;
  playerCards: MatchPlayerCard[];
  answerChoices: MatchAnswerChoice[];
  choiceMode: boolean;
  matchMode: string;
  winningScore: number;
  quickMessage: QuickMessageState | undefined;
};

export type MatchViewCopy = {
  badgeFallbackAccent: string;
  errorForCode: (code: unknown) => string;
  selectionErrorForReason: (reason: unknown) => string;
};

export type MatchViewAction =
  | { type: "events"; events: readonly ServerMessage[]; copy: MatchViewCopy }
  | { type: "relocalize"; copy: MatchViewCopy }
  | { type: "dismissQuickMessage"; eventId: string }
  | { type: "reset" };

export function createInitialMatchViewState(): MatchViewState {
  return {
    phase: "WAITING",
    pool: [],
    searchableClubs: [],
    deadline: null,
    reveal: undefined,
    result: undefined,
    round: 0,
    locked: false,
    teams: [],
    selectionCycle: 0,
    scores: {},
    error: undefined,
    errorCode: undefined,
    selectionNotice: undefined,
    selectionReason: undefined,
    selectionNoticeId: undefined,
    rematchOfferId: undefined,
    rematchPending: false,
    lastSecond: false,
    answerFeedback: null,
    suddenDeath: false,
    suddenDeathPulse: 0,
    playerCards: [],
    answerChoices: [],
    choiceMode: false,
    matchMode: "FRIEND",
    winningScore: 3,
    quickMessage: undefined,
  };
}

function parsePlayerCards(value: unknown, fallbackAccent: string): MatchPlayerCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.player_id !== "string") return [];
    const achievements = Array.isArray(row.achievements)
      ? row.achievements.flatMap(value => {
          if (!value || typeof value !== "object") return [];
          const badge = value as Record<string, unknown>;
          if (typeof badge.code !== "string") return [];
          return [{
            code: badge.code,
            title_tr: typeof badge.title_tr === "string" ? badge.title_tr : badge.code,
            title_en: typeof badge.title_en === "string" ? badge.title_en : badge.code,
            glyph: typeof badge.glyph === "string" ? badge.glyph : "•",
            accent: typeof badge.accent === "string" ? badge.accent : fallbackAccent,
          }];
        })
      : [];
    return [{
      player_id: row.player_id,
      display_name: typeof row.display_name === "string" ? row.display_name : "Player",
      player_code: typeof row.player_code === "string" ? row.player_code : "",
      trophies: Number(row.trophies ?? 0),
      form: Array.isArray(row.form) ? row.form.map(String) : [],
      achievements,
      h2hWins: typeof row.h2h_wins === "number" && Number.isFinite(row.h2h_wins) ? row.h2h_wins : null,
    }];
  });
}

function parseAnswerChoices(value: unknown): MatchAnswerChoice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: `legacy-${index}`, label: item }];
    }
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.label === "string" && row.label.trim()
      ? [{ id: row.id, label: row.label }]
      : [];
  });
}

function reconnectState(
  state: MatchViewState,
  payload: Record<string, unknown>,
  copy: MatchViewCopy,
): MatchViewState {
  const phases: Record<string, MatchUiPhase> = {
    READY_CHECK: "READY",
    TEAM_SELECTION: "SELECTING",
    SELECTION_VALIDATION: "SELECTING",
    COUNTDOWN: "COUNTDOWN",
    ANSWERING: "ANSWERING",
    REVEAL: "REVEAL",
    SUDDEN_DEATH: "COUNTDOWN",
    FINISHED: "FINISHED",
    PAUSED: "PAUSED",
  };
  const reveal = payload.reveal && typeof payload.reveal === "object" && !Array.isArray(payload.reveal)
    ? payload.reveal as Record<string, unknown>
    : undefined;
  const phase = reveal
    ? "REVEAL"
    : phases[String(payload.phase)] ?? state.phase;
  const selections = (payload.selections ?? {}) as Record<string, unknown>;
  const teams = phase === "SELECTING"
    ? []
    : Object.values(selections).filter((value): value is string => typeof value === "string");
  const winnerId = typeof payload.winnerId === "string" ? payload.winnerId : null;
  const playerCards = parsePlayerCards(payload.player_cards, copy.badgeFallbackAccent);
  const rules = payload.rules && typeof payload.rules === "object" && !Array.isArray(payload.rules)
    ? payload.rules as Record<string, unknown>
    : {};
  const result = payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)
    ? payload.result as Record<string, unknown>
    : undefined;
  return {
    ...state,
    phase,
    pool: Array.isArray(payload.pool) ? payload.pool as Club[] : state.pool,
    searchableClubs: Array.isArray(payload.searchable_clubs)
      ? payload.searchable_clubs as Club[]
      : state.searchableClubs,
    teams,
    scores: (payload.scores ?? state.scores) as Record<string, number>,
    round: Number(payload.normalRound ?? state.round),
    deadline: payload.deadline == null ? null : Number(payload.deadline),
    locked: Boolean(payload.confirmed),
    suddenDeath: payload.suddenDeath === true || state.suddenDeath,
    reveal: phase === "REVEAL" ? reveal ?? state.reveal : undefined,
    result: phase === "FINISHED" ? result ?? { winner_id: winnerId } : undefined,
    playerCards: playerCards.length ? playerCards : state.playerCards,
    matchMode: typeof payload.match_mode === "string" ? payload.match_mode : state.matchMode,
    winningScore: Number(rules.winning_score ?? state.winningScore) || state.winningScore,
    error: undefined,
    errorCode: undefined,
  };
}

export function reduceMatchViewEvent(
  state: MatchViewState,
  event: ServerMessage,
  copy: MatchViewCopy,
): MatchViewState {
  const payload = event.payload;
  switch (event.event_type) {
    case "READY_CHECK_STARTED": {
      const rules = (payload.rules ?? {}) as Record<string, unknown>;
      const playerCards = parsePlayerCards(payload.player_cards, copy.badgeFallbackAccent);
      return {
        ...state,
        phase: "READY",
        deadline: Number(payload.deadline),
        playerCards: playerCards.length ? playerCards : state.playerCards,
        matchMode: typeof payload.match_mode === "string" ? payload.match_mode : state.matchMode,
        winningScore: Number(rules.winning_score ?? state.winningScore) || state.winningScore,
      };
    }
    case "MATCH_STARTED": {
      const playerCards = parsePlayerCards(payload.player_cards, copy.badgeFallbackAccent);
      return {
        ...state,
        playerCards: playerCards.length ? playerCards : state.playerCards,
        matchMode: typeof payload.match_mode === "string" ? payload.match_mode : state.matchMode,
      };
    }
    case "TEAM_POOL_CREATED":
      return {
        ...state,
        pool: (payload.clubs ?? []) as Club[],
        searchableClubs: (payload.searchable_clubs ?? payload.clubs ?? []) as Club[],
      };
    case "TEAM_SELECTION_STARTED":
      return {
        ...state,
        phase: "SELECTING",
        deadline: Number(payload.deadline),
        locked: false,
        lastSecond: false,
        answerFeedback: null,
        reveal: undefined,
        teams: [],
        selectionCycle: state.selectionCycle + 1,
        error: undefined,
        errorCode: undefined,
        answerChoices: [],
        choiceMode: false,
      };
    case "TEAM_SELECTION_LOCKED":
      return { ...state, locked: true };
    case "TEAM_SELECTION_INVALID": {
      const selectionReason = String(payload.reason ?? "UNKNOWN");
      return {
        ...state,
        selectionNotice: copy.selectionErrorForReason(selectionReason),
        selectionReason,
        selectionNoticeId: event.event_id,
      };
    }
    case "TEAMS_REVEALED":
      return {
        ...state,
        teams: payload.club_ids as string[],
        selectionNotice: undefined,
        selectionReason: undefined,
        selectionNoticeId: undefined,
      };
    case "SUDDEN_DEATH_STARTED": {
      const clubs = Array.isArray(payload.clubs) ? payload.clubs as Club[] : [];
      const clubIds = clubs.map(club => club.id).filter(Boolean);
      return {
        ...state,
        suddenDeath: true,
        suddenDeathPulse: state.suddenDeathPulse + 1,
        teams: clubIds.length === 2 ? clubIds : state.teams,
        searchableClubs: clubs.length
          ? [
              ...state.searchableClubs.filter(existing => !clubs.some(club => club.id === existing.id)),
              ...clubs,
            ]
          : state.searchableClubs,
        reveal: undefined,
        answerFeedback: null,
        lastSecond: false,
      };
    }
    case "COUNTDOWN_STARTED":
      return { ...state, phase: "COUNTDOWN", deadline: Number(payload.deadline) };
    case "ANSWER_PHASE_STARTED": {
      const choices = parseAnswerChoices(payload.choices);
      return {
        ...state,
        phase: "ANSWERING",
        deadline: Number(payload.deadline),
        locked: false,
        answerFeedback: null,
        lastSecond: false,
        answerChoices: choices,
        choiceMode: payload.input_mode === "CHOICE" && choices.length >= 2,
      };
    }
    case "ANSWER_ACCEPTED":
      return {
        ...state,
        locked: true,
        lastSecond: payload.last_second === true,
        answerFeedback: payload.correct === true
          ? "correct"
          : payload.correct === false
            ? "wrong"
            : null,
      };
    case "QUICK_MESSAGE": {
      if (typeof payload.player_id !== "string") return state;
      const styleId = typeof payload.chat_style_id === "string"
        ? payload.chat_style_id
        : "chat-classic";
      if (payload.kind === "EMOJI" || typeof payload.emote_id === "string") {
        if (typeof payload.emote_id !== "string") return state;
        return {
          ...state,
          quickMessage: {
            eventId: event.event_id,
            playerId: payload.player_id,
            kind: "EMOJI",
            emoteId: payload.emote_id as EmoteId,
            styleId,
          },
        };
      }
      if (typeof payload.message_id !== "string") return state;
      return {
        ...state,
        quickMessage: {
          eventId: event.event_id,
          playerId: payload.player_id,
          kind: "TEXT",
          messageId: payload.message_id as QuickMessageId,
          styleId,
        },
      };
    }
    case "REVEAL_STARTED":
      return {
        ...state,
        phase: "REVEAL",
        deadline: payload.reveal_deadline == null ? null : Number(payload.reveal_deadline),
        reveal: { ...payload, sudden_death: state.suddenDeath },
        answerFeedback: null,
      };
    case "SCORE_UPDATED":
      return { ...state, scores: payload.scores as Record<string, number> };
    case "NEXT_ROUND":
      return { ...state, round: Number(payload.round ?? state.round + 1) };
    case "MATCH_PAUSED":
      return { ...state, phase: "PAUSED", deadline: Number(payload.reconnect_deadline) };
    case "PLAYER_RECONNECTED":
      return reconnectState(state, payload, copy);
    case "MATCH_FINISHED":
      return {
        ...state,
        phase: "FINISHED",
        deadline: null,
        result: { ...payload, sudden_death: state.suddenDeath },
      };
    case "REMATCH_REQUESTED":
      return { ...state, rematchPending: true };
    case "REMATCH_OFFER":
      return {
        ...state,
        rematchOfferId: typeof payload.match_id === "string" ? payload.match_id : "pending",
      };
    case "REMATCH_DECLINED":
      return { ...state, rematchPending: false };
    case "ERROR": {
      const errorCode = String(payload.code ?? "UNKNOWN");
      return {
        ...state,
        error: copy.errorForCode(errorCode),
        errorCode,
      };
    }
    default:
      return state;
  }
}

export function reduceMatchViewEvents(
  state: MatchViewState,
  events: readonly ServerMessage[],
  copy: MatchViewCopy,
): MatchViewState {
  return events.reduce(
    (nextState, event) => reduceMatchViewEvent(nextState, event, copy),
    state,
  );
}

export function matchViewReducer(
  state: MatchViewState,
  action: MatchViewAction,
): MatchViewState {
  switch (action.type) {
    case "events":
      return reduceMatchViewEvents(state, action.events, action.copy);
    case "relocalize":
      return {
        ...state,
        error: state.errorCode === undefined
          ? state.error
          : action.copy.errorForCode(state.errorCode),
        selectionNotice: state.selectionReason === undefined
          ? state.selectionNotice
          : action.copy.selectionErrorForReason(state.selectionReason),
      };
    case "dismissQuickMessage":
      return state.quickMessage?.eventId === action.eventId
        ? { ...state, quickMessage: undefined }
        : state;
    case "reset":
      return createInitialMatchViewState();
  }
}

export function appendRecentMatchEvent(
  events: readonly ServerMessage[],
  event: ServerMessage,
  limit = 50,
): ServerMessage[] {
  const normalizedLimit = Math.max(0, Math.floor(limit));
  if (normalizedLimit === 0) return [];
  const retainedCount = normalizedLimit - 1;
  const retainedStart = Math.max(0, events.length - retainedCount);
  return [...events.slice(retainedStart), event];
}

export function parseExpectedMatchServerMessage(
  raw: unknown,
  expectedMatchId: string,
): ServerMessage | undefined {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const message = value as Record<string, unknown>;
    if (
      message.protocol_version !== 1
      || message.match_id !== expectedMatchId
      || typeof message.event_id !== "string"
      || typeof message.server_timestamp !== "string"
      || typeof message.event_type !== "string"
      || !message.payload
      || typeof message.payload !== "object"
      || Array.isArray(message.payload)
    ) {
      return undefined;
    }
    return message as unknown as ServerMessage;
  } catch {
    return undefined;
  }
}
