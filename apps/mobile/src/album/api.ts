import { supabase } from "@/auth/supabase";

export type AlbumEntry = {
  football_player_id: string;
  game_name: string;
  external_id: string;
  first_unlocked_at: string;
  unlock_count: number;
  last_unlocked_at: string;
};

export async function loadAlbum(): Promise<{ entries: AlbumEntry[]; error?: string }> {
  const { data, error } = await supabase.rpc("album_mine");
  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []) as AlbumEntry[] };
}
