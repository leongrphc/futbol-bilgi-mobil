import { supabase } from "@/auth/supabase";

export async function markTutorialComplete(): Promise<void> {
  const { error } = await supabase.rpc("complete_tutorial");
  if (error) throw error;
}
