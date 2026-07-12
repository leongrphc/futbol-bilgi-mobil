import { supabase } from "@/auth/supabase";

export type QuestRow = {
  quest_id: string;
  metric: string;
  progress: number;
  target_count: number;
  completed: boolean;
  claimed: boolean;
  quest_day: string;
  reward_coins: number;
};

export async function loadQuests(): Promise<{ quests: QuestRow[]; error?: string }> {
  const { data, error } = await supabase.rpc("quests_mine");
  if (error) return { quests: [], error: error.message };
  return { quests: (data ?? []) as QuestRow[] };
}

export async function claimQuest(questId: string): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const { data, error } = await supabase.rpc("quests_claim", { p_quest_id: questId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, balance: typeof data === "number" ? data : undefined };
}
