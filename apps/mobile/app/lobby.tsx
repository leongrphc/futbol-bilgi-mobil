import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { useAuth } from "@/auth/auth-context";
import { tr } from "@/i18n";
import { supabase } from "@/auth/supabase";
import { BottomNav } from "@/navigation/bottom-nav";

export default function Lobby() {
  const { room: invitedRoom } = useLocalSearchParams<{ room?: string }>();
  const { profile, loading, signOut } = useAuth();
  const playerId = profile?.id ?? "";
  useEffect(() => { if (!loading && !profile) router.replace(invitedRoom ? { pathname: "/", params: { room: invitedRoom } } : "/"); }, [invitedRoom, loading, profile]);
  const [room, setRoom] = useState(invitedRoom?.trim() || "");
  const [roomCreated, setRoomCreated] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const quickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { if (invitedRoom?.trim()) setRoom(invitedRoom.trim()); }, [invitedRoom]);
  const openAccountMenu = () => Alert.alert(profile?.displayName ?? tr.nav.account, profile ? `#${profile.playerCode}` : undefined, [
    { text: tr.report.cancel, style: "cancel" },
    { text: tr.lobby.signOut, style: "destructive", onPress: () => { void signOut().then(() => router.replace("/")); } },
  ]);
  const startBotMatch = () => { if (playerId) router.replace({ pathname: "/match", params: { playerId, matchId: `bot-${playerId}-${Date.now()}`, mode: "bot" } }); };
  const joinRoom = () => { if (playerId && room.trim()) router.replace({ pathname: "/match", params: { playerId, matchId: room.trim() } }); };
  const createRoom = () => { const id = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; setRoom(id.toLowerCase()); setRoomCreated(true); };
  const shareInvite = async () => { if (!room.trim()) return; const url = Linking.createURL("lobby", { queryParams: { room: room.trim() } }); await Share.share({ title: tr.lobby.inviteTitle, message: tr.lobby.inviteMessage(url), url }); };
  const quickMatch = async () => {
    if (!playerId || quickBusy) return;
    setQuickBusy(true);
    const session = await supabase.auth.getSession(); const token = session.data.session?.access_token;
    const base = (process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const poll = async () => {
      if (!token) { setQuickBusy(false); return; }
      try {
        const response = await fetch(`${base}/quick-match`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "join" }) });
        const result = await response.json() as { status?: string; match_id?: string };
        if (result.status === "MATCHED" && result.match_id) { setQuickBusy(false); router.replace({ pathname: "/match", params: { playerId, matchId: result.match_id, mode: "quick" } }); return; }
      } catch { /* next poll keeps the queue interaction resilient to transient network errors */ }
      quickTimer.current = setTimeout(() => { void poll(); }, 2_000);
    };
    await poll();
  };
  const cancelQuickMatch = async () => { if (quickTimer.current) clearTimeout(quickTimer.current); setQuickBusy(false); const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) return; const base = (process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787").replace(/^wss:/, "https:").replace(/^ws:/, "http:"); void fetch(`${base}/quick-match`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }); };
  useEffect(() => () => { if (quickTimer.current) clearTimeout(quickTimer.current); }, []);

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View pointerEvents="none" style={styles.stadiumGlow}><View style={styles.glowRing} /><View style={styles.glowRingInner} /></View>
      <View style={styles.topbar}><View accessibilityLabel="Football Link" style={styles.brandBadge}><Text style={styles.brandMark}>FL</Text></View><Pressable accessibilityRole="button" accessibilityLabel={tr.nav.account} onPress={openAccountMenu} style={({ pressed }) => [styles.playerChip, pressed && styles.pressed]}><View style={styles.online} /><Text style={styles.player}>{profile ? `${profile.displayName} · #${profile.playerCode}` : tr.lobby.noSession}</Text><Text style={styles.menuDots}>•••</Text></Pressable></View>
      <View style={styles.heading}><Text style={styles.kicker}>{tr.lobby.kicker}</Text><Text style={styles.title}>{tr.lobby.title}</Text><View style={styles.headingRule}><View style={styles.headingSpot} /></View></View>
      <Pressable accessibilityRole="button" onPress={() => { void (quickBusy ? cancelQuickMatch() : quickMatch()); }} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
        <View style={styles.signalStrip} /><View style={styles.quickContent}><Text style={styles.quickKicker}>LIVE MATCHMAKING</Text><Text style={styles.quickTitle}>{quickBusy ? tr.quick.waiting : tr.quick.action}</Text><Text style={styles.quickCopy}>{quickBusy ? tr.quick.cancel : tr.quick.copy}</Text></View><View style={styles.quickAction}>{quickBusy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.quickArrow}>→</Text>}</View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tr.lobby.botA11y} onPress={startBotMatch} style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
        <View pointerEvents="none" style={styles.pitch}><View style={styles.pitchCircle} /><View style={styles.pitchHalf} /></View>
        <View style={styles.heroTop}><View style={styles.trainingMark}><View style={styles.trainingDot} /><Text style={styles.trainingLabel}>TRAINING GROUND</Text></View><View style={styles.testBadge}><Text style={styles.testBadgeText}>{tr.lobby.recommended}</Text></View></View>
        <Text style={styles.heroTitle}>{tr.lobby.botTitle}</Text><Text style={styles.heroCopy}>{tr.lobby.botCopy}</Text>
        <View style={styles.heroAction}><Text style={styles.heroActionText}>{tr.lobby.botAction}</Text><Text style={styles.heroArrow}>→</Text></View>
      </Pressable>
      <View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>{tr.lobby.friendRoom}</Text><View style={styles.rule} /></View>
      <View style={styles.roomCard}>
        <Text style={styles.roomTitle}>{tr.lobby.roomTitle}</Text><Text style={styles.roomCopy}>{tr.lobby.roomCopy}</Text>
        <TextInput accessibilityLabel={tr.lobby.roomCode} value={room} onChangeText={setRoom} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={joinRoom} placeholder="dev-room" placeholderTextColor={colors.muted} style={styles.input} />
        {roomCreated && <Text style={styles.roomNotice}>{tr.lobby.roomCreated}</Text>}
        <View style={styles.roomActions}><Pressable accessibilityRole="button" onPress={createRoom} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}><Text style={styles.outlineText}>{tr.lobby.createRoom}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: !room.trim() }} disabled={!room.trim()} onPress={() => { void shareInvite(); }} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed, !room.trim() && styles.disabled]}><Text style={styles.outlineText}>{tr.lobby.shareInvite}</Text></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !room.trim() }} disabled={!room.trim()} onPress={joinRoom} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, !room.trim() && styles.disabled]}><Text style={styles.secondaryText}>{tr.lobby.join}</Text></Pressable>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    <BottomNav />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 }, page: { padding: 22, gap: 22, paddingBottom: 116, overflow: "hidden" }, stadiumGlow: { position: "absolute", width: 310, height: 310, borderRadius: 155, top: -190, right: -110, backgroundColor: "rgba(255,243,207,0.035)", alignItems: "center", justifyContent: "center" }, glowRing: { position: "absolute", width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: "rgba(255,243,207,0.07)" }, glowRingInner: { width: 145, height: 145, borderRadius: 73, borderWidth: 1, borderColor: "rgba(255,243,207,0.08)" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, brandBadge: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.pitchLine, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, brandMark: { color: colors.floodlight, fontSize: 11, fontWeight: "900", letterSpacing: 1 }, playerChip: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "rgba(16,34,46,0.88)", borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }, online: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, player: { color: colors.muted, fontWeight: "700", fontSize: 12 }, menuDots: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  heading: { marginTop: 7 }, kicker: { color: colors.primary, fontWeight: "900", fontSize: 10, letterSpacing: 2.2 }, title: { color: colors.text, fontSize: 40, lineHeight: 43, fontWeight: "900", letterSpacing: -1.5, marginTop: 10, maxWidth: 320 }, headingRule: { height: 1, backgroundColor: colors.border, marginTop: 18, justifyContent: "center" }, headingSpot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal, marginLeft: 26 },
  quickCard: { backgroundColor: colors.floodlight, borderRadius: 16, minHeight: 104, flexDirection: "row", alignItems: "stretch", overflow: "hidden", shadowColor: "#000", shadowOpacity: .22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 }, signalStrip: { width: 8, backgroundColor: colors.signal }, quickContent: { flex: 1, paddingHorizontal: 17, paddingVertical: 15, justifyContent: "center" }, quickKicker: { color: colors.signal, fontSize: 8, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6 }, quickTitle: { color: colors.ink, fontWeight: "900", fontSize: 20, letterSpacing: -.3 }, quickCopy: { color: colors.ink, opacity: 0.62, fontSize: 12, marginTop: 4 }, quickAction: { width: 54, borderLeftWidth: 1, borderLeftColor: "rgba(8,23,32,.14)", alignItems: "center", justifyContent: "center" }, quickArrow: { color: colors.ink, fontSize: 26 },
  hero: { backgroundColor: colors.primary, borderRadius: 20, padding: 20, minHeight: 272, justifyContent: "space-between", overflow: "hidden" }, pitch: { position: "absolute", width: 238, height: 238, borderRadius: 119, right: -74, bottom: -72, borderWidth: 1, borderColor: "rgba(8,23,32,.14)", alignItems: "center", justifyContent: "center" }, pitchCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderColor: "rgba(8,23,32,.14)" }, pitchHalf: { position: "absolute", width: 1, height: 238, backgroundColor: "rgba(8,23,32,.14)" }, heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, trainingMark: { flexDirection: "row", alignItems: "center", gap: 7 }, trainingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink }, trainingLabel: { color: colors.ink, opacity: .6, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, testBadge: { backgroundColor: colors.ink, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }, testBadgeText: { color: colors.primary, fontSize: 9, letterSpacing: 0.7, fontWeight: "900" },
  heroTitle: { color: colors.ink, fontSize: 32, fontWeight: "900", letterSpacing: -1, marginTop: 32 }, heroCopy: { color: colors.ink, opacity: 0.64, fontSize: 15, lineHeight: 22, maxWidth: 260 }, heroAction: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(8,23,32,0.2)", paddingTop: 16, marginTop: 22 }, heroActionText: { color: colors.ink, fontWeight: "900", fontSize: 15 }, heroArrow: { color: colors.ink, fontSize: 25 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 }, rule: { height: 1, backgroundColor: colors.border, flex: 1 }, or: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  roomCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border }, roomTitle: { color: colors.text, fontSize: 19, fontWeight: "900" }, roomCopy: { color: colors.muted, fontSize: 14, marginBottom: 5 }, roomNotice: { color: colors.primary, fontSize: 12, lineHeight: 17, fontWeight: "700" }, input: { color: colors.text, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, fontSize: 16 }, roomActions: { flexDirection: "row", gap: 8 }, outlineButton: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, outlineText: { color: colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" },
  secondaryButton: { minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, justifyContent: "center", alignItems: "center" }, secondaryText: { color: colors.primary, fontWeight: "900" }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.4 },
});
