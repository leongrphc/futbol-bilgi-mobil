import { supabase } from "@/auth/supabase";

export type EquippedCosmetic = { itemId: string; name: string; accent: string };
export type CosmeticLoadout = { pitch: EquippedCosmetic; badge: EquippedCosmetic };

export const defaultLoadout: CosmeticLoadout = {
  pitch: { itemId: "pitch-classic", name: "Klasik Çim", accent: "#59D5A6" },
  badge: { itemId: "badge-link", name: "Bağlantı Rozeti", accent: "#8CA6FF" },
};

type CosmeticRow = { item_id: string; name: string; kind: "PITCH_THEME" | "BADGE" | "CHAT_STYLE"; accent: string; equipped: boolean };

export async function getCosmeticLoadout(): Promise<CosmeticLoadout> {
  const { data, error } = await supabase.rpc("cosmetics_mine");
  if (error) return defaultLoadout;
  const rows = (data ?? []) as CosmeticRow[];
  const pitch = rows.find(item => item.kind === "PITCH_THEME" && item.equipped);
  const badge = rows.find(item => item.kind === "BADGE" && item.equipped);
  return {
    pitch: pitch ? { itemId: pitch.item_id, name: pitch.name, accent: pitch.accent } : defaultLoadout.pitch,
    badge: badge ? { itemId: badge.item_id, name: badge.name, accent: badge.accent } : defaultLoadout.badge,
  };
}

export const pitchThemes: Record<string, { background: string; surface: string; line: string; accent: string; haze: string }> = {
  "pitch-classic": { background: "#07121C", surface: "#102A2A", line: "#3E7D68", accent: "#59D5A6", haze: "rgba(89,213,166,.09)" },
  "pitch-copper": { background: "#1B1110", surface: "#2D1D19", line: "#98613E", accent: "#F4C95D", haze: "rgba(244,201,93,.10)" },
};

export const badgeGlyph = (itemId: string) => ({
  "badge-link": "∞",
  "badge-bronze-season": "III",
  "badge-silver-season": "II",
  "badge-gold-season": "I",
  "badge-elite-season": "◆",
}[itemId] ?? "◆");
