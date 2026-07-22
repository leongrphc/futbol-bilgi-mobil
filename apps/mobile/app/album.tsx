import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "@/navigation/bottom-nav";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { loadAlbum, type AlbumEntry } from "@/album/api";

export default function Album() {
  useLanguage();
  const [entries, setEntries] = useState<AlbumEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadAlbum();
    setEntries(result.entries);
    setError(result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/lobby")}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.kicker}>{tr.album.kicker}</Text>
        <Text style={styles.title}>{tr.album.title}</Text>
        <Text style={styles.note}>{tr.album.note}</Text>
        <Text style={styles.count}>{tr.album.count(entries.length)}</Text>
        {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {!!error && !loading && <Pressable onPress={() => { void refresh(); }}><Text style={styles.error}>{tr.album.loadFailed}</Text></Pressable>}
        {!loading && !error && entries.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>{tr.album.empty}</Text></View>}
        <View style={styles.grid}>
          {entries.map(entry => (
            <View key={entry.football_player_id} style={styles.card}>
              <Text style={styles.name} numberOfLines={2}>{entry.game_name}</Text>
              <Text style={styles.meta}>{tr.album.unlockCount(entry.unlock_count)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 12, paddingBottom: 110 },
  back: { color: colors.text, fontSize: 30 },
  kicker: { color: colors.primary, fontWeight: "900", fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 36, lineHeight: 39, fontWeight: "900" },
  note: { color: colors.muted, lineHeight: 19 },
  count: { color: colors.accent, fontWeight: "900", fontSize: 12, letterSpacing: 0.6 },
  error: { color: colors.danger, fontWeight: "700" },
  empty: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18 },
  emptyText: { color: colors.muted, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  card: { width: "48%", minHeight: 88, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, justifyContent: "space-between" },
  name: { color: colors.text, fontWeight: "900", fontSize: 14, lineHeight: 18 },
  meta: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 8 },
});
