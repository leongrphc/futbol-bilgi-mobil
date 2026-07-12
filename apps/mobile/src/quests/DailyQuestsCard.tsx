import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { claimQuest, loadQuests, type QuestRow } from "@/quests/api";
import { useAuth } from "@/auth/auth-context";

const titleFor = (id: string) => {
  const items = tr.quests.items as Record<string, string>;
  return items[id] ?? id;
};

export function DailyQuestsCard() {
  const { refreshProfile } = useAuth();
  const [quests, setQuests] = useState<QuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadQuests();
    setQuests(result.quests);
    setError(result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const onClaim = async (quest: QuestRow) => {
    if (!quest.completed || quest.claimed || busyId) return;
    setBusyId(quest.quest_id);
    const result = await claimQuest(quest.quest_id);
    setBusyId(undefined);
    if (!result.ok) Alert.alert(tr.quests.claimFailed);
    else await refreshProfile();
    await refresh();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{tr.quests.kicker}</Text>
      <Text style={styles.title}>{tr.quests.title}</Text>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />}
      {!!error && !loading && <Pressable onPress={() => { void refresh(); }}><Text style={styles.error}>{tr.quests.loadFailed}</Text></Pressable>}
      {!loading && !error && quests.length === 0 && <Text style={styles.empty}>{tr.quests.empty}</Text>}
      {quests.map(quest => {
        const done = quest.completed;
        const claimed = quest.claimed;
        return (
          <View key={quest.quest_id} style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.questTitle}>{titleFor(quest.quest_id)}</Text>
              <View style={styles.questMeta}><Text style={styles.progress}>{tr.quests.progress(quest.progress, quest.target_count)}</Text><Text style={styles.reward}>+{quest.reward_coins ?? 0} C</Text></View>
            </View>
            {claimed ? (
              <View style={[styles.chip, styles.chipClaimed]}><Text style={styles.chipText}>{tr.quests.claimed}</Text></View>
            ) : done ? (
              <Pressable accessibilityRole="button" disabled={busyId === quest.quest_id} onPress={() => { void onClaim(quest); }} style={({ pressed }) => [styles.chip, styles.chipClaim, pressed && styles.pressed]}>
                <Text style={styles.chipClaimText}>{busyId === quest.quest_id ? "…" : tr.quests.claim}</Text>
              </Pressable>
            ) : (
              <View style={styles.chip}><Text style={styles.chipText}>{tr.quests.active}</Text></View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  empty: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12 },
  meta: { flex: 1, gap: 3 },
  questMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  questTitle: { color: colors.text, fontWeight: "800", fontSize: 13 },
  progress: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  reward: { color: "#F4C95D", fontSize: 10, fontWeight: "900" },
  chip: { minWidth: 72, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, alignItems: "center" },
  chipClaim: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipClaimed: { borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  chipClaimText: { color: colors.background, fontSize: 10, fontWeight: "900" },
  pressed: { opacity: 0.85 },
});
