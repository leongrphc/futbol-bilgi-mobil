import { FREE_EMOTE_IDS, EMOTE_GLYPHS, type EmoteId } from "@football-link/shared";
import { supabase } from "@/auth/supabase";

export type OwnedEmote = { item_id: EmoteId; name: string; glyph: string; is_premium: boolean };

export async function loadOwnedEmotes(): Promise<OwnedEmote[]> {
  const { data, error } = await supabase.rpc("emotes_mine");
  if (error) throw error;
  const rows = (data ?? []) as { item_id: string; name: string; glyph: string; is_premium: boolean }[];
  return rows
    .filter(row => row.item_id in EMOTE_GLYPHS)
    .map(row => ({
      item_id: row.item_id as EmoteId,
      name: row.name,
      glyph: row.glyph || EMOTE_GLYPHS[row.item_id as EmoteId],
      is_premium: Boolean(row.is_premium),
    }));
}

/** Offline/fail-soft: only free starters. */
export function freeEmotesFallback(): OwnedEmote[] {
  return FREE_EMOTE_IDS.map(id => ({
    item_id: id,
    name: id,
    glyph: EMOTE_GLYPHS[id],
    is_premium: false,
  }));
}
