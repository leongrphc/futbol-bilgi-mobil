import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomNav } from "@/navigation/bottom-nav";
import { colors } from "@/theme/colors";
import { locale, tr } from "@/i18n";
import { useAuth } from "@/auth/auth-context";
import { loadPlayerProfileStats, type CompetitiveMode, type PlayerProfileStats } from "@/profile/api";
import { supabase } from "@/auth/supabase";
import { buildMasteryStandings, type MasteryRow, type MasteryStanding, type MasteryTier } from "@/profile/mastery-model";
import { AvatarUploadError, uploadProfileAvatar } from "@/profile/avatar";
import { useLanguage } from "@/language/language-provider";

const modeColors: Record<CompetitiveMode, string> = {
  QUICK: colors.primary,
  BLITZ: colors.blitzSoft,
  RANKED: colors.ranked,
  EVENT: colors.accent,
};

export default function Profile() {
  const { locale: activeLocale } = useLanguage();
  const { profile, refreshProfile } = useAuth();
  const [stats, setStats] = useState<PlayerProfileStats>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [avatarPreview, setAvatarPreview] = useState<string>();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [mastery, setMastery] = useState<MasteryStanding[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const [result, masteryResult] = await Promise.all([
      loadPlayerProfileStats(),
      supabase.rpc("mastery_mine", { p_limit: 6 }),
    ]);
    setStats(result.stats.profile.playerId ? result.stats : undefined);
    setError(result.error);
    if (!masteryResult.error) setMastery(buildMasteryStandings((masteryResult.data ?? []) as MasteryRow[]));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const displayName = stats?.profile.displayName || profile?.displayName || "Football Link";
  const initials = useMemo(() => displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase(locale)).join("") || "FL", [activeLocale, displayName]);
  const memberSince = stats?.profile.createdAt ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-GB", { month: "long", year: "numeric" }).format(new Date(stats.profile.createdAt)) : "";
  const currentAvatarUrl = avatarPreview ?? stats?.profile.avatarUrl ?? profile?.avatarUrl ?? null;

  const chooseAvatar = async () => {
    if (!profile || uploadingAvatar) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tr.profile.avatarPermission);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    const previousPreview = avatarPreview;
    const asset = result.assets[0];
    setAvatarPreview(asset.uri);
    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadProfileAvatar({
        asset,
        previousAvatarUrl: stats?.profile.avatarUrl ?? profile.avatarUrl,
        userId: profile.id,
      });
      setAvatarPreview(publicUrl);
      await Promise.all([refreshProfile(), refresh()]);
    } catch (uploadError) {
      setAvatarPreview(previousPreview);
      Alert.alert(tr.profile.avatarFailed, avatarErrorMessage(uploadError));
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.profile.back} onPress={() => router.replace("/lobby")} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.topbarLabel}>{tr.profile.kicker}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.settings.open} onPress={() => router.push("/settings" as never)} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Ionicons name="options-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>

        {loading && !stats ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : error && !stats ? (
          <Pressable accessibilityRole="button" onPress={() => { void refresh(); }} style={styles.errorCard}>
            <Text style={styles.error}>{tr.profile.loadFailed}</Text>
          </Pressable>
        ) : stats ? <>
          <View style={styles.identityCard}>
            <View pointerEvents="none" style={styles.pitchMark}><View style={styles.pitchCircle} /><View style={styles.pitchLine} /></View>
            <View style={styles.identityTop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr.profile.avatarEdit}
                accessibilityState={{ busy: uploadingAvatar, disabled: uploadingAvatar }}
                disabled={uploadingAvatar}
                onPress={() => { void chooseAvatar(); }}
                style={({ pressed }) => [styles.avatarEditor, pressed && styles.pressed]}
              >
                <View style={styles.avatarFrame}>
                  {currentAvatarUrl ? <Image source={{ uri: currentAvatarUrl }} resizeMode="cover" style={styles.avatarImage} /> : <Text style={styles.avatarInitials}>{initials}</Text>}
                  {uploadingAvatar && <View style={styles.avatarLoading}><ActivityIndicator color={colors.floodlight} size="small" /></View>}
                </View>
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera" size={13} color={colors.ink} />
                </View>
              </Pressable>
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

          <SectionTitle title={tr.mastery.title} />
          <View style={styles.masteryCard}>
            {mastery.length ? mastery.map(item => (
              <View key={item.clubExternalId} style={styles.masteryRow}>
                <View style={[styles.masteryBadge, masteryBadgeStyle(item.tier)]}>
                  <Text style={[styles.masteryBadgeText, masteryBadgeTextStyle(item.tier)]}>{tr.mastery.tierNames[item.tier]}</Text>
                </View>
                <View style={styles.masteryMeta}>
                  <Text numberOfLines={1} style={styles.masteryClub}>{item.clubName}</Text>
                  <Text style={styles.masteryDetail}>
                    {tr.mastery.correct(item.correct)} · {item.nextTierAt == null ? tr.mastery.max : tr.mastery.next(item.nextTierAt - item.correct)}
                  </Text>
                  <View style={styles.masteryTrack}><View style={[styles.masteryFill, { width: `${Math.round(item.progress * 100)}%` }, masteryFillStyle(item.tier)]} /></View>
                </View>
              </View>
            )) : <Text style={styles.empty}>{tr.mastery.empty}</Text>}
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

const masteryTierColors: Record<MasteryTier, string> = {
  NONE: "#5E6A75",
  BRONZE: "#C98A5A",
  SILVER: "#B9C4CF",
  GOLD: colors.reward,
};

function masteryBadgeStyle(tier: MasteryTier) {
  return { borderColor: masteryTierColors[tier], backgroundColor: `${masteryTierColors[tier]}18` };
}

function masteryBadgeTextStyle(tier: MasteryTier) {
  return { color: masteryTierColors[tier] };
}

function masteryFillStyle(tier: MasteryTier) {
  return { backgroundColor: masteryTierColors[tier] };
}

function avatarErrorMessage(error: unknown): string {
  if (!(error instanceof AvatarUploadError)) return tr.profile.avatarUploadFailed;
  if (error.code === "AVATAR_TOO_LARGE") return tr.profile.avatarTooLarge;
  if (error.code === "AVATAR_UNSUPPORTED") return tr.profile.avatarUnsupported;
  return tr.profile.avatarUploadFailed;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 16, paddingBottom: 118 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  back: { color: colors.text, fontSize: 25, marginTop: -2 },
  topbarLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  loader: { marginVertical: 80 },
  errorCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: `${colors.danger}10`, padding: 18 },
  error: { color: colors.danger, fontWeight: "800", lineHeight: 20 },
  identityCard: { position: "relative", overflow: "hidden", backgroundColor: "#0D2831", borderRadius: 22, borderWidth: 1, borderColor: colors.pitchLine, padding: 18, gap: 16 },
  pitchMark: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -72, top: -67, borderWidth: 1, borderColor: "rgba(89,213,166,.16)", alignItems: "center", justifyContent: "center" },
  pitchCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: "rgba(89,213,166,.18)" },
  pitchLine: { position: "absolute", width: 1, height: 190, backgroundColor: "rgba(89,213,166,.12)" },
  identityTop: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatarEditor: { position: "relative" },
  avatarFrame: { width: 68, height: 78, borderRadius: 15, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitials: { color: colors.floodlight, fontSize: 23, fontWeight: "900", letterSpacing: -1 },
  avatarLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,18,28,.64)" },
  avatarEditBadge: { position: "absolute", width: 25, height: 25, borderRadius: 13, right: -7, bottom: -7, borderWidth: 2, borderColor: "#0D2831", backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
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
  streakCard: { flexDirection: "row", alignItems: "stretch", backgroundColor: colors.rankedDeep, borderRadius: 16, borderWidth: 1, borderColor: "#8F7440", padding: 15 },
  streakItem: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  streakGlyph: { color: colors.ranked, fontSize: 23, fontWeight: "900" },
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
  masteryCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
  masteryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  masteryBadge: { width: 58, borderRadius: 8, borderWidth: 1, paddingVertical: 5, alignItems: "center" },
  masteryBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  masteryMeta: { flex: 1, minWidth: 0, gap: 3 },
  masteryClub: { color: colors.text, fontWeight: "900", fontSize: 13 },
  masteryDetail: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  masteryTrack: { height: 4, borderRadius: 2, backgroundColor: colors.background, overflow: "hidden", marginTop: 2 },
  masteryFill: { height: 4, borderRadius: 2 },
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
