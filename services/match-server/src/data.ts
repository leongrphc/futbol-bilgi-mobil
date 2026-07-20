import type { Club } from "@football-link/shared";
import type { EngineRules } from "@football-link/game-engine";

export interface MatchRules extends EngineRules { teamPoolSize: number; selectionMs: number; answerMs: number; revealMs: number; reconnectMs: number; suddenDeathMinAnswers: number }
const defaultRules: MatchRules = { teamPoolSize: 6, selectionMs: 20_000, answerMs: 15_000, revealMs: 4_000, reconnectMs: 60_000, suddenDeathMinAnswers: 1, winningScore: 3, maximumRounds: 9 };
/** Blitz: short timers, first to 2, separate trophy ladder on finish. */
export const blitzRules: Partial<MatchRules> = { selectionMs: 12_000, answerMs: 8_000, revealMs: 3_000, winningScore: 2, maximumRounds: 5, teamPoolSize: 6 };
/** Ranked keeps the classic match length but gives typed answers five extra seconds. */
export const rankedRules: Partial<MatchRules> = { selectionMs: 25_000, answerMs: 20_000, winningScore: 3, maximumRounds: 9, teamPoolSize: 6 };
export function applyMatchModeRules(base: MatchRules, mode?: string): MatchRules {
  if (mode === "blitz") return { ...base, ...blitzRules };
  if (mode === "ranked") return { ...base, ...rankedRules };
  return base;
}

export type PersistMatchMode = "FRIEND" | "QUICK" | "BLITZ" | "RANKED" | "EVENT";

export interface EventScope {
  id: string;
  league: string;
  title_tr?: string;
  title_en?: string;
  accent?: string;
}

export interface MatchData {
  versionId: string;
  rules: MatchRules;
  clubs: Club[];
  leagueFilter: string | null;
  event: EventScope | null;
  hasPair(a: string, b: string): Promise<boolean>;
  validate(a: string, b: string, normalized: string): Promise<boolean>;
  trainingChoices(a: string, b: string, count?: number): Promise<string[]>;
  competitiveChoices(a: string, b: string, count?: number): Promise<string[]>;
  pickPair(excluded: string[], minimumAnswers: number): Promise<{ clubs: [Club, Club] } | null>;
  getPlayerChatStyle(playerId: string): Promise<string>;
  playerOwnsEmote(playerId: string, emoteId: string): Promise<boolean>;
  persistStart(roomKey: string, players: [string, string], mode: PersistMatchMode): Promise<string>;
  persistRound(input: PersistedRound): Promise<string>;
  persistFinish(roomKey: string, winnerId: string, scores: Record<string, number>): Promise<string>;
}

export interface PersistedRound { roomKey: string; ordinal: number; suddenDeath: boolean; clubs: [string, string]; winnerId: string | null; submissions: { player_id: string; raw_answer: string; normalized_answer: string; is_correct: boolean; last_second: boolean; received_at_ms: number; sequence: number }[]; scores: Record<string, number> }

interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }

async function rpc<T>(env: Env, name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`DATA_RPC_${name.toUpperCase()}:${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadLiveEventScope(env: Env): Promise<EventScope | null> {
  try {
    const value = await rpc<unknown>(env, "event_live_scope", {});
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.league !== "string" || !row.league.trim()) return null;
    const scope: EventScope = { id: row.id, league: row.league };
    if (typeof row.title_tr === "string") scope.title_tr = row.title_tr;
    if (typeof row.title_en === "string") scope.title_en = row.title_en;
    if (typeof row.accent === "string") scope.accent = row.accent;
    return scope;
  } catch {
    return null;
  }
}

export async function createMatchData(env: Env, options?: { requestedVersion?: string; leagueFilter?: string | null; event?: EventScope | null }): Promise<MatchData> {
  const settingsResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/game_settings?select=key,value`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  const settingsJson = settingsResponse.ok ? await settingsResponse.json() : [];
  const values = Array.isArray(settingsJson) ? Object.fromEntries((settingsJson as { key: string; value: number }[]).map(item => [item.key, item.value])) : {};
  const rules: MatchRules = { teamPoolSize: values.team_pool_size ?? defaultRules.teamPoolSize, selectionMs: (values.selection_seconds ?? defaultRules.selectionMs / 1000) * 1000, answerMs: (values.answer_seconds ?? defaultRules.answerMs / 1000) * 1000, revealMs: (values.reveal_seconds ?? defaultRules.revealMs / 1000) * 1000, reconnectMs: (values.reconnect_seconds ?? defaultRules.reconnectMs / 1000) * 1000, suddenDeathMinAnswers: values.sudden_death_min_answers ?? defaultRules.suddenDeathMinAnswers, winningScore: values.winning_score ?? defaultRules.winningScore, maximumRounds: values.maximum_rounds ?? defaultRules.maximumRounds };
  const leagueFilter = options?.leagueFilter?.trim() || null;
  const bootstrap = await rpc<{ football_data_version_id: string; clubs: Club[] }>(env, "get_match_bootstrap", {
    pool_size: 200,
    requested_version: options?.requestedVersion ?? null,
    league_filter: leagueFilter,
  });
  if (!bootstrap.football_data_version_id || bootstrap.clubs.length < 2) throw new Error(leagueFilter ? "EVENT_POOL_TOO_SMALL" : "NO_ACTIVE_FOOTBALL_DATA");
  return {
    versionId: bootstrap.football_data_version_id,
    rules,
    clubs: bootstrap.clubs,
    leagueFilter,
    event: options?.event ?? null,
    hasPair: (a, b) => rpc<boolean>(env, "match_pair_has_answers", { version_id: bootstrap.football_data_version_id, club_a_external: a, club_b_external: b }),
    validate: (a, b, normalized) => rpc<boolean>(env, "match_validate_answer", { version_id: bootstrap.football_data_version_id, club_a_external: a, club_b_external: b, answer_normalized: normalized }),
    trainingChoices: async (a, b, count = 3) => {
      try {
        const value = await rpc<unknown>(env, "match_training_choices", {
          version_id: bootstrap.football_data_version_id,
          club_a_external: a,
          club_b_external: b,
          choice_count: count,
        });
        if (!Array.isArray(value)) return [];
        return value.map(String).filter(Boolean);
      } catch {
        return [];
      }
    },
    competitiveChoices: async (a, b, count = 4) => {
      try {
        const value = await rpc<unknown>(env, "match_competitive_choices", {
          version_id: bootstrap.football_data_version_id,
          club_a_external: a,
          club_b_external: b,
          choice_count: count,
        });
        if (!Array.isArray(value)) return [];
        return value.map(String).filter(Boolean);
      } catch {
        return [];
      }
    },
    pickPair: async (excluded, minimumAnswers) => {
      const value = await rpc<{ club_a_id: string; club_a_name: string; club_b_id: string; club_b_name: string } | null>(env, "match_pick_pair", {
        version_id: bootstrap.football_data_version_id,
        excluded_pairs: excluded,
        minimum_answers: minimumAnswers,
        league_filter: leagueFilter,
      });
      return value ? { clubs: [{ id: value.club_a_id, name: value.club_a_name }, { id: value.club_b_id, name: value.club_b_name }] } : null;
    },
    getPlayerChatStyle: playerId => rpc<string>(env, "get_player_chat_style", { p_player_id: playerId }),
    playerOwnsEmote: async (playerId, emoteId) => {
      try {
        return Boolean(await rpc<boolean>(env, "player_owns_emote", { p_player_id: playerId, p_emote_id: emoteId }));
      } catch {
        return false;
      }
    },
    persistStart: (roomKey, players, mode) => rpc<string>(env, "match_persist_start", { p_room_key: roomKey, p_version_id: bootstrap.football_data_version_id, p_player_one: players[0], p_player_two: players[1], p_match_mode: mode }),
    persistRound: input => rpc<string>(env, "match_persist_round", { p_room_key: input.roomKey, p_round_ordinal: input.ordinal, p_is_sudden_death: input.suddenDeath, p_club_a_external: input.clubs[0], p_club_b_external: input.clubs[1], p_round_winner: input.winnerId, p_round_submissions: input.submissions, p_scores: input.scores }),
    persistFinish: (roomKey, winnerId, scores) => rpc<string>(env, "match_persist_finish", { p_room_key: roomKey, p_match_winner: winnerId, p_final_scores: scores }),
  };
}
