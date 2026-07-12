import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { BottomNav } from "@/navigation/bottom-nav";

type LadderTab = "ranked" | "blitz";
type Row = { rank: number; display_name: string; player_code: string; trophies: number; tier?: string; is_me?: boolean; wins?: number; losses?: number };
type BlitzRow = { rank: number; display_name: string; player_code: string; blitz_trophies: number; is_me?: boolean };
type History = { match_id: string; mode: string; opponent_name: string; score_for: number; score_against: number; outcome: "WIN" | "LOSS"; finished_at: string };
type Mastery = { club_external_id: string; club_name: string; correct_count: number; attempt_count: number; hit_rate: number };

export default function Competition() {
  const { profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState<LadderTab>("ranked");
  const [table, setTable] = useState<Row[]>([]);
  const [blitzTable, setBlitzTable] = useState<BlitzRow[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [mastery, setMastery] = useState<Mastery[]>([]);
  const pulse = useRef(new Animated.Value(.86)).current;

  const load = useCallback(async () => {
    await refreshProfile();
    const [standings, blitz, matches, clubs] = await Promise.all([
      supabase.rpc("competition_nearby"),
      supabase.rpc("competition_blitz_nearby"),
      supabase.rpc("competition_my_history"),
      supabase.rpc("mastery_mine", { p_limit: 8 }),
    ]);
    if (!standings.error) setTable((standings.data ?? []) as Row[]);
    if (!blitz.error) setBlitzTable((blitz.data ?? []) as BlitzRow[]);
    if (!matches.error) setHistory(((matches.data ?? []) as History[]).slice(0, 10));
    if (!clubs.error) setMastery((clubs.data ?? []) as Mastery[]);
  }, [refreshProfile]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    pulse.setValue(0.9);
    Animated.spring(pulse, { toValue: 1, tension: 130, friction: 7, useNativeDriver: true }).start();
  }, [pulse, tab, profile?.trophies, profile?.blitzTrophies]);

  const modeLabel = (mode: string) => {
    if (mode === "QUICK") return tr.quick.rankedTag;
    if (mode === "BLITZ") return tr.blitz.badge;
    return tr.ranked.unranked;
  };

  const ranked = tab === "ranked";
  const myRankedTier = table.find(row => row.is_me)?.tier ?? "BRONZE";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/lobby")} hitSlop={12}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.kicker}>{tr.competition.kicker}</Text>
        <Text style={styles.title}>{tr.competition.title}</Text>

        <View style={styles.tabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: ranked }}
            onPress={() => setTab("ranked")}
            style={[styles.tab, ranked && styles.tabRankedActive]}
          >
            <Text style={[styles.tabText, ranked && styles.tabTextRankedActive]}>{tr.competition.rankedLadder}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: !ranked }}
            onPress={() => setTab("blitz")}
            style={[styles.tab, !ranked && styles.tabBlitzActive]}
          >
            <Text style={[styles.tabText, !ranked && styles.tabTextBlitzActive]}>{tr.competition.blitzLadder}</Text>
          </Pressable>
        </View>

        {ranked ? (
          <>
            <Animated.View style={[styles.trophy, { transform: [{ scale: pulse }] }]}>
              <Text style={styles.trophyValue}>{profile?.trophies ?? 0}</Text>
              <Text style={styles.trophyLabel}>{myRankedTier} · {tr.common.trophies.toUpperCase()}</Text>
              <Text style={styles.trophyNote}>{tr.competition.quickOnly}</Text>
            </Animated.View>
            <Section title={tr.competition.table}>
              {table.length ? table.map(row => (
                <View key={row.player_code} style={[styles.rankRow, (row.is_me || row.player_code === profile?.playerCode) && styles.me]}>
                  <Text style={styles.rank}>{row.rank}</Text>
                  <View style={styles.person}><Text style={styles.name}>{row.display_name}</Text><Text style={styles.record}>{row.tier ?? "BRONZE"}</Text></View>
                  <Text style={styles.points}>{row.trophies}</Text>
                </View>
              )) : <Text style={styles.empty}>{tr.competition.tableEmpty}</Text>}
            </Section>
          </>
        ) : (
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
        )}

        <Section title={tr.competition.mastery}>
          {mastery.length ? mastery.map(item => (
            <View key={item.club_external_id} style={styles.masteryRow}>
              <View style={styles.person}>
                <Text style={styles.name}>{item.club_name}</Text>
                <Text style={styles.record}>{tr.competition.masteryHit(Number(item.hit_rate ?? 0))} · {item.correct_count}/{item.attempt_count}</Text>
              </View>
            </View>
          )) : <Text style={styles.empty}>{tr.competition.masteryEmpty}</Text>}
        </Section>

        <Section title={tr.competition.history}>
          {history.length ? history.map(item => (
            <View key={item.match_id} style={styles.history}>
              <View>
                <Text style={[styles.outcome, item.outcome === "WIN" ? styles.win : styles.loss]}>{item.outcome === "WIN" ? tr.competition.winLabel : tr.competition.lossLabel}</Text>
                <Text style={styles.opponent}>{item.opponent_name}</Text>
              </View>
              <View style={styles.scoreBlock}>
                <Text style={styles.matchScore}>{item.score_for}–{item.score_against}</Text>
                <Text style={styles.mode}>{modeLabel(item.mode)}</Text>
              </View>
            </View>
          )) : <Text style={styles.empty}>{tr.competition.noHistory}</Text>}
        </Section>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 18, paddingBottom: 110 },
  back: { color: colors.text, fontSize: 30 },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: colors.text, fontSize: 35, lineHeight: 39, fontWeight: "900", letterSpacing: -1.1 },
  tabs: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  tabRankedActive: { backgroundColor: colors.accent },
  tabBlitzActive: { backgroundColor: "#6B4DFF" },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4, textAlign: "center" },
  tabTextRankedActive: { color: colors.background },
  tabTextBlitzActive: { color: colors.floodlight },
  trophy: { borderRadius: 16, padding: 20, backgroundColor: colors.accent },
  trophyValue: { color: colors.background, fontWeight: "900", fontSize: 48, lineHeight: 50 },
  trophyLabel: { color: colors.background, fontWeight: "900", fontSize: 10, letterSpacing: 1.5 },
  trophyNote: { color: colors.background, opacity: .75, marginTop: 12, fontSize: 12 },
  blitzHero: { borderRadius: 16, padding: 18, backgroundColor: "#1A1028", borderWidth: 1, borderColor: "#6B4DFF" },
  blitzHeroValue: { color: "#B896FF", fontWeight: "900", fontSize: 40, lineHeight: 42 },
  blitzHeroLabel: { color: "#B896FF", fontWeight: "900", fontSize: 10, letterSpacing: 1.4, marginTop: 4 },
  blitzHeroNote: { color: colors.muted, marginTop: 10, fontSize: 12 },
  section: { gap: 7 },
  sectionTitle: { color: colors.muted, fontWeight: "900", fontSize: 10, letterSpacing: 1.3 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  blitzRow: { borderColor: "#3A2A66" },
  masteryRow: { padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  me: { borderColor: colors.accent },
  blitzMe: { borderColor: "#B896FF" },
  rank: { color: colors.accent, width: 20, fontWeight: "900", textAlign: "center" },
  blitzRank: { color: "#B896FF" },
  person: { flex: 1 },
  name: { color: colors.text, fontWeight: "900" },
  record: { color: colors.muted, fontSize: 11, marginTop: 2 },
  points: { color: colors.text, fontWeight: "900", fontSize: 18 },
  blitzPoints: { color: "#B896FF" },
  history: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13 },
  outcome: { fontSize: 10, fontWeight: "900", letterSpacing: .7 },
  win: { color: colors.primary },
  loss: { color: colors.danger },
  opponent: { color: colors.text, fontWeight: "800", marginTop: 4 },
  scoreBlock: { alignItems: "flex-end" },
  matchScore: { color: colors.text, fontSize: 20, fontWeight: "900" },
  mode: { color: colors.muted, fontSize: 10, marginTop: 3 },
  empty: { color: colors.muted, backgroundColor: colors.surface, borderRadius: 12, padding: 15 },
});
