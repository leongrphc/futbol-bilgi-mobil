export type MatchSummaryOutcome = "WIN" | "LOSS";
export type MatchSummaryRoundOutcome = "ME" | "OPPONENT" | "NONE";
export type MatchSummaryErrorCode = "NOT_FOUND" | "UNAVAILABLE";
export type MatchSummaryMode = "QUICK" | "BLITZ" | "RANKED" | "EVENT" | "FRIEND" | "DEVELOPMENT";

export interface MatchSummaryClub {
  id: string;
  name: string;
}

export interface MatchSummaryRoundPlayer {
  answered: boolean;
  correct: boolean;
  lastSecond: boolean;
}

export interface MatchSummaryRound {
  id: string;
  ordinal: number;
  suddenDeath: boolean;
  clubs: [MatchSummaryClub, MatchSummaryClub];
  outcome: MatchSummaryRoundOutcome;
  me: MatchSummaryRoundPlayer;
  opponent: MatchSummaryRoundPlayer;
  reportStatus: string | null;
}

export interface MatchSummary {
  matchId: string;
  roomKey: string | null;
  mode: MatchSummaryMode;
  finishedAt: string;
  outcome: MatchSummaryOutcome;
  scoreFor: number;
  scoreAgainst: number;
  trophyDelta: number | null;
  opponent: {
    id: string;
    name: string;
    code: string;
  };
  totalRoundCount: number;
  truncated: boolean;
  rounds: MatchSummaryRound[];
}

export class MatchSummaryError extends Error {
  readonly code: MatchSummaryErrorCode;

  constructor(code: MatchSummaryErrorCode) {
    super(code === "NOT_FOUND" ? "MATCH_SUMMARY_NOT_FOUND" : "MATCH_SUMMARY_UNAVAILABLE");
    this.name = "MatchSummaryError";
    this.code = code;
  }
}

const MAX_ROUNDS = 50;
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 120;
const MAX_CODE_LENGTH = 32;
const MAX_MODE_LENGTH = 32;
const MAX_STATUS_LENGTH = 32;
const MAX_DATE_LENGTH = 64;
const MATCH_SUMMARY_MODES = new Set<MatchSummaryMode>([
  "QUICK",
  "BLITZ",
  "RANKED",
  "EVENT",
  "FRIEND",
  "DEVELOPMENT",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function nullableText(value: unknown, maximum: number): string | null {
  const parsed = boundedText(value, maximum);
  return parsed || null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : Math.max(0, Math.trunc(parsed));
}

function rootScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rootMode(value: unknown): MatchSummaryMode | null {
  const parsed = boundedText(value, MAX_MODE_LENGTH);
  return MATCH_SUMMARY_MODES.has(parsed as MatchSummaryMode)
    ? parsed as MatchSummaryMode
    : null;
}

function timestamp(value: unknown): string | null {
  const parsed = boundedText(value, MAX_DATE_LENGTH);
  return parsed.includes("T") && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function nullableNumber(value: unknown): number | null {
  return finiteNumber(value);
}

function playerState(value: unknown): MatchSummaryRoundPlayer {
  const row = isRecord(value) ? value : {};
  const answered = row.answered === true;
  const correct = answered && row.correct === true;
  return {
    answered,
    correct,
    lastSecond: correct && (row.last_second === true || row.lastSecond === true),
  };
}

function club(value: unknown): MatchSummaryClub | null {
  if (!isRecord(value)) return null;
  const id = boundedText(value.id, MAX_ID_LENGTH);
  const name = boundedText(value.name, MAX_NAME_LENGTH);
  return id && name ? { id, name } : null;
}

function clubs(value: unknown): [MatchSummaryClub, MatchSummaryClub] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = club(value[0]);
  const second = club(value[1]);
  return first && second ? [first, second] : null;
}

function roundOutcome(value: unknown): MatchSummaryRoundOutcome {
  return value === "ME" || value === "OPPONENT" ? value : "NONE";
}

function parseRound(value: unknown): MatchSummaryRound | null {
  if (!isRecord(value)) return null;

  const id = boundedText(value.round_id ?? value.id, MAX_ID_LENGTH);
  const ordinal = nonNegativeInteger(value.round_number ?? value.ordinal);
  const parsedClubs = clubs(value.clubs);
  if (!id || ordinal < 1 || !parsedClubs) return null;

  return {
    id,
    ordinal,
    suddenDeath: value.sudden_death === true || value.suddenDeath === true,
    clubs: parsedClubs,
    outcome: roundOutcome(value.outcome),
    me: playerState(value.me),
    opponent: playerState(value.opponent),
    reportStatus: nullableText(value.report_status ?? value.reportStatus, MAX_STATUS_LENGTH),
  };
}

function parseRounds(value: unknown): { rounds: MatchSummaryRound[]; discarded: number } {
  if (!Array.isArray(value)) return { rounds: [], discarded: 0 };

  const seenIds = new Set<string>();
  const parsed: MatchSummaryRound[] = [];
  let discarded = 0;

  for (const item of value) {
    const next = parseRound(item);
    if (!next || seenIds.has(next.id)) {
      discarded += 1;
      continue;
    }
    seenIds.add(next.id);
    if (parsed.length < MAX_ROUNDS) parsed.push(next);
    else discarded += 1;
  }

  parsed.sort((left, right) => left.ordinal - right.ordinal);
  return { rounds: parsed, discarded };
}

function parseOpponent(value: unknown): MatchSummary["opponent"] | null {
  if (!isRecord(value)) return null;
  const row = value;
  const parsed = {
    id: boundedText(row.id ?? row.player_id, MAX_ID_LENGTH),
    name: boundedText(row.name ?? row.display_name, MAX_NAME_LENGTH),
    code: boundedText(row.code ?? row.player_code, MAX_CODE_LENGTH),
  };
  return parsed.id && parsed.name ? parsed : null;
}

function rootOutcome(value: unknown): MatchSummaryOutcome | null {
  return value === "WIN" || value === "LOSS" ? value : null;
}

/**
 * Converts the deliberately small RPC JSON contract into UI-safe data.
 *
 * Required root facts fail closed because silently inventing a score, opponent
 * or completion time would misrepresent a result. Older records may still omit
 * nullable metadata; malformed child rounds are skipped so one incomplete
 * historical round cannot make the whole summary unusable.
 */
export function parseMatchSummary(value: unknown): MatchSummary {
  if (!isRecord(value)) throw new MatchSummaryError("UNAVAILABLE");

  const matchId = boundedText(value.match_id ?? value.matchId, MAX_ID_LENGTH);
  const outcome = rootOutcome(value.outcome);
  const mode = rootMode(value.mode);
  const finishedAt = timestamp(value.finished_at ?? value.finishedAt);
  const scoreFor = rootScore(value.score_for ?? value.scoreFor);
  const scoreAgainst = rootScore(value.score_against ?? value.scoreAgainst);
  const opponent = parseOpponent(value.opponent);
  if (
    !matchId
    || !outcome
    || mode === null
    || finishedAt === null
    || scoreFor === null
    || scoreAgainst === null
    || !opponent
  ) {
    throw new MatchSummaryError("UNAVAILABLE");
  }

  const parsedRounds = parseRounds(value.rounds);
  const suppliedTotal = nonNegativeInteger(
    value.total_round_count ?? value.totalRoundCount,
    parsedRounds.rounds.length,
  );
  const totalRoundCount = Math.max(suppliedTotal, parsedRounds.rounds.length);
  const truncated = value.truncated === true
    || parsedRounds.discarded > 0
    || totalRoundCount > parsedRounds.rounds.length;

  return {
    matchId,
    roomKey: nullableText(value.room_key ?? value.roomKey, MAX_ID_LENGTH),
    mode,
    finishedAt,
    outcome,
    scoreFor,
    scoreAgainst,
    trophyDelta: nullableNumber(value.trophy_delta ?? value.trophyDelta),
    opponent,
    totalRoundCount,
    truncated,
    rounds: parsedRounds.rounds,
  };
}
