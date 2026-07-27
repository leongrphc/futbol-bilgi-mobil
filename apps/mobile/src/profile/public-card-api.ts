import { supabase } from "@/auth/supabase";
import type { ShowcaseAchievement } from "@/achievements/api";
import type { FriendshipState } from "@/friends/social-actions";

export interface PublicPlayerCard {
  playerId: string;
  displayName: string;
  playerCode: string;
  avatarUrl: string | null;
  trophies: number;
  blitzTrophies: number;
  rankedTrophies: number;
  form: Array<"W" | "L">;
  friendshipState: FriendshipState;
  achievements: ShowcaseAchievement[];
  h2h: { wins: number; losses: number } | null;
}

const emptyCard: PublicPlayerCard = {
  playerId: "",
  displayName: "",
  playerCode: "",
  avatarUrl: null,
  trophies: 0,
  blitzTrophies: 0,
  rankedTrophies: 0,
  form: [],
  friendshipState: "NONE",
  achievements: [],
  h2h: null,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function friendshipState(value: unknown): FriendshipState {
  return value === "PENDING_INCOMING" || value === "PENDING_OUTGOING" || value === "ACCEPTED" || value === "SELF" ? value : "NONE";
}

function parseAchievements(value: unknown): ShowcaseAchievement[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const row = record(item);
    return {
      code: text(row.code),
      title_tr: text(row.title_tr),
      title_en: text(row.title_en),
      reward_title_tr: text(row.reward_title_tr),
      reward_title_en: text(row.reward_title_en),
      glyph: text(row.glyph),
      accent: text(row.accent) || "#59D5A6",
      slot: number(row.slot),
    };
  }).filter(item => item.code).sort((a, b) => a.slot - b.slot);
}

export async function loadPublicPlayerCard(playerId: string): Promise<{ card: PublicPlayerCard; error?: string }> {
  const { data, error } = await supabase.rpc("player_public_card", { p_player_id: playerId });
  if (error) return { card: emptyCard, error: error.message };
  const row = record(data);
  return {
    card: {
      playerId: text(row.player_id),
      displayName: text(row.display_name),
      playerCode: text(row.player_code),
      avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
      trophies: number(row.trophies),
      blitzTrophies: number(row.blitz_trophies),
      rankedTrophies: number(row.ranked_trophies),
      form: Array.isArray(row.form) ? row.form.filter((item): item is "W" | "L" => item === "W" || item === "L") : [],
      friendshipState: friendshipState(row.friendship_state),
      achievements: parseAchievements(row.achievements),
      h2h: row.h2h && typeof row.h2h === "object"
        ? { wins: number(record(row.h2h).wins), losses: number(record(row.h2h).losses) }
        : null,
    },
  };
}
