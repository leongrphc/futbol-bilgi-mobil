import { supabase } from "@/auth/supabase";
import { normalizeStreakStatus, type StreakStatus } from "@/streak/streak-model";

export async function loadStreakStatus(): Promise<{ status?: StreakStatus; error?: true }> {
  const { data, error } = await supabase.rpc("streak_status");
  if (error) return { error: true };
  return { status: normalizeStreakStatus(data) };
}

export async function claimStreak(): Promise<{ granted?: number; error?: true }> {
  const { data, error } = await supabase.rpc("streak_claim");
  if (error) return { error: true };
  const granted = (data as { granted?: number } | null)?.granted;
  return { granted: typeof granted === "number" ? granted : 0 };
}
