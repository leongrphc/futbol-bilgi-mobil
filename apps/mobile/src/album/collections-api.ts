import { supabase } from "@/auth/supabase";

export type AlbumCollection = {
  collection_id: string;
  league: string;
  target: number;
  reward_coins: number;
  progress: number;
  claimed: boolean;
};

export async function loadAlbumCollections(): Promise<{ collections: AlbumCollection[]; error?: true }> {
  const { data, error } = await supabase.rpc("album_collections_mine");
  if (error) return { collections: [], error: true };
  return { collections: (data ?? []) as AlbumCollection[] };
}

export async function claimAlbumCollection(collectionId: string): Promise<{ granted?: number; error?: true }> {
  const { data, error } = await supabase.rpc("album_collection_claim", { p_collection_id: collectionId });
  if (error) return { error: true };
  const granted = (data as { granted?: number } | null)?.granted;
  return { granted: typeof granted === "number" ? granted : 0 };
}
