export const PROTOCOL_VERSION = 1 as const;
export type { Database, Json } from "./database.types";
export type MatchPhase = "WAITING" | "READY_CHECK" | "TEAM_SELECTION" | "SELECTION_VALIDATION" | "COUNTDOWN" | "ANSWERING" | "REVEAL" | "SUDDEN_DEATH" | "FINISHED" | "PAUSED";
export type QuickMessageId = "GOOD_LUCK" | "NICE_ONE" | "SO_CLOSE" | "READY" | "REMATCH";
/** Free starter emotes (everyone) + premium shop ids (ownership required). */
export type EmoteId =
  | "emote-fire" | "emote-clap" | "emote-ball" | "emote-eyes"
  | "emote-goat" | "emote-crown" | "emote-bolt" | "emote-trophy"
  | "emote-skull" | "emote-party" | "emote-cold" | "emote-heart"
  | "emote-comet" | "emote-star" | "emote-rocket" | "emote-shield";
export const FREE_EMOTE_IDS: readonly EmoteId[] = ["emote-fire", "emote-clap", "emote-ball", "emote-eyes"] as const;
export const PREMIUM_EMOTE_IDS: readonly EmoteId[] = ["emote-goat", "emote-crown", "emote-bolt", "emote-trophy", "emote-skull", "emote-party", "emote-cold", "emote-heart", "emote-comet", "emote-star", "emote-rocket", "emote-shield"] as const;
export const ALL_EMOTE_IDS: readonly EmoteId[] = [...FREE_EMOTE_IDS, ...PREMIUM_EMOTE_IDS] as const;
export const EMOTE_GLYPHS: Record<EmoteId, string> = {
  "emote-fire": "🔥", "emote-clap": "👏", "emote-ball": "⚽", "emote-eyes": "👀",
  "emote-goat": "🐐", "emote-crown": "👑", "emote-bolt": "⚡", "emote-trophy": "🏆",
  "emote-skull": "💀", "emote-party": "🎉", "emote-cold": "🥶", "emote-heart": "❤️",
  "emote-comet": "☄️", "emote-star": "🌟", "emote-rocket": "🚀", "emote-shield": "🛡️",
};
export type ClientEventType = "READY_CONFIRM" | "TEAM_SELECT" | "TEAM_CONFIRM" | "ANSWER_SUBMIT" | "EMOTE_SEND" | "RECONNECT" | "LEAVE_MATCH" | "REMATCH_REQUEST" | "REMATCH_ACCEPT" | "REMATCH_DECLINE";
export type ServerEventType = "READY_CHECK_STARTED" | "MATCH_STARTED" | "TEAM_POOL_CREATED" | "TEAM_SELECTION_STARTED" | "TEAM_SELECTION_LOCKED" | "TEAM_SELECTION_INVALID" | "TEAMS_REVEALED" | "COUNTDOWN_STARTED" | "ANSWER_PHASE_STARTED" | "ANSWER_ACCEPTED" | "QUICK_MESSAGE" | "REVEAL_STARTED" | "SCORE_UPDATED" | "NEXT_ROUND" | "SUDDEN_DEATH_STARTED" | "MATCH_FINISHED" | "MATCH_PAUSED" | "PLAYER_RECONNECTED" | "REMATCH_REQUESTED" | "REMATCH_OFFER" | "REMATCH_STARTED" | "REMATCH_DECLINED" | "ERROR";
export interface Club { id: string; name: string }
export interface ClientMessage { protocol_version: 1; match_id: string; event_type: ClientEventType; command_id: string; payload: Record<string, unknown> }
export interface ServerMessage<T = Record<string, unknown>> { protocol_version: 1; match_id: string; event_id: string; server_timestamp: string; event_type: ServerEventType; payload: T }
