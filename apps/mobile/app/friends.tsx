import { useCallback, useState, type ReactNode } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/auth/supabase";
import { useAuth } from "@/auth/auth-context";
import { tr } from "@/i18n";
import { colors } from "@/theme/colors";
import { BottomNav } from "@/navigation/bottom-nav";

type Friend = { friend_id: string; display_name: string; player_code: string; trophies: number; status: "PENDING" | "ACCEPTED"; direction: "INCOMING" | "OUTGOING"; created_at: string };
type Recent = { player_id: string; display_name: string; player_code: string; last_played_at: string };

function friendError(error: unknown) {
  const value = [String((error as { code?: string })?.code ?? ""), String((error as { message?: string })?.message ?? ""), String((error as { details?: string })?.details ?? "")].join(" ");
  const code = Object.keys(tr.friends.errors).find(key => value.includes(key)) as keyof typeof tr.friends.errors | undefined;
  return code ? tr.friends.errors[code] : tr.friends.errors.fallback;
}

export default function Friends() {
  const { profile } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    const [list, states, opponents] = await Promise.all([supabase.rpc("social_list_friends"), supabase.rpc("social_friend_presence"), supabase.rpc("social_recent_opponents")]);
    if (list.error) setLoadError(friendError(list.error)); else { setFriends((list.data ?? []) as Friend[]); setLoadError(""); }
    if (!states.error) setPresence(Object.fromEntries((states.data ?? []).map(item => [item.player_id, item.state])));
    if (!opponents.error) setRecent((opponents.data ?? []) as Recent[]);
  }, []);
  useFocusEffect(useCallback(() => { void load(); const timer = setInterval(() => { void load(); }, 5_000); return () => clearInterval(timer); }, [load]));
  const add = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    const normalized = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (normalized.length !== 6) { setBusy(false); Alert.alert(tr.friends.errors.INVALID_PLAYER_CODE); return; }
    const { data, error } = await supabase.rpc("social_request_friend", { p_player_code: normalized });
    setBusy(false);
    if (error) { Alert.alert(friendError(error)); return; }
    setCode("");
    Alert.alert(data === "ACCEPTED" || data === "ALREADY_FRIENDS" ? tr.friends.accepted : tr.friends.sent);
    await load();
  };
  const respond = async (requesterId: string, accept: boolean) => {
    const { error } = await supabase.rpc("social_respond_friend", { p_requester_id: requesterId, p_accept: accept });
    if (error) { Alert.alert(friendError(error)); return; }
    await load();
  };
  const invite = async (friend: Friend) => {
    const room = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    Alert.alert(tr.friends.inviteTitle, tr.friends.inviteCopy(friend.display_name), [
      { text: tr.report.cancel, style: "cancel" },
      { text: tr.friends.invite, onPress: () => { void supabase.rpc("social_invite_friend", { p_friend_id: friend.friend_id, p_room_key: room.toLowerCase() }).then(({ error }) => { if (error) Alert.alert(friendError(error)); else if (profile) { Alert.alert(tr.social.inviteSent); router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: room.toLowerCase() } }); } }); } },
    ]);
  };
  const manageAction = async (rpc: "social_remove_friend" | "social_block_player", friendId: string) => { const argument = rpc === "social_remove_friend" ? { p_friend_id: friendId } : { p_player_id: friendId }; const { error } = await supabase.rpc(rpc, argument); if (error) Alert.alert(friendError(error)); else await load(); };
  const manage = (friend: Friend) => Alert.alert(tr.social.manage, friend.display_name, [{ text: tr.report.cancel, style: "cancel" }, { text: tr.social.remove, onPress: () => { void manageAction("social_remove_friend", friend.friend_id); } }, { text: tr.social.block, style: "destructive", onPress: () => { void manageAction("social_block_player", friend.friend_id); } }]);
  const incoming = friends.filter(friend => friend.status === "PENDING" && friend.direction === "INCOMING");
  const accepted = friends.filter(friend => friend.status === "ACCEPTED");
  const outgoing = friends.filter(friend => friend.status === "PENDING" && friend.direction === "OUTGOING");
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.top}><Pressable accessibilityRole="button" onPress={() => router.replace("/lobby")} hitSlop={12}><Text style={styles.back}>←</Text></Pressable></View>
    <Text style={styles.kicker}>{tr.friends.kicker}</Text><Text style={styles.title}>{tr.friends.title}</Text>
    {!!profile && <View style={styles.myCode}><Text style={styles.myCodeLabel}>{tr.friends.yourCode}</Text><Text selectable style={styles.myCodeValue}>#{profile.playerCode}</Text></View>}
    {!!loadError && <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.loadError}><Text style={styles.loadErrorText}>{loadError} · {tr.friends.retry}</Text></Pressable>}
    <View style={styles.addCard}><TextInput accessibilityLabel={tr.friends.addPlaceholder} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder={tr.friends.addPlaceholder} placeholderTextColor={colors.muted} returnKeyType="send" onSubmitEditing={() => { void add(); }} style={styles.input} /><Pressable accessibilityRole="button" disabled={!code.trim() || busy} onPress={() => { void add(); }} style={({ pressed }) => [styles.addButton, (!code.trim() || busy) && styles.disabled, pressed && styles.pressed]}><Text style={styles.addText}>{tr.friends.add}</Text></Pressable></View>
    {!!incoming.length && <Section title={tr.friends.pending}>{incoming.map(friend => <FriendRow key={friend.friend_id} friend={friend}><Pressable accessibilityRole="button" onPress={() => { void respond(friend.friend_id, true); }} style={styles.accept}><Text style={styles.acceptText}>{tr.friends.accept}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => { void respond(friend.friend_id, false); }} style={styles.decline}><Text style={styles.declineText}>{tr.friends.decline}</Text></Pressable></FriendRow>)}</Section>}
    <Section title={tr.lobby.friends}>{accepted.length ? accepted.map(friend => <FriendRow key={friend.friend_id} friend={friend} presence={presence[friend.friend_id]}><Pressable accessibilityRole="button" onPress={() => { void invite(friend); }} style={styles.invite}><Text style={styles.inviteText}>{tr.friends.invite}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => manage(friend)}><Text style={styles.moreText}>•••</Text></Pressable></FriendRow>) : <Text style={styles.empty}>{tr.friends.empty}</Text>}</Section>
    {!!outgoing.length && <Section title={tr.friends.outgoing}>{outgoing.map(friend => <FriendRow key={friend.friend_id} friend={friend}><Text style={styles.outgoing}>{tr.friends.outgoing}</Text></FriendRow>)}</Section>}
    {!!recent.length && <Section title={tr.social.recent}>{recent.map(item => <View key={item.player_id} style={styles.recent}><Text style={styles.name}>{item.display_name}</Text><Text style={styles.meta}>#{item.player_code}</Text></View>)}</Section>}
  </ScrollView><BottomNav /></SafeAreaView>;
}

function Section({ title, children }: { title: string; children: ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function FriendRow({ friend, presence, children }: { friend: Friend; presence?: string; children: ReactNode }) { const status = presence === "IN_MATCH" ? tr.social.inMatch : presence === "ONLINE" ? tr.social.online : tr.social.offline; return <View style={styles.friend}><View style={styles.avatar}><Text style={styles.avatarText}>{friend.display_name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.identity}><Text style={styles.name}>{friend.display_name}</Text><Text style={styles.meta}>#{friend.player_code} · {friend.trophies} {tr.common.trophies}</Text>{presence !== undefined && <Text style={[styles.presence, presence === "ONLINE" && styles.presenceOnline]}>{status}</Text>}</View><View style={styles.actions}>{children}</View></View>; }

const styles = StyleSheet.create({
  presence: { color: colors.muted, fontSize: 9, fontWeight: "800", marginTop: 3 }, presenceOnline: { color: colors.primary }, moreText: { color: colors.muted, fontWeight: "900", padding: 8 }, recent: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 11, padding: 12, borderWidth: 1, borderColor: colors.border },
  safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 22, paddingBottom: 116, gap: 20 }, top: { height: 20 }, back: { color: colors.text, fontSize: 30, lineHeight: 30 }, kicker: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.7 }, title: { color: colors.text, fontSize: 35, lineHeight: 39, fontWeight: "900", letterSpacing: -1.1 }, myCode: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.surfaceElevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border }, myCodeLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, myCodeValue: { color: colors.floodlight, fontWeight: "900", letterSpacing: 1.2 }, loadError: { backgroundColor: "#3A2025", borderRadius: 10, padding: 12 }, loadErrorText: { color: colors.danger, fontSize: 12, fontWeight: "800" }, addCard: { flexDirection: "row", gap: 8, backgroundColor: colors.surface, padding: 10, borderRadius: 15, borderWidth: 1, borderColor: colors.border }, input: { flex: 1, minWidth: 0, color: colors.text, backgroundColor: colors.background, paddingHorizontal: 12, borderRadius: 9, fontWeight: "700" }, addButton: { justifyContent: "center", paddingHorizontal: 13, borderRadius: 9, backgroundColor: colors.primary }, addText: { color: colors.background, fontWeight: "900", fontSize: 12 }, section: { gap: 8 }, sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, empty: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 13, padding: 16, lineHeight: 20 }, friend: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 13, padding: 11, borderWidth: 1, borderColor: colors.border }, avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }, avatarText: { color: colors.background, fontWeight: "900" }, identity: { flex: 1, minWidth: 0 }, name: { color: colors.text, fontWeight: "900", fontSize: 14 }, meta: { color: colors.muted, marginTop: 3, fontSize: 11 }, actions: { flexDirection: "row", gap: 6, alignItems: "center" }, accept: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }, acceptText: { color: colors.background, fontWeight: "900", fontSize: 11 }, decline: { paddingHorizontal: 8, paddingVertical: 8 }, declineText: { color: colors.muted, fontWeight: "800", fontSize: 11 }, invite: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.accent }, inviteText: { color: colors.accent, fontWeight: "900", fontSize: 10 }, outgoing: { color: colors.muted, fontWeight: "800", fontSize: 11 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
});
