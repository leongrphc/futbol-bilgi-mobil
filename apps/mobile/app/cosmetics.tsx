import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/auth/supabase";
import { BottomNav } from "@/navigation/bottom-nav";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { chatStyleItems, getChatStyle, setChatStyle, type ChatStyleId } from "@/cosmetics/chat-style";
import { badgeGlyph, pitchThemes } from "@/cosmetics/loadout";

type Kind = "PITCH_THEME" | "BADGE" | "CHAT_STYLE";
type Cosmetic = { item_id: string; name: string; kind: Kind; accent: string; equipped: boolean };
const kinds: Kind[] = ["CHAT_STYLE", "PITCH_THEME", "BADGE"];
const labelFor = (kind: Kind) => kind === "CHAT_STYLE" ? tr.common.chatStyle : kind === "PITCH_THEME" ? tr.cosmetics.pitch : tr.cosmetics.badge;

export default function Cosmetics() {
  const [items, setItems] = useState<Cosmetic[]>([]);
  const load = useCallback(async () => { const [{ data }, selected] = await Promise.all([supabase.rpc("cosmetics_mine"), getChatStyle()]); const remote = ((data ?? []) as Cosmetic[]).filter(item => item.kind !== "CHAT_STYLE"); const chat = chatStyleItems.map(item => ({ ...item, kind: "CHAT_STYLE" as const, equipped: item.item_id === selected })); setItems([...chat, ...remote]); }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const equip = async (item: Cosmetic) => { const { error } = await supabase.rpc("cosmetics_equip", { p_item_id: item.item_id }); if (error) { Alert.alert(tr.cosmetics.equipFailed); return; } if (item.kind === "CHAT_STYLE") await setChatStyle(item.item_id as ChatStyleId); await load(); };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Pressable accessibilityRole="button" onPress={() => router.replace("/lobby")}><Text style={s.back}>←</Text></Pressable>
    <Text style={s.kicker}>{tr.cosmetics.kicker}</Text><Text style={s.title}>{tr.cosmetics.title}</Text><Text style={s.note}>{tr.cosmetics.note}</Text>
    {kinds.map(kind => <View key={kind} style={s.section}><Text style={s.label}>{labelFor(kind)}</Text>{items.filter(item => item.kind === kind).map(item => <View key={item.item_id} style={[s.card, item.equipped && { borderColor: item.accent }]}>
      {kind === "CHAT_STYLE" ? <View style={[s.chatPreview, { borderColor: item.accent }]}><Text style={[s.chatPreviewText, { color: item.accent }]}>Aa</Text></View> : kind === "PITCH_THEME" ? <PitchPreview itemId={item.item_id} accent={item.accent} /> : <BadgePreview itemId={item.item_id} accent={item.accent} />}
      <View style={s.info}><Text style={s.name}>{item.name}</Text><Text style={s.sub}>{item.equipped ? tr.cosmetics.equipped : tr.cosmetics.starter}</Text></View>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: item.equipped, disabled: item.equipped }} disabled={item.equipped} onPress={() => { void equip(item); }} style={[s.button, item.equipped && s.on]}><Text style={[s.buttonText, item.equipped && s.onText]}>{item.equipped ? "✓" : tr.cosmetics.equip}</Text></Pressable>
    </View>)}</View>)}
  </ScrollView><BottomNav /></SafeAreaView>;
}

function PitchPreview({ itemId, accent }: { itemId: string; accent: string }) { const theme = pitchThemes[itemId] ?? pitchThemes["pitch-classic"]!; return <View style={[s.pitchPreview, { backgroundColor: theme.surface, borderColor: accent }]}><View style={[s.pitchHalf, { backgroundColor: theme.line }]} /><View style={[s.pitchCircle, { borderColor: theme.line }]} /></View>; }
function BadgePreview({ itemId, accent }: { itemId: string; accent: string }) { return <View style={[s.badgePreview, { borderColor: accent, backgroundColor: `${accent}20` }]}><Text style={[s.badgeGlyph, { color: accent }]}>{badgeGlyph(itemId)}</Text></View>; }

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 22, gap: 17, paddingBottom: 106 }, back: { color: colors.text, fontSize: 30 }, kicker: { color: colors.primary, fontWeight: "900", fontSize: 11, letterSpacing: 1.6 }, title: { color: colors.text, fontSize: 36, lineHeight: 39, fontWeight: "900" }, note: { color: colors.muted, lineHeight: 19 }, section: { gap: 8 }, label: { color: colors.muted, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 }, card: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: colors.surface }, chatPreview: { height: 42, width: 50, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated }, chatPreviewText: { fontWeight: "900", fontSize: 14 }, pitchPreview: { height: 42, width: 50, borderRadius: 9, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" }, pitchHalf: { position: "absolute", width: 1, height: 42 }, pitchCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 }, badgePreview: { height: 42, width: 42, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }] }, badgeGlyph: { fontSize: 10, fontWeight: "900", transform: [{ rotate: "-45deg" }] }, info: { flex: 1 }, name: { color: colors.text, fontWeight: "900" }, sub: { color: colors.muted, fontSize: 11, marginTop: 3 }, button: { minWidth: 54, alignItems: "center", paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.primary }, on: { backgroundColor: colors.surfaceElevated }, buttonText: { color: colors.background, fontSize: 11, fontWeight: "900" }, onText: { color: colors.primary, fontSize: 16 } });
