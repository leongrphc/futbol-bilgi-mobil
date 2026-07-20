import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "@/navigation/bottom-nav";
import { colors } from "@/theme/colors";
import { locale, tr } from "@/i18n";
import { useAuth } from "@/auth/auth-context";
import { loadPlayerProfileStats, type CompetitiveMode, type PlayerProfileStats } from "@/profile/api";

const modeColors: Record<CompetitiveMode, string> = {
  QUICK: colors.primary,
  BLITZ: "#B896FF",
  RANKED: "#F3C969",
  EVENT: colors.accent,
};

export default function Profile() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<PlayerProfileStats>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const result = await loadPlayerProfileStats();
    setStats(result.stats.profile.playerId ? result.stats : undefined);
    setError(result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const displayName = stats?.profile.displayName || profile?.displayName || "Football Link";
  const initials = useMemo(() => displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase(locale)).join("") || "FL", [displayName]);
  const memberSince = stats?.profile.createdAt ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { month: "long", year: "numeric" }).format(new Date(stats.profile.createdAt)) : "";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.profile.back} onPress={() => router.replace("/lobby")} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.topbarLabel}>{tr.profile.kicker}</Text>
          <View style={styles.topbarSpacer} />
        </View>

        {loading && !stats ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : error && !stats ? (
          <Pressable accessibilityRole="button" onPress={() => { void refresh(); }} style={styles.errorCard}>
            <Text style={styles.error}>{tr.profile.loadFailed}</Text>
          </Pressable>
        ) : stats ? <>
          <View style={styles.identityCard}>
            <View pointerEvents="none" style={styles.pitchMark}><View style={styles.pitchCircle} /><View style={styles.pitchLine} /></View>
            <View style={styles.identityTop}>
              <View style={styles.avatarFrame}>
                {stats.profile.avatarUrl ? <Image source={{ uri: stats.profile.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitials}>{initials}</Text>}
              </View>
              <View style={styles.identityCopy}>
                <Text numberOfLines={2} style={styles.name}>{stats.profile.displayName}</Text>
                <Text style={styles.code}>#{stats.profile.playerCode}</Text>
              </View>
              <View style={styles.winRateSeal}>
                <Text style={styles.winRateValue}>%{stats.career.winRate}</Text>
                <Text style={styles.winRateLabel}>{tr.profile.winRate}</Text>
              </View>
            </View>
            <View style={styles.identityMeta}>
              <Text style={styles.joined}>{tr.profile.joined} · {memberSince}</Text>
              {!!stats.career.favoriteMode && <Text style={[styles.favoriteMode, { color: modeColors[stats.career.favoriteMode] }]}>{modeName(stats.career.favoriteMode)}</Text>}
            </View>
          </View>

          <SectionTitle title={tr.profile.form} />
          <View style={styles.formCard}>
            {stats.form.length ? <View style={styles.formStrip}>{stats.form.map(item => {
              const won = item.outcome === "WIN";
              return <View key={item.matchId} style={styles.formItem}>
                <View style={[styles.formResult, won ? styles.formWin : styles.formLoss]}><Text style={[styles.formLetter, won ? styles.formWinText : styles.formLossText]}>{won ? (locale === "tr" ? "G" : "W") : (locale === "tr" ? "M" : "L")}</Text></View>
                <Text style={[styles.formMode, { color: modeColors[item.mode] }]}>{modeShort(item.mode)}</Text>
              </View>;
            })}</View> : <Text style={styles.empty}>{tr.profile.noForm}</Text>}
          </View>

          <SectionTitle title={tr.profile.career} />
          <View style={styles.statGrid}>
            <Stat value={stats.career.played} label={tr.profile.played} />
            <Stat value={stats.career.wins} label={tr.profile.wins} tone={colors.primary} />
            <Stat value={stats.career.losses} label={tr.profile.losses} tone={colors.danger} />
            <Stat value={`%${stats.career.answerAccuracy}`} label={tr.profile.answerAccuracy} tone={colors.accent} />
            <Stat value={stats.career.correctAnswers} label={tr.profile.correctAnswers} />
            <Stat value={`%${stats.career.roundWinRate}`} label={tr.profile.roundWinRate} />
          </View>

          <SectionTitle title={tr.profile.streaks} />
          <View style={styles.streakCard}>
            <View style={styles.streakItem}><Text style={styles.streakGlyph}>↗</Text><View><Text style={styles.streakValue}>{stats.career.currentWinStreak}</Text><Text style={styles.streakLabel}>{tr.profile.currentStreak}</Text></View></View>
            <View style={styles.verticalRule} />
            <View style={styles.streakItem}><Text style={styles.streakGlyph}>★</Text><View><Text style={styles.streakValue}>{stats.career.bestWinStreak}</Text><Text style={styles.streakLabel}>{tr.profile.bestStreak}</Text></View></View>
          </View>

          <SectionTitle title={tr.profile.modes} />
          <View style={styles.modeList}>{stats.modes.map(item => (
            <View key={item.mode} style={[styles.modeCard, { borderLeftColor: modeColors[item.mode] }]}>
              <View style={styles.modeHeading}><Text style={styles.modeName}>{modeName(item.mode)}</Text><Text style={[styles.modeRate, { color: modeColors[item.mode] }]}>%{item.winRate}</Text></View>
              <Text style={styles.modeRecord}>{item.wins}{locale === "tr" ? "G" : "W"} · {item.losses}{locale === "tr" ? "M" : "L"} · {item.played} {tr.profile.played.toLocaleLowerCase(locale)}</Text>
              {item.mode !== "EVENT" && <Text style={styles.modeTrophies}>{item.trophies} {tr.profile.trophies}</Text>}
            </View>
          ))}</View>

          <SectionTitle title={tr.profile.records} />
          <View style={styles.recordRow}>
            <Record value={stats.records.cleanSheetWins} label={tr.profile.cleanSheetWins} glyph="○" />
            <Record value={stats.records.closeWins} label={tr.profile.closeWins} glyph="+1" />
            <Record value={stats.records.lastSecondCorrect} label={tr.profile.lastSecondCorrect} glyph="⌁" />
          </View>

          <SectionTitle title={tr.profile.collection} />
          <View style={styles.collectionCard}>
            <View style={styles.collectionCounts}>
              <View><Text style={styles.collectionValue}>{stats.collections.albumCards}</Text><Text style={styles.collectionLabel}>{tr.profile.albumCards}</Text></View>
              <View><Text style={styles.collectionValue}>{stats.collections.clubsMastered}</Text><Text style={styles.collectionLabel}>{tr.profile.clubsMastered}</Text></View>
            </View>
            <View style={styles.collectionRule} />
            <Text style={styles.bestClubLabel}>{tr.profile.bestClub}</Text>
            {stats.collections.bestClub ? <View style={styles.bestClubRow}><View style={styles.clubMark}><Text style={styles.clubMarkText}>FC</Text></View><View style={styles.bestClubCopy}><Text style={styles.bestClubName}>{stats.collections.bestClub.name}</Text><Text style={styles.bestClubMeta}>{tr.profile.bestClubMeta(stats.collections.bestClub.correct, stats.collections.bestClub.accuracy)}</Text></View></View> : <Text style={styles.empty}>{tr.profile.noBestClub}</Text>}
          </View>

          <SectionTitle title={tr.profile.achievements} trailing={tr.profile.achievementCount(stats.achievements.unlocked, stats.achievements.total)} />
          <Pressable accessibilityRole="button" onPress={() => router.push("/achievements" as never)} style={({ pressed }) => [styles.achievementCard, pressed && styles.pressed]}>
            {stats.achievements.showcase.length ? <View style={styles.showcaseRow}>{stats.achievements.showcase.map(item => <View key={item.code} style={styles.showcaseItem}><View style={[styles.showcaseBadge, { borderColor: item.accent, backgroundColor: `${item.accent}18` }]}><Text style={[styles.showcaseGlyph, { color: item.accent }]}>{item.glyph}</Text></View><Text numberOfLines={2} style={styles.showcaseTitle}>{locale === "tr" ? item.reward_title_tr : item.reward_title_en}</Text></View>)}</View> : <Text style={styles.empty}>{tr.profile.emptyShowcase}</Text>}
            <View style={styles.achievementAction}><Text style={styles.achievementActionText}>{tr.profile.editShowcase}</Text><Text style={styles.achievementArrow}>→</Text></View>
          </Pressable>
          <Text style={styles.disclaimer}>{tr.profile.competitiveNote}</Text>
        </> : null}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

function SectionTitle({ title, trailing }: { title: string; trailing?: string }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionLine} />{!!trailing && <Text style={styles.sectionTrailing}>{trailing}</Text>}</View>;
}

function Stat({ value, label, tone = colors.text }: { value: string | number; label: string; tone?: string }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color: tone }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Record({ value, label, glyph }: { value: number; label: string; glyph: string }) {
  return <View style={styles.record}><Text style={styles.recordGlyph}>{glyph}</Text><Text style={styles.recordValue}>{value}</Text><Text style={styles.recordLabel}>{label}</Text></View>;
}

function modeName(mode: CompetitiveMode): string {
  return mode === "QUICK" ? tr.profile.modeQuick : mode === "BLITZ" ? tr.profile.modeBlitz : mode === "RANKED" ? tr.profile.modeRanked : tr.profile.modeEvent;
}

function modeShort(mode: CompetitiveMode): string {
  return mode === "QUICK" ? "Q" : mode === "BLITZ" ? "B" : mode === "RANKED" ? "R" : "E";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 16, paddingBottom: 118 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  back: { color: colors.text, fontSize: 25, marginTop: -2 },
  topbarLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  topbarSpacer: { width: 42 },
  loader: { marginVertical: 80 },
  errorCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: `${colors.danger}10`, padding: 18 },
  error: { color: colors.danger, fontWeight: "800", lineHeight: 20 },
  identityCard: { position: "relative", overflow: "hidden", backgroundColor: "#0D2831", borderRadius: 22, borderWidth: 1, borderColor: colors.pitchLine, padding: 18, gap: 16 },
  pitchMark: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -72, top: -67, borderWidth: 1, borderColor: "rgba(89,213,166,.16)", alignItems: "center", justifyContent: "center" },
  pitchCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: "rgba(89,213,166,.18)" },
  pitchLine: { position: "absolute", width: 1, height: 190, backgroundColor: "rgba(89,213,166,.12)" },
  identityTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatarFrame: { width: 68, height: 78, borderRadius: 15, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitials: { color: colors.floodlight, fontSize: 23, fontWeight: "900", letterSpacing: -1 },
  identityCopy: { flex: 1, gap: 5 },
  name: { color: colors.text, fontSize: 24, lineHeight: 27, fontWeight: "900", letterSpacing: -.7 },
  code: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  winRateSeal: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: colors.primary, backgroundColor: "rgba(7,18,28,.72)", alignItems: "center", justifyContent: "center", padding: 6 },
  winRateValue: { color: colors.primary, fontSize: 19, fontWeight: "900", fontVariant: ["tabular-nums"] },
  winRateLabel: { color: colors.muted, fontSize: 7, fontWeight: "900", textAlign: "center", textTransform: "uppercase", marginTop: 2 },
  identityMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "rgba(89,213,166,.16)", paddingTop: 13 },
  joined: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  favoriteMode: { fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: .7 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.35 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  sectionTrailing: { color: colors.accent, fontSize: 9, fontWeight: "800" },
  formCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  formStrip: { flexDirection: "row", justifyContent: "space-between", gap: 5 },
  formItem: { flex: 1, alignItems: "center", gap: 5 },
  formResult: { width: "100%", maxWidth: 31, aspectRatio: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  formWin: { backgroundColor: "rgba(89,213,166,.18)", borderWidth: 1, borderColor: colors.primary },
  formLoss: { backgroundColor: "rgba(255,113,108,.12)", borderWidth: 1, borderColor: colors.danger },
  formLetter: { fontSize: 11, fontWeight: "900" },
  formWinText: { color: colors.primary },
  formLossText: { color: colors.danger },
  formMode: { fontSize: 8, fontWeight: "900" },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  stat: { width: "31%", flexGrow: 1, minHeight: 94, backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 13, justifyContent: "space-between" },
  statValue: { fontSize: 25, fontWeight: "900", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.muted, fontSize: 10, lineHeight: 13, fontWeight: "700" },
  streakCard: { flexDirection: "row", alignItems: "stretch", backgroundColor: "#241D16", borderRadius: 16, borderWidth: 1, borderColor: "#8F7440", padding: 15 },
  streakItem: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  streakGlyph: { color: "#F3C969", fontSize: 23, fontWeight: "900" },
  streakValue: { color: "#FFF7E3", fontSize: 23, fontWeight: "900" },
  streakLabel: { color: "#C8BFAE", fontSize: 9, lineHeight: 12, maxWidth: 92 },
  verticalRule: { width: 1, backgroundColor: "rgba(243,201,105,.22)", marginHorizontal: 13 },
  modeList: { gap: 9 },
  modeCard: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, padding: 13, gap: 5 },
  modeHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modeName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  modeRate: { fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  modeRecord: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  modeTrophies: { color: colors.text, fontSize: 10, fontWeight: "800" },
  recordRow: { flexDirection: "row", gap: 9 },
  record: { flex: 1, minHeight: 120, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, alignItems: "flex-start" },
  recordGlyph: { color: colors.accent, fontSize: 17, fontWeight: "900", minHeight: 25 },
  recordValue: { color: colors.text, fontSize: 25, fontWeight: "900", marginTop: 6 },
  recordLabel: { color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: "700", marginTop: 4 },
  collectionCard: { backgroundColor: "#0C1B25", borderRadius: 17, borderWidth: 1, borderColor: "#3B5260", padding: 16, gap: 14 },
  collectionCounts: { flexDirection: "row", gap: 40 },
  collectionValue: { color: colors.floodlight, fontSize: 28, fontWeight: "900" },
  collectionLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  collectionRule: { height: 1, backgroundColor: colors.border },
  bestClubLabel: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  bestClubRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  clubMark: { width: 46, height: 52, borderRadius: 12, backgroundColor: colors.floodlight, alignItems: "center", justifyContent: "center" },
  clubMarkText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  bestClubCopy: { flex: 1, gap: 4 },
  bestClubName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  bestClubMeta: { color: colors.muted, fontSize: 11 },
  achievementCard: { backgroundColor: colors.surface, borderRadius: 17, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 14 },
  showcaseRow: { flexDirection: "row", gap: 10 },
  showcaseItem: { flex: 1, alignItems: "center", gap: 7 },
  showcaseBadge: { width: 58, height: 64, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  showcaseGlyph: { fontSize: 25, fontWeight: "900" },
  showcaseTitle: { color: colors.text, fontSize: 9, lineHeight: 12, textAlign: "center", fontWeight: "800" },
  achievementAction: { minHeight: 44, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  achievementActionText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  achievementArrow: { color: colors.ink, fontSize: 20 },
  disclaimer: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 2 },
  pressed: { opacity: .82, transform: [{ scale: .99 }] },
});
