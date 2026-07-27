import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { useAuth } from "@/auth/auth-context";
import { claimStreak, loadStreakStatus } from "@/streak/api";
import { buildStreakWeek, type StreakStatus } from "@/streak/streak-model";

export function LoginStreakCard() {
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<StreakStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadStreakStatus();
    setStatus(result.status);
    setError(!!result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const onClaim = async () => {
    if (busy || !status || status.claimed_today) return;
    setBusy(true);
    const result = await claimStreak();
    setBusy(false);
    if (result.error) { Alert.alert(tr.streak.claimFailed); return; }
    if (result.granted) Alert.alert(tr.streak.claimedTitle, tr.streak.claimedBody(result.granted));
    await refreshProfile();
    await refresh();
  };

  const week = buildStreakWeek(status);

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{tr.streak.kicker}</Text>
      <Text style={styles.title}>{tr.streak.title}</Text>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />}
      {!!error && !loading && (
        <Pressable accessibilityRole="button" onPress={() => { void refresh(); }}>
          <Text style={styles.error}>{tr.streak.loadFailed}</Text>
        </Pressable>
      )}
      {!loading && !error && !!status && (
        <>
          <View style={styles.week}>
            {week.map(day => (
              <View
                key={day.index}
                style={[styles.day, day.state === "CLAIMED" && styles.dayClaimed, day.state === "TODAY" && styles.dayToday]}
              >
                <Text style={[styles.dayReward, day.state !== "UPCOMING" && styles.dayRewardActive]}>+{day.reward}</Text>
                <Text style={[styles.dayLabel, day.state !== "UPCOMING" && styles.dayRewardActive]}>{day.index}</Text>
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <Text style={styles.meta}>{tr.streak.meta(status.current_length, status.best_length)}</Text>
            {status.claimed_today ? (
              <View style={[styles.chip, styles.chipClaimed]}><Text style={styles.chipText}>{tr.streak.claimedChip}</Text></View>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => { void onClaim(); }}
                style={({ pressed }) => [styles.chip, styles.chipClaim, pressed && styles.pressed, busy && styles.disabled]}
              >
                <Text style={styles.chipClaimText}>{busy ? "…" : tr.streak.claim(status.reward_today)}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  error: { color: colors.danger, fontWeight: "700" },
  week: { flexDirection: "row", gap: 6 },
  day: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 1 },
  dayClaimed: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.10)" },
  dayToday: { borderColor: colors.reward, backgroundColor: "rgba(255,180,84,.10)" },
  dayReward: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  dayRewardActive: { color: colors.text },
  dayLabel: { color: colors.muted, fontSize: 8, fontWeight: "800" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  meta: { flex: 1, color: colors.muted, fontSize: 11, fontWeight: "700" },
  chip: { minWidth: 88, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  chipClaim: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipClaimed: { borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  chipClaimText: { color: colors.background, fontSize: 10, fontWeight: "900" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
