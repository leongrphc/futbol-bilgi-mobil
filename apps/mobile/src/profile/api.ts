import { supabase } from "@/auth/supabase";
import type { ShowcaseAchievement } from "@/achievements/api";

export type CompetitiveMode = "QUICK" | "BLITZ" | "RANKED" | "EVENT";

export interface PlayerProfileStats {
  profile: {
    playerId: string;
    displayName: string;
    playerCode: string;
    avatarUrl: string | null;
    createdAt: string;
    trophies: number;
    blitzTrophies: number;
    rankedTrophies: number;
  };
  career: {
    played: number;
    wins: number;
    losses: number;
    winRate: number;
    currentWinStreak: number;
    bestWinStreak: number;
    favoriteMode: CompetitiveMode | null;
    roundsPlayed: number;
    roundsWon: number;
    roundWinRate: number;
    answerAttempts: number;
    correctAnswers: number;
    wrongAnswers: number;
    answerAccuracy: number;
  };
  records: {
    cleanSheetWins: number;
    closeWins: number;
    lastSecondCorrect: number;
  };
  collections: {
    albumCards: number;
    clubsMastered: number;
    bestClub: { externalId: string; name: string; correct: number; attempts: number; accuracy: number } | null;
  };
  modes: Array<{ mode: CompetitiveMode; played: number; wins: number; losses: number; winRate: number; trophies: number }>;
  form: Array<{ matchId: string; mode: CompetitiveMode; outcome: "WIN" | "LOSS"; scoreFor: number; scoreAgainst: number; finishedAt: string }>;
  achievements: { unlocked: number; total: number; showcase: ShowcaseAchievement[] };
}

const emptyStats: PlayerProfileStats = {
  profile: { playerId: "", displayName: "", playerCode: "", avatarUrl: null, createdAt: "", trophies: 0, blitzTrophies: 0, rankedTrophies: 0 },
  career: { played: 0, wins: 0, losses: 0, winRate: 0, currentWinStreak: 0, bestWinStreak: 0, favoriteMode: null, roundsPlayed: 0, roundsWon: 0, roundWinRate: 0, answerAttempts: 0, correctAnswers: 0, wrongAnswers: 0, answerAccuracy: 0 },
  records: { cleanSheetWins: 0, closeWins: 0, lastSecondCorrect: 0 },
  collections: { albumCards: 0, clubsMastered: 0, bestClub: null },
  modes: [],
  form: [],
  achievements: { unlocked: 0, total: 0, showcase: [] },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mode(value: unknown): CompetitiveMode | null {
  return value === "QUICK" || value === "BLITZ" || value === "RANKED" || value === "EVENT" ? value : null;
}

function parseShowcase(value: unknown): ShowcaseAchievement[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const row = record(item);
    return {
      code: string(row.code),
      title_tr: string(row.title_tr),
      title_en: string(row.title_en),
      reward_title_tr: string(row.reward_title_tr),
      reward_title_en: string(row.reward_title_en),
      glyph: string(row.glyph),
      accent: string(row.accent) || "#59D5A6",
      slot: number(row.slot),
    };
  }).filter(item => item.code).sort((a, b) => a.slot - b.slot);
}

function parseStats(value: unknown): PlayerProfileStats {
  const root = record(value);
  const profile = record(root.profile);
  const career = record(root.career);
  const records = record(root.records);
  const collections = record(root.collections);
  const bestClub = record(collections.best_club);
  const achievements = record(root.achievements);

  const modes = Array.isArray(root.modes) ? root.modes.flatMap(item => {
    const row = record(item);
    const parsedMode = mode(row.mode);
    return parsedMode ? [{
      mode: parsedMode,
      played: number(row.played),
      wins: number(row.wins),
      losses: number(row.losses),
      winRate: number(row.win_rate),
      trophies: number(row.trophies),
    }] : [];
  }) : [];

  const form = Array.isArray(root.form) ? root.form.flatMap(item => {
    const row = record(item);
    const parsedMode = mode(row.mode);
    const outcome: "WIN" | "LOSS" | null = row.outcome === "WIN" ? "WIN" : row.outcome === "LOSS" ? "LOSS" : null;
    if (!parsedMode || !outcome) return [];
    return [{
      matchId: string(row.match_id),
      mode: parsedMode,
      outcome,
      scoreFor: number(row.score_for),
      scoreAgainst: number(row.score_against),
      finishedAt: string(row.finished_at),
    }];
  }) : [];

  return {
    profile: {
      playerId: string(profile.player_id),
      displayName: string(profile.display_name),
      playerCode: string(profile.player_code),
      avatarUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
      createdAt: string(profile.created_at),
      trophies: number(profile.trophies),
      blitzTrophies: number(profile.blitz_trophies),
      rankedTrophies: number(profile.ranked_trophies),
    },
    career: {
      played: number(career.played),
      wins: number(career.wins),
      losses: number(career.losses),
      winRate: number(career.win_rate),
      currentWinStreak: number(career.current_win_streak),
      bestWinStreak: number(career.best_win_streak),
      favoriteMode: mode(career.favorite_mode),
      roundsPlayed: number(career.rounds_played),
      roundsWon: number(career.rounds_won),
      roundWinRate: number(career.round_win_rate),
      answerAttempts: number(career.answer_attempts),
      correctAnswers: number(career.correct_answers),
      wrongAnswers: number(career.wrong_answers),
      answerAccuracy: number(career.answer_accuracy),
    },
    records: {
      cleanSheetWins: number(records.clean_sheet_wins),
      closeWins: number(records.close_wins),
      lastSecondCorrect: number(records.last_second_correct),
    },
    collections: {
      albumCards: number(collections.album_cards),
      clubsMastered: number(collections.clubs_mastered),
      bestClub: string(bestClub.name) ? {
        externalId: string(bestClub.external_id),
        name: string(bestClub.name),
        correct: number(bestClub.correct),
        attempts: number(bestClub.attempts),
        accuracy: number(bestClub.accuracy),
      } : null,
    },
    modes,
    form,
    achievements: {
      unlocked: number(achievements.unlocked),
      total: number(achievements.total),
      showcase: parseShowcase(achievements.showcase),
    },
  };
}

export async function loadPlayerProfileStats(): Promise<{ stats: PlayerProfileStats; error?: string }> {
  const { data, error } = await supabase.rpc("player_profile_stats");
  if (error) return { stats: emptyStats, error: error.message };
  return { stats: parseStats(data) };
}
