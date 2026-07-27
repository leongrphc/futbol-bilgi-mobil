import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomNav } from "@/navigation/bottom-nav";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { loadAlbum, type AlbumEntry } from "@/album/api";
import { claimAlbumCollection, loadAlbumCollections, type AlbumCollection } from "@/album/collections-api";
import { Alert } from "react-native";
import { useAuth } from "@/auth/auth-context";

export default function Album() {
  useLanguage();
  const { refreshProfile } = useAuth();
  const [entries, setEntries] = useState<AlbumEntry[]>([]);
  const [collections, setCollections] = useState<AlbumCollection[]>([]);
  const [collectionsError, setCollectionsError] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    const [result, collectionsResult] = await Promise.all([loadAlbum(), loadAlbumCollections()]);
    setEntries(result.entries);
    setError(result.error);
    setCollections(collectionsResult.collections);
    setCollectionsError(!!collectionsResult.error);
    setLoading(false);
  }, []);

  const onClaim = async (collection: AlbumCollection) => {
    if (busyId || collection.claimed || collection.progress < collection.target) return;
    setBusyId(collection.collection_id);
    const result = await claimAlbumCollection(collection.collection_id);
    setBusyId(undefined);
    if (result.error) { Alert.alert(tr.collections.claimFailed); return; }
    await refreshProfile();
    await refresh();
  };

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
        {!loading && !error && entries.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{tr.album.empty}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/lobby")} style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.85 }]}>
              <Text style={styles.emptyCtaText}>{tr.album.emptyCta} →</Text>
            </Pressable>
          </View>
        )}
        {!loading && (
          <View style={styles.collectionsBlock}>
            <Text style={styles.collectionsKicker}>{tr.collections.kicker}</Text>
            <Text style={styles.collectionsTitle}>{tr.collections.title}</Text>
            {collectionsError ? (
              <Pressable accessibilityRole="button" onPress={() => { void refresh(); }}><Text style={styles.error}>{tr.collections.loadFailed}</Text></Pressable>
            ) : collections.length === 0 ? (
              <Text style={styles.emptyText}>{tr.collections.empty}</Text>
            ) : collections.map(collection => {
              const complete = collection.progress >= collection.target;
              return (
                <View key={collection.collection_id} style={styles.collectionRow}>
                  <View style={styles.collectionMeta}>
                    <Text style={styles.collectionLeague}>{collection.league}</Text>
                    <Text style={styles.collectionProgress}>{tr.collections.progress(collection.progress, collection.target)}</Text>
                    <View style={styles.collectionTrack}>
                      <View style={[styles.collectionFill, { width: `${Math.round(Math.min(1, collection.progress / collection.target) * 100)}%` }, collection.claimed && styles.collectionFillClaimed]} />
                    </View>
                  </View>
                  {collection.claimed ? (
                    <View style={[styles.collectionChip, styles.collectionChipClaimed]}><Text style={styles.collectionChipText}>{tr.collections.claimed}</Text></View>
                  ) : complete ? (
                    <Pressable accessibilityRole="button" disabled={busyId === collection.collection_id} onPress={() => { void onClaim(collection); }} style={({ pressed }) => [styles.collectionChip, styles.collectionChipClaim, pressed && { opacity: 0.85 }]}>
                      <Text style={styles.collectionChipClaimText}>{busyId === collection.collection_id ? "…" : tr.collections.claim(collection.reward_coins)}</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.collectionChip}><Text style={styles.collectionChipText}>+{collection.reward_coins}</Text></View>
                  )}
                </View>
              );
            })}
          </View>
        )}
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
  empty: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  emptyCta: { alignSelf: "flex-start", minHeight: 40, borderRadius: 10, backgroundColor: colors.primary, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { color: colors.background, fontSize: 12, fontWeight: "800" },
  emptyText: { color: colors.muted, lineHeight: 20 },
  collectionsBlock: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, marginTop: 4 },
  collectionsKicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  collectionsTitle: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  collectionRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.background, borderRadius: 12, padding: 12 },
  collectionMeta: { flex: 1, minWidth: 0, gap: 3 },
  collectionLeague: { color: colors.text, fontWeight: "900", fontSize: 13 },
  collectionProgress: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  collectionTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: "hidden", marginTop: 2 },
  collectionFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  collectionFillClaimed: { backgroundColor: colors.reward },
  collectionChip: { minWidth: 68, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7, alignItems: "center" },
  collectionChipClaim: { backgroundColor: colors.primary, borderColor: colors.primary },
  collectionChipClaimed: { borderColor: colors.reward },
  collectionChipText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  collectionChipClaimText: { color: colors.background, fontSize: 10, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  card: { width: "48%", minHeight: 88, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, justifyContent: "space-between" },
  name: { color: colors.text, fontWeight: "900", fontSize: 14, lineHeight: 18 },
  meta: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 8 },
});
