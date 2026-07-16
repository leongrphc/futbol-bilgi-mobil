import { supabase } from "@/auth/supabase";

export async function markTutorialComplete(playerId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ tutorial_completed_at: new Date().toISOString() })
    .eq("id", playerId)
    .is("tutorial_completed_at", null);
  if (error) throw error;
}
