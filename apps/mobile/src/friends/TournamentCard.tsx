import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { supabase } from "@/auth/supabase";
import { useAuth } from "@/auth/auth-context";
import { parseTournament, type TournamentMatchView, type TournamentView } from "@/friends/tournament-model";

type FriendOption = { friend_id: string; display_name: string };

export function TournamentCard({ acceptedFriends }: { acceptedFriends: FriendOption[] }) {
  const { profile } = useAuth();
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("tournament_mine");
    if (rpcError) setError(true);
    else { setError(false); setTournament(parseTournament(data, profile.id)); }
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const togglePick = (friendId: string) => {
    setPicked(current => current.includes(friendId)
      ? current.filter(id => id !== friendId)
      : current.length < 3 ? [...current, friendId] : current);
  };

  const create = async () => {
    if (busy || picked.length !== 3) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("tournament_create", { p_friend_ids: picked });
    setBusy(false);
    if (rpcError) { Alert.alert(tr.tournament.createFailed); return; }
    setPicking(false);
    setPicked([]);
    await refresh();
  };

  const enterMatch = (match: TournamentMatchView) => {
    if (!profile || !match.roomKey) return;
    router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: match.roomKey } });
  };

  const matchRow = (match: TournamentMatchView) => {
    const done = match.status === "DONE";
    const winnerName = match.winnerId === match.playerOne.playerId ? match.playerOne.displayName : match.playerTwo.displayName;
    return (
      <View key={match.slot} style={styles.matchRow}>
        <Text style={styles.matchLabel}>{match.slot === 3 ? tr.tournament.final : tr.tournament.semi}</Text>
        <Text numberOfLines={1} style={styles.matchPair}>
          {match.playerOne.displayName} – {match.playerTwo.displayName}
        </Text>
        {done ? (
          <Text style={styles.matchWinner}>{tr.tournament.champion(winnerName)}</Text>
        ) : match.involvesMe && match.roomKey ? (
          <Pressable accessibilityRole="button" onPress={() => enterMatch(match)} style={({ pressed }) => [styles.enter, pressed && styles.pressed]}>
            <Text style={styles.enterText}>{tr.tournament.enter}</Text>
          </Pressable>
        ) : (
          <Text style={styles.matchWaiting}>{match.involvesMe ? tr.tournament.waitingOpponent : tr.tournament.waitingResult}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{tr.tournament.kicker}</Text>
      <Text style={styles.title}>{tr.tournament.title}</Text>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />}
      {!!error && !loading && (
        <Pressable accessibilityRole="button" onPress={() => { void refresh(); }}><Text style={styles.error}>{tr.tournament.loadFailed}</Text></Pressable>
      )}
      {!loading && !error && !tournament && !picking && (
        <>
          <Text style={styles.intro}>{tr.tournament.intro}</Text>
          {acceptedFriends.length >= 3 ? (
            <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}>
              <Text style={styles.createText}>{tr.tournament.create}</Text>
            </Pressable>
          ) : (
            <Text style={styles.empty}>{tr.tournament.needFriends}</Text>
          )}
        </>
      )}
      {!loading && !error && !tournament && picking && (
        <>
          <Text style={styles.intro}>{tr.tournament.pick(picked.length)}</Text>
          <View style={styles.pickList}>
            {acceptedFriends.map(friend => {
              const selected = picked.includes(friend.friend_id);
              return (
                <Pressable
                  key={friend.friend_id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => togglePick(friend.friend_id)}
                  style={({ pressed }) => [styles.pickChip, selected && styles.pickChipSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.pickChipText, selected && styles.pickChipTextSelected]}>{friend.display_name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={picked.length !== 3 || busy}
            onPress={() => { void create(); }}
            style={({ pressed }) => [styles.createButton, (picked.length !== 3 || busy) && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.createText}>{busy ? "…" : tr.tournament.start}</Text>
          </Pressable>
        </>
      )}
      {!loading && !error && !!tournament && tournament.status === "PENDING" && (
        <>
          <Text style={styles.intro}>{tr.tournament.pendingTitle}</Text>
          {tournament.members.map(member => (
            <View key={member.playerId} style={styles.memberRow}>
              <Text numberOfLines={1} style={styles.memberName}>{member.displayName}{member.isMe ? ` · ${tr.friends.league.you}` : ""}</Text>
              <Text style={[styles.memberStatus, member.status === "ACCEPTED" && styles.memberStatusAccepted]}>
                {member.status === "ACCEPTED" ? tr.tournament.memberAccepted : tr.tournament.memberInvited}
              </Text>
            </View>
          ))}
        </>
      )}
      {!loading && !error && !!tournament && tournament.status === "ACTIVE" && tournament.matches.map(matchRow)}
      {!loading && !error && !!tournament && tournament.status === "FINISHED" && (
        <View style={styles.championBox}>
          <Text style={styles.championText}>
            {tournament.winner?.playerId === profile?.id
              ? tr.tournament.youChampion
              : tr.tournament.champion(tournament.winner?.displayName ?? "?")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontWeight: "700" },
  empty: { color: colors.muted, fontSize: 12 },
  createButton: { borderRadius: 11, backgroundColor: colors.primary, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  createText: { color: colors.background, fontSize: 12, fontWeight: "900" },
  pickList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickChip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9 },
  pickChipSelected: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.12)" },
  pickChipText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  pickChipTextSelected: { color: colors.primary },
  memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.background, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 },
  memberName: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 13 },
  memberStatus: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  memberStatusAccepted: { color: colors.primary },
  matchRow: { gap: 4, backgroundColor: colors.background, borderRadius: 11, padding: 12 },
  matchLabel: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  matchPair: { color: colors.text, fontWeight: "900", fontSize: 13 },
  matchWinner: { color: colors.reward, fontSize: 11, fontWeight: "900" },
  matchWaiting: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  enter: { alignSelf: "flex-start", borderRadius: 9, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, marginTop: 2 },
  enterText: { color: colors.background, fontSize: 11, fontWeight: "900" },
  championBox: { borderRadius: 12, borderWidth: 1, borderColor: colors.reward, backgroundColor: "rgba(255,180,84,.08)", padding: 14 },
  championText: { color: colors.reward, fontWeight: "900", fontSize: 13 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
