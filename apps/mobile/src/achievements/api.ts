import { supabase } from "@/auth/supabase";

export interface ShowcaseAchievement {
  code: string;
  title_tr: string;
  title_en: string;
  reward_title_tr: string;
  reward_title_en: string;
  glyph: string;
  accent: string;
  slot: number;
}

export interface Achievement extends Omit<ShowcaseAchievement, "slot"> {
  description_tr: string;
  description_en: string;
  target: number;
  progress: number;
  unlocked_at: string | null;
  showcase_slot: number | null;
}

export interface AchievementsState {
  unlockedCount: number;
  totalCount: number;
  showcase: ShowcaseAchievement[];
  achievements: Achievement[];
}

const emptyState: AchievementsState = { unlockedCount: 0, totalCount: 0, showcase: [], achievements: [] };

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

function parseShowcase(value: unknown): ShowcaseAchievement[] {
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

function parseAchievements(value: unknown): Achievement[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const row = record(item);
    return {
      code: text(row.code),
      title_tr: text(row.title_tr),
      title_en: text(row.title_en),
      description_tr: text(row.description_tr),
      description_en: text(row.description_en),
      reward_title_tr: text(row.reward_title_tr),
      reward_title_en: text(row.reward_title_en),
      glyph: text(row.glyph),
      accent: text(row.accent) || "#59D5A6",
      target: Math.max(1, number(row.target)),
      progress: Math.max(0, number(row.progress)),
      unlocked_at: typeof row.unlocked_at === "string" ? row.unlocked_at : null,
      showcase_slot: row.showcase_slot == null ? null : number(row.showcase_slot),
    };
  }).filter(item => item.code);
}

export async function loadAchievements(): Promise<{ state: AchievementsState; error?: string }> {
  const { data, error } = await supabase.rpc("achievements_mine");
  if (error) return { state: emptyState, error: error.message };
  const row = record(data);
  return {
    state: {
      unlockedCount: number(row.unlocked_count),
      totalCount: number(row.total_count),
      showcase: parseShowcase(row.showcase),
      achievements: parseAchievements(row.achievements),
    },
  };
}

export async function saveShowcase(codes: string[]): Promise<{ showcase: ShowcaseAchievement[]; error?: string }> {
  const { data, error } = await supabase.rpc("achievements_set_showcase", { p_codes: codes });
  if (error) return { showcase: [], error: error.message };
  return { showcase: parseShowcase(data) };
}
