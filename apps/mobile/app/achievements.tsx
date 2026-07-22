import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "@/navigation/bottom-nav";
import { colors } from "@/theme/colors";
import { locale, tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { loadAchievements, saveShowcase, type Achievement, type AchievementsState } from "@/achievements/api";

const emptyState: AchievementsState = { unlockedCount: 0, totalCount: 0, showcase: [], achievements: [] };

export default function Achievements() {
  useLanguage();
  const [state, setState] = useState<AchievementsState>(emptyState);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const result = await loadAchievements();
    setState(result.state);
    setSelected(result.state.showcase.map(item => item.code));
    setError(result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const showcaseItems = useMemo(() => selected.map(code => state.achievements.find(item => item.code === code)).filter((item): item is Achievement => !!item), [selected, state.achievements]);
  const persistedCodes = state.showcase.map(item => item.code);
  const dirty = selected.join("|") !== persistedCodes.join("|");

  const toggle = (achievement: Achievement) => {
    if (!achievement.unlocked_at || saving) return;
    setSelected(current => {
      if (current.includes(achievement.code)) return current.filter(code => code !== achievement.code);
      if (current.length >= 3) return current;
      return [...current, achievement.code];
    });
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(undefined);
    const result = await saveShowcase(selected);
    if (result.error) setError(result.error);
    else setState(current => ({ ...current, showcase: result.showcase }));
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr.achievements.back} onPress={() => router.replace("/lobby")}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.kicker}>{tr.achievements.kicker}</Text>
          <Text style={styles.title}>{tr.achievements.title}</Text>
          <Text style={styles.note}>{tr.achievements.note}</Text>
          <Text style={styles.count}>{tr.achievements.count(state.unlockedCount, state.totalCount)}</Text>
        </View>

        <View style={styles.locker}>
          <View style={styles.lockerTop}><Text style={styles.lockerLabel}>{tr.achievements.showcase}</Text><Text style={styles.lockerMeta}>{selected.length}/3</Text></View>
          <View style={styles.rail} />
          <View style={styles.hangers}>
            {[0, 1, 2].map(index => {
              const item = showcaseItems[index];
              return (
                <View key={index} style={styles.hangerSlot}>
                  <View style={styles.hook} />
                  <View style={[styles.badge, item && { borderColor: item.accent, backgroundColor: `${item.accent}18` }]}>
                    <Text style={[styles.badgeGlyph, item && { color: item.accent }]}>{item?.glyph ?? "·"}</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.badgeTitle, !item && styles.badgeEmpty]}>{item ? title(item) : tr.achievements.emptySlot}</Text>
                </View>
              );
            })}
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !dirty || saving }} disabled={!dirty || saving} onPress={() => { void save(); }} style={({ pressed }) => [styles.save, (!dirty || saving) && styles.disabled, pressed && styles.pressed]}>
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>{tr.achievements.save}</Text>}
          </Pressable>
        </View>

        {!!error && !loading && <Pressable onPress={() => { void refresh(); }}><Text style={styles.error}>{tr.achievements.loadFailed}</Text></Pressable>}
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
          <View style={styles.list}>
            <View style={styles.sectionRule}><Text style={styles.sectionTitle}>{tr.achievements.all}</Text><View style={styles.rule} /></View>
            {state.achievements.map(item => {
              const unlocked = !!item.unlocked_at;
              const chosen = selected.includes(item.code);
              const full = selected.length >= 3 && !chosen;
              const percentage = Math.max(0, Math.min(100, Math.round((item.progress / item.target) * 100)));
              return (
                <Pressable
                  key={item.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen, disabled: !unlocked || full }}
                  disabled={!unlocked || full}
                  onPress={() => toggle(item)}
                  style={({ pressed }) => [styles.card, unlocked && { borderColor: `${item.accent}88` }, chosen && { borderColor: item.accent, backgroundColor: `${item.accent}12` }, pressed && styles.pressed]}
                >
                  <View style={[styles.cardMark, { borderColor: unlocked ? item.accent : colors.border }]}>
                    <Text style={[styles.cardGlyph, { color: unlocked ? item.accent : colors.muted }]}>{item.glyph}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardHeading}>
                      <Text style={styles.cardTitle}>{title(item)}</Text>
                      <Text style={[styles.status, unlocked && { color: item.accent }]}>{chosen ? tr.achievements.inShowcase : unlocked ? tr.achievements.unlocked : tr.achievements.locked}</Text>
                    </View>
                    <Text style={styles.description}>{description(item)}</Text>
                    <View style={styles.rewardRow}><Text style={styles.rewardLabel}>{tr.achievements.reward}</Text><Text style={styles.rewardTitle}>{rewardTitle(item)}</Text></View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: unlocked ? item.accent : colors.muted }]} /></View>
                    <Text style={styles.progressText}>{tr.achievements.progress(item.progress, item.target)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

function title(item: Achievement): string { return locale === "tr" ? item.title_tr : item.title_en; }
function description(item: Achievement): string { return locale === "tr" ? item.description_tr : item.description_en; }
function rewardTitle(item: Achievement): string { return locale === "tr" ? item.reward_title_tr : item.reward_title_en; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 20, paddingBottom: 118 },
  back: { color: colors.text, fontSize: 30 },
  heading: { gap: 9 },
  kicker: { color: colors.accent, fontWeight: "900", fontSize: 11, letterSpacing: 1.7 },
  title: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: "900", letterSpacing: -1.1 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20, maxWidth: 340 },
  count: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  locker: { position: "relative", overflow: "hidden", backgroundColor: "#0C1B25", borderWidth: 1, borderColor: "#3B5260", borderRadius: 18, padding: 16, gap: 16 },
  lockerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lockerLabel: { color: colors.text, fontWeight: "900", fontSize: 13, letterSpacing: 1.1 },
  lockerMeta: { color: colors.accent, fontWeight: "900", fontSize: 12 },
  rail: { position: "absolute", left: 18, right: 18, top: 54, height: 3, borderRadius: 2, backgroundColor: "#55717E" },
  hangers: { flexDirection: "row", gap: 9, paddingTop: 6 },
  hangerSlot: { flex: 1, alignItems: "center", gap: 8 },
  hook: { width: 2, height: 14, backgroundColor: "#7E929B" },
  badge: { width: 66, height: 74, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  badgeGlyph: { color: colors.muted, fontSize: 29, fontWeight: "900" },
  badgeTitle: { color: colors.text, fontSize: 10, lineHeight: 13, textAlign: "center", fontWeight: "800", minHeight: 26 },
  badgeEmpty: { color: colors.muted, fontWeight: "600" },
  save: { minHeight: 46, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  saveText: { color: colors.ink, fontWeight: "900", fontSize: 13 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  error: { color: colors.danger, fontWeight: "800", lineHeight: 19 },
  loader: { marginVertical: 30 },
  list: { gap: 12 },
  sectionRule: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  card: { minHeight: 146, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, flexDirection: "row", gap: 13 },
  cardMark: { width: 48, height: 56, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  cardGlyph: { fontSize: 23, fontWeight: "900" },
  cardBody: { flex: 1, gap: 7 },
  cardHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontWeight: "900", fontSize: 16 },
  status: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  rewardLabel: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  rewardTitle: { color: colors.text, fontSize: 11, fontWeight: "800" },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.background, overflow: "hidden", marginTop: 2 },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: "right" },
});
