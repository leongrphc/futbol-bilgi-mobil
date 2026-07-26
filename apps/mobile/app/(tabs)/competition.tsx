import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { createFriendRoomKey, friendErrorMessage, type FriendshipState } from "@/friends/social-actions";

type LadderTab = "quick" | "blitz" | "ranked";
type QuickRow = { rank: number; display_name: string; player_code: string; trophies: number; is_me?: boolean };
type BlitzRow = { rank: number; display_name: string; player_code: string; blitz_trophies: number; is_me?: boolean };
type RankedRow = { rank: number; display_name: string; player_code: string; ranked_trophies: number; is_me?: boolean };
type History = {
  match_id: string;
  mode: string;
  opponent_id: string;
  opponent_name: string;
  opponent_code: string;
  score_for: number;
  score_against: number;
  outcome: "WIN" | "LOSS";
  trophy_delta: number | null;
  friend_state: FriendshipState;
  finished_at: string;
};

export default function Competition() {
  useLanguage();
  const { profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState<LadderTab>("quick");
  const [quickTable, setQuickTable] = useState<QuickRow[]>([]);
  const [blitzTable, setBlitzTable] = useState<BlitzRow[]>([]);
  const [rankedTable, setRankedTable] = useState<RankedRow[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [historyBusy, setHistoryBusy] = useState<string>();
  const pulse = useRef(new Animated.Value(.86)).current;

  const load = useCallback(async () => {
    await refreshProfile();
    const [quick, blitz, ranked, matches] = await Promise.all([
      supabase.rpc("competition_quick_nearby"),
      supabase.rpc("competition_blitz_nearby"),
      supabase.rpc("competition_ranked_nearby"),
      supabase.rpc("competition_my_history"),
    ]);
    if (!quick.error) setQuickTable((quick.data ?? []) as QuickRow[]);
    if (!blitz.error) setBlitzTable((blitz.data ?? []) as BlitzRow[]);
    if (!ranked.error) setRankedTable((ranked.data ?? []) as RankedRow[]);
    if (!matches.error) setHistory(((matches.data ?? []) as History[]).slice(0, 10));
  }, [refreshProfile]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    pulse.setValue(0.9);
    Animated.spring(pulse, { toValue: 1, tension: 130, friction: 7, useNativeDriver: true }).start();
  }, [pulse, tab, profile?.trophies, profile?.blitzTrophies, profile?.rankedTrophies]);

  const modeLabel = (mode: string) => {
    if (mode === "QUICK") return tr.quick.action;
    if (mode === "BLITZ") return tr.blitz.badge;
    if (mode === "RANKED") return tr.ranked.action;
    if (mode === "EVENT") return tr.event.badge;
    return tr.ranked.unranked;
  };
  const historyActionLabel = (state: FriendshipState) => {
    if (state === "ACCEPTED") return tr.friends.invite;
    if (state === "PENDING_INCOMING") return tr.friends.accept;
    if (state === "PENDING_OUTGOING") return tr.friends.outgoing;
    return tr.friends.add;
  };
  const updateHistoryFriendState = (opponentId: string, friendState: FriendshipState) => {
    setHistory(current => current.map(item => item.opponent_id === opponentId ? { ...item, friend_state: friendState } : item));
  };
  const requestFriend = async (item: History) => {
    setHistoryBusy(item.opponent_id);
    const { data, error } = await supabase.rpc("social_request_friend", { p_player_code: item.opponent_code });
    setHistoryBusy(undefined);
    if (error) { Alert.alert(friendErrorMessage(error)); return; }
    const accepted = data === "ACCEPTED" || data === "ALREADY_FRIENDS";
    updateHistoryFriendState(item.opponent_id, accepted ? "ACCEPTED" : "PENDING_OUTGOING");
    Alert.alert(accepted ? tr.friends.accepted : tr.friends.sent);
  };
  const invite = (item: History) => {
    const room = createFriendRoomKey();
    Alert.alert(tr.friends.inviteTitle, tr.friends.inviteCopy(item.opponent_name), [
      { text: tr.report.cancel, style: "cancel" },
      {
        text: tr.friends.invite,
        onPress: () => {
          setHistoryBusy(item.opponent_id);
          void supabase.rpc("social_invite_friend", { p_friend_id: item.opponent_id, p_room_key: room }).then(({ error }) => {
            setHistoryBusy(undefined);
            if (error) { Alert.alert(friendErrorMessage(error)); return; }
            if (!profile) return;
            Alert.alert(tr.social.inviteSent);
            router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: room } });
          });
        },
      },
    ]);
  };
  const runHistoryAction = (item: History) => {
    if (item.friend_state === "ACCEPTED") invite(item);
    else if (item.friend_state !== "PENDING_OUTGOING") void requestFriend(item);
  };
  const openOpponent = (item: History) => {
    router.push({ pathname: "/player-card", params: { playerId: item.opponent_id } } as never);
  };
  const formatFinishedAt = (value: string) => new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(new Date(value));
  const formatDelta = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";

  const quick = tab === "quick";
  const blitz = tab === "blitz";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.kicker}>{tr.competition.kicker}</Text>
        <Text style={styles.title}>{tr.competition.title}</Text>

        <View style={styles.tabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: quick }}
            onPress={() => setTab("quick")}
            style={[styles.tab, quick && styles.tabQuickActive]}
          >
            <Text style={[styles.tabText, quick && styles.tabTextQuickActive]}>{tr.competition.quickLadder}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: blitz }}
            onPress={() => setTab("blitz")}
            style={[styles.tab, blitz && styles.tabBlitzActive]}
          >
            <Text style={[styles.tabText, blitz && styles.tabTextBlitzActive]}>{tr.competition.blitzLadder}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "ranked" }}
            onPress={() => setTab("ranked")}
            style={[styles.tab, tab === "ranked" && styles.tabRankedActive]}
          >
            <Text style={[styles.tabText, tab === "ranked" && styles.tabTextRankedActive]}>{tr.competition.rankedLadder}</Text>
          </Pressable>
        </View>

        {quick ? (
          <>
            <Animated.View style={[styles.quickHero, { transform: [{ scale: pulse }] }]}>
              <Text style={styles.trophyValue}>{profile?.trophies ?? 0}</Text>
              <Text style={styles.trophyLabel}>{tr.common.quickTrophies.toUpperCase()}</Text>
              <Text style={styles.trophyNote}>{tr.competition.quickOnly}</Text>
            </Animated.View>
            <Section title={tr.competition.quickLadder}>
              {quickTable.length ? quickTable.map(row => (
                <View key={row.player_code} style={[styles.rankRow, (row.is_me || row.player_code === profile?.playerCode) && styles.me]}>
                  <Text style={styles.rank}>{row.rank}</Text>
                  <View style={styles.person}><Text style={styles.name}>{row.display_name}</Text><Text style={styles.record}>#{row.player_code}</Text></View>
                  <Text style={styles.points}>{row.trophies}</Text>
                </View>
              )) : <Text style={styles.empty}>{tr.competition.quickEmpty}</Text>}
            </Section>
          </>
        ) : blitz ? (
          <>
            <Animated.View style={[styles.blitzHero, { transform: [{ scale: pulse }] }]}>
              <Text style={styles.blitzHeroValue}>{profile?.blitzTrophies ?? 0}</Text>
              <Text style={styles.blitzHeroLabel}>{tr.common.blitzTrophies.toUpperCase()}</Text>
              <Text style={styles.blitzHeroNote}>{tr.competition.blitzOnly}</Text>
            </Animated.View>
            <Section title={tr.competition.blitzLadder}>
              {blitzTable.length ? blitzTable.map(row => (
                <View key={`blitz-${row.player_code}`} style={[styles.rankRow, styles.blitzRow, (row.is_me || row.player_code === profile?.playerCode) && styles.blitzMe]}>
                  <Text style={[styles.rank, styles.blitzRank]}>{row.rank}</Text>
                  <View style={styles.person}><Text style={styles.name}>{row.display_name}</Text><Text style={styles.record}>#{row.player_code}</Text></View>
                  <Text style={[styles.points, styles.blitzPoints]}>{row.blitz_trophies}</Text>
                </View>
              )) : <Text style={styles.empty}>{tr.competition.blitzEmpty}</Text>}
            </Section>
          </>
        ) : (
          <>
            <Animated.View style={[styles.rankedHero, { transform: [{ scale: pulse }] }]}>
              <Text style={styles.rankedHeroValue}>{profile?.rankedTrophies ?? 0}</Text>
              <Text style={styles.rankedHeroLabel}>{tr.common.rankedTrophies.toUpperCase()}</Text>
              <Text style={styles.rankedHeroNote}>{tr.competition.rankedOnly}</Text>
            </Animated.View>
            <Section title={tr.competition.rankedLadder}>
              {rankedTable.length ? rankedTable.map(row => (
                <View key={`ranked-${row.player_code}`} style={[styles.rankRow, styles.rankedRow, (row.is_me || row.player_code === profile?.playerCode) && styles.rankedMe]}>
                  <Text style={[styles.rank, styles.rankedRank]}>{row.rank}</Text>
                  <View style={styles.person}><Text style={styles.name}>{row.display_name}</Text><Text style={styles.record}>#{row.player_code}</Text></View>
                  <Text style={[styles.points, styles.rankedPoints]}>{row.ranked_trophies}</Text>
                </View>
              )) : <Text style={styles.empty}>{tr.competition.rankedEmpty}</Text>}
            </Section>
          </>
        )}

        <Section title={tr.competition.history}>
          {history.length ? history.map(item => (
            <View key={item.match_id} style={[styles.history, item.outcome === "WIN" ? styles.historyWin : styles.historyLoss]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr.competition.openPlayer(item.opponent_name)}
                onPress={() => openOpponent(item)}
                style={({ pressed }) => [styles.historyMain, pressed && styles.pressed]}
              >
                <View style={styles.historyIdentity}>
                  <View style={styles.historyResultLine}>
                    <Text style={[styles.outcome, item.outcome === "WIN" ? styles.win : styles.loss]}>{item.outcome === "WIN" ? tr.competition.winLabel : tr.competition.lossLabel}</Text>
                    <Text style={styles.historyDate}>{formatFinishedAt(item.finished_at)}</Text>
                  </View>
                  <Text style={styles.opponent}>{item.opponent_name}</Text>
                  <Text style={styles.opponentCode}>#{item.opponent_code} · {modeLabel(item.mode)}</Text>
                </View>
                <View style={styles.scoreBlock}>
                  <Text style={styles.matchScore}>{item.score_for}–{item.score_against}</Text>
                  <Text style={styles.profileArrow}>›</Text>
                </View>
              </Pressable>
              <View style={styles.historyFooter}>
                <View style={styles.deltaSlot}>
                  {item.trophy_delta != null && item.mode !== "EVENT" && (
                    <View style={[styles.deltaChip, item.trophy_delta > 0 ? styles.deltaPositive : item.trophy_delta < 0 ? styles.deltaNegative : styles.deltaNeutral]}>
                      <Text style={[styles.deltaText, item.trophy_delta > 0 ? styles.deltaTextPositive : item.trophy_delta < 0 ? styles.deltaTextNegative : undefined]}>{formatDelta(item.trophy_delta)} {tr.common.trophies}</Text>
                    </View>
                  )}
                </View>
                {item.friend_state !== "SELF" && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={historyBusy === item.opponent_id || item.friend_state === "PENDING_OUTGOING"}
                    onPress={() => runHistoryAction(item)}
                    style={({ pressed }) => [styles.historyAction, item.friend_state === "ACCEPTED" && styles.historyInvite, (historyBusy === item.opponent_id || item.friend_state === "PENDING_OUTGOING") && styles.disabled, pressed && styles.pressed]}
                  >
                    <Text style={[styles.historyActionText, item.friend_state === "ACCEPTED" && styles.historyInviteText]}>{historyActionLabel(item.friend_state)}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )) : <Text style={styles.empty}>{tr.competition.noHistory}</Text>}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 18, paddingBottom: 110 },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: colors.text, fontSize: 35, lineHeight: 39, fontWeight: "900", letterSpacing: -1.1 },
  tabs: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  tabQuickActive: { backgroundColor: colors.primary },
  tabBlitzActive: { backgroundColor: "#6B4DFF" },
  tabRankedActive: { backgroundColor: "#F3C969" },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4, textAlign: "center" },
  tabTextQuickActive: { color: colors.ink },
  tabTextRankedActive: { color: colors.background },
  tabTextBlitzActive: { color: colors.floodlight },
  quickHero: { borderRadius: 16, padding: 20, backgroundColor: colors.primary },
  trophyValue: { color: colors.background, fontWeight: "900", fontSize: 48, lineHeight: 50 },
  trophyLabel: { color: colors.background, fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  trophyNote: { color: colors.background, opacity: .75, marginTop: 12, fontSize: 12 },
  blitzHero: { borderRadius: 16, padding: 18, backgroundColor: "#1A1028", borderWidth: 1, borderColor: "#6B4DFF" },
  blitzHeroValue: { color: "#B896FF", fontWeight: "900", fontSize: 40, lineHeight: 42 },
  blitzHeroLabel: { color: "#B896FF", fontWeight: "900", fontSize: 10, letterSpacing: 1.4, marginTop: 4 },
  blitzHeroNote: { color: colors.muted, marginTop: 10, fontSize: 12 },
  rankedHero: { borderRadius: 16, padding: 20, backgroundColor: "#241D16", borderWidth: 1, borderColor: "#8F7440" },
  rankedHeroValue: { color: "#F3C969", fontWeight: "900", fontSize: 48, lineHeight: 50 },
  rankedHeroLabel: { color: "#F3C969", fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  rankedHeroNote: { color: "#C8BFAE", marginTop: 12, fontSize: 12 },
  section: { gap: 7 },
  sectionTitle: { color: colors.muted, fontWeight: "900", fontSize: 10, letterSpacing: 1.3 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  blitzRow: { borderColor: "#3A2A66" },
  me: { borderColor: colors.accent },
  blitzMe: { borderColor: "#B896FF" },
  rankedRow: { borderColor: "#4B3C27" },
  rankedMe: { borderColor: "#F3C969" },
  rank: { color: colors.accent, width: 20, fontWeight: "900", textAlign: "center" },
  blitzRank: { color: "#B896FF" },
  rankedRank: { color: "#F3C969" },
  person: { flex: 1 },
  name: { color: colors.text, fontWeight: "900" },
  record: { color: colors.muted, fontSize: 11, marginTop: 2 },
  points: { color: colors.text, fontWeight: "900", fontSize: 18 },
  blitzPoints: { color: "#B896FF" },
  rankedPoints: { color: "#F3C969" },
  history: { borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  historyWin: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  historyLoss: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  historyMain: { minHeight: 82, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 13, paddingVertical: 12 },
  historyIdentity: { flex: 1, minWidth: 0 },
  historyResultLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyDate: { color: colors.muted, fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  opponentCode: { color: colors.muted, marginTop: 3, fontSize: 10, fontWeight: "700" },
  profileArrow: { color: colors.muted, fontSize: 25, lineHeight: 26, fontWeight: "500" },
  historyFooter: { minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  deltaSlot: { flex: 1, alignItems: "flex-start" },
  deltaChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.surfaceElevated },
  deltaPositive: { backgroundColor: "rgba(89,213,166,.12)" },
  deltaNegative: { backgroundColor: "rgba(255,113,108,.12)" },
  deltaNeutral: { backgroundColor: colors.surfaceElevated },
  deltaText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  deltaTextPositive: { color: colors.primary },
  deltaTextNegative: { color: colors.danger },
  historyAction: { minHeight: 32, justifyContent: "center", borderRadius: 9, paddingHorizontal: 11, backgroundColor: colors.primary },
  historyActionText: { color: colors.background, fontSize: 10, fontWeight: "900" },
  historyInvite: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.accent },
  historyInviteText: { color: colors.accent },
  outcome: { fontSize: 10, fontWeight: "900", letterSpacing: .7 },
  win: { color: colors.primary },
  loss: { color: colors.danger },
  opponent: { color: colors.text, fontWeight: "800", marginTop: 4 },
  scoreBlock: { alignItems: "flex-end" },
  matchScore: { color: colors.text, fontSize: 20, fontWeight: "900" },
  mode: { color: colors.muted, fontSize: 10, marginTop: 3 },
  empty: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 12, padding: 15 },
  disabled: { opacity: .42 },
  pressed: { opacity: .8, transform: [{ scale: .99 }] },
});
