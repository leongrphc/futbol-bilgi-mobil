import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { createFriendRoomKey, friendErrorMessage, type FriendshipState } from "@/friends/social-actions";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { loadPublicPlayerCard, type PublicPlayerCard } from "@/profile/public-card-api";
import { colors } from "@/theme/colors";

export default function PlayerCardScreen() {
  const { playerId } = useLocalSearchParams<{ playerId?: string }>();
  const { locale } = useLanguage();
  const { profile } = useAuth();
  const [card, setCard] = useState<PublicPlayerCard>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!playerId) {
      setError(tr.playerCard.loadFailed);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    const result = await loadPublicPlayerCard(playerId);
    setCard(result.card.playerId ? result.card : undefined);
    setError(result.error);
    setLoading(false);
  }, [playerId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const initials = useMemo(() => {
    const name = card?.displayName ?? "";
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase(locale)).join("") || "FL";
  }, [card?.displayName, locale]);

  const updateFriendship = (friendshipState: FriendshipState) => {
    setCard(current => current ? { ...current, friendshipState } : current);
  };

  const requestFriend = async () => {
    if (!card) return;
    setBusy(true);
    const { data, error: requestError } = await supabase.rpc("social_request_friend", { p_player_code: card.playerCode });
    setBusy(false);
    if (requestError) {
      Alert.alert(friendErrorMessage(requestError));
      return;
    }
    const accepted = data === "ACCEPTED" || data === "ALREADY_FRIENDS";
    updateFriendship(accepted ? "ACCEPTED" : "PENDING_OUTGOING");
    Alert.alert(accepted ? tr.friends.accepted : tr.friends.sent);
  };

  const invite = () => {
    if (!card) return;
    const room = createFriendRoomKey();
    Alert.alert(tr.friends.inviteTitle, tr.playerCard.inviteCopy(card.displayName), [
      { text: tr.report.cancel, style: "cancel" },
      {
        text: tr.friends.invite,
        onPress: () => {
          setBusy(true);
          void supabase.rpc("social_invite_friend", { p_friend_id: card.playerId, p_room_key: room }).then(({ error: inviteError }) => {
            setBusy(false);
            if (inviteError) {
              Alert.alert(friendErrorMessage(inviteError));
              return;
            }
            if (!profile) return;
            Alert.alert(tr.social.inviteSent);
            router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: room } });
          });
        },
      },
    ]);
  };

  const runPrimaryAction = () => {
    if (!card || card.friendshipState === "PENDING_OUTGOING" || card.friendshipState === "SELF") return;
    if (card.friendshipState === "ACCEPTED") invite();
    else void requestFriend();
  };

  const actionLabel = card?.friendshipState === "ACCEPTED"
    ? tr.friends.invite
    : card?.friendshipState === "PENDING_INCOMING"
      ? tr.friends.accept
      : card?.friendshipState === "PENDING_OUTGOING"
        ? tr.friends.outgoing
        : tr.friends.add;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.playerCard.back} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.kicker}>{tr.playerCard.kicker}</Text>
          <View style={styles.topbarSpacer} />
        </View>

        {loading && !card ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : error && !card ? (
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.errorCard}>
            <Text style={styles.errorText}>{tr.playerCard.loadFailed}</Text>
          </Pressable>
        ) : card ? <>
          <View style={styles.identityCard}>
            <View pointerEvents="none" style={styles.pitchMark}>
              <View style={styles.pitchCircle} />
              <View style={styles.pitchLine} />
            </View>
            <View style={styles.identityRow}>
              <View style={styles.avatarFrame}>
                {card.avatarUrl ? <Image source={{ uri: card.avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitials}>{initials}</Text>}
              </View>
              <View style={styles.identityCopy}>
                <Text numberOfLines={2} style={styles.name}>{card.displayName}</Text>
                <Text style={styles.code}>#{card.playerCode}</Text>
              </View>
            </View>
            <Text style={styles.publicNote}>{tr.playerCard.publicNote}</Text>
            {!!card.h2h && (card.h2h.wins > 0 || card.h2h.losses > 0) && (
              <View style={styles.h2hChip}><Text style={styles.h2hText}>{tr.h2h.label(card.h2h.wins, card.h2h.losses)}</Text></View>
            )}
          </View>

          <SectionTitle title={tr.playerCard.trophies} />
          <View style={styles.trophyBoard}>
            <TrophyCell label={tr.competition.quickLadder} value={card.trophies} tone={colors.primary} />
            <View style={styles.verticalRule} />
            <TrophyCell label={tr.competition.blitzLadder} value={card.blitzTrophies} tone={colors.blitzSoft} />
            <View style={styles.verticalRule} />
            <TrophyCell label={tr.competition.rankedLadder} value={card.rankedTrophies} tone={colors.ranked} />
          </View>

          <SectionTitle title={tr.playerCard.form} />
          <View style={styles.formCard}>
            {card.form.length ? <View style={styles.formStrip}>{card.form.map((outcome, index) => {
              const won = outcome === "W";
              return <View key={`${outcome}-${index}`} style={[styles.formResult, won ? styles.formWin : styles.formLoss]}>
                <Text style={[styles.formLetter, won ? styles.formWinText : styles.formLossText]}>{won ? (locale === "tr" ? "G" : "W") : (locale === "tr" ? "M" : "L")}</Text>
              </View>;
            })}</View> : <Text style={styles.empty}>{tr.playerCard.noForm}</Text>}
          </View>

          <SectionTitle title={tr.playerCard.showcase} />
          <View style={styles.showcaseCard}>
            {card.achievements.length ? <View style={styles.showcaseRow}>{card.achievements.map(item => (
              <View key={item.code} style={styles.showcaseItem}>
                <View style={[styles.showcaseBadge, { borderColor: item.accent, backgroundColor: `${item.accent}18` }]}>
                  <Text style={[styles.showcaseGlyph, { color: item.accent }]}>{item.glyph}</Text>
                </View>
                <Text numberOfLines={2} style={styles.showcaseTitle}>{locale === "tr" ? item.reward_title_tr : item.reward_title_en}</Text>
              </View>
            ))}</View> : <Text style={styles.empty}>{tr.playerCard.noShowcase}</Text>}
          </View>

          {card.friendshipState !== "SELF" && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || card.friendshipState === "PENDING_OUTGOING" }}
              disabled={busy || card.friendshipState === "PENDING_OUTGOING"}
              onPress={runPrimaryAction}
              style={({ pressed }) => [styles.primaryAction, card.friendshipState === "ACCEPTED" && styles.inviteAction, (busy || card.friendshipState === "PENDING_OUTGOING") && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={[styles.primaryActionText, card.friendshipState === "ACCEPTED" && styles.inviteActionText]}>{actionLabel}</Text>
              <Text style={[styles.actionArrow, card.friendshipState === "ACCEPTED" && styles.inviteActionText]}>{card.friendshipState === "ACCEPTED" ? "↗" : "+"}</Text>
            </Pressable>
          )}
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionLine} /></View>;
}

function TrophyCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <View style={styles.trophyCell}><Text style={[styles.trophyValue, { color: tone }]}>{value}</Text><Text style={styles.trophyLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 16, paddingBottom: 50 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  back: { color: colors.text, fontSize: 25, marginTop: -2 },
  kicker: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  topbarSpacer: { width: 42, height: 42 },
  loader: { marginVertical: 90 },
  errorCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.danger, backgroundColor: `${colors.danger}10`, padding: 18 },
  errorText: { color: colors.danger, fontWeight: "800", lineHeight: 20 },
  identityCard: { position: "relative", overflow: "hidden", backgroundColor: "#0D2831", borderRadius: 22, borderWidth: 1, borderColor: colors.pitchLine, padding: 18, gap: 16 },
  pitchMark: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -72, top: -67, borderWidth: 1, borderColor: "rgba(89,213,166,.16)", alignItems: "center", justifyContent: "center" },
  pitchCircle: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: "rgba(89,213,166,.18)" },
  pitchLine: { position: "absolute", width: 1, height: 190, backgroundColor: "rgba(89,213,166,.12)" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarFrame: { width: 72, height: 82, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitials: { color: colors.floodlight, fontSize: 23, fontWeight: "900", letterSpacing: -1 },
  identityCopy: { flex: 1, gap: 6 },
  name: { color: colors.text, fontSize: 27, lineHeight: 30, fontWeight: "900", letterSpacing: -.8 },
  code: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  publicNote: { color: colors.muted, fontSize: 10, lineHeight: 15, borderTopWidth: 1, borderTopColor: "rgba(89,213,166,.16)", paddingTop: 12 },
  h2hChip: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: colors.reward, backgroundColor: "rgba(255,180,84,.10)", paddingHorizontal: 11, paddingVertical: 6 },
  h2hText: { color: colors.reward, fontSize: 11, fontWeight: "900" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.35 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  trophyBoard: { minHeight: 102, flexDirection: "row", alignItems: "stretch", backgroundColor: "#0C1B25", borderRadius: 17, borderWidth: 1, borderColor: "#3B5260", paddingVertical: 15 },
  trophyCell: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6 },
  trophyValue: { fontSize: 27, fontWeight: "900", fontVariant: ["tabular-nums"] },
  trophyLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", textAlign: "center" },
  verticalRule: { width: 1, backgroundColor: colors.border },
  formCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  formStrip: { flexDirection: "row", gap: 8 },
  formResult: { flex: 1, maxWidth: 48, aspectRatio: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  formWin: { backgroundColor: "rgba(89,213,166,.18)", borderWidth: 1, borderColor: colors.primary },
  formLoss: { backgroundColor: "rgba(255,113,108,.12)", borderWidth: 1, borderColor: colors.danger },
  formLetter: { fontSize: 13, fontWeight: "900" },
  formWinText: { color: colors.primary },
  formLossText: { color: colors.danger },
  showcaseCard: { backgroundColor: colors.surface, borderRadius: 17, borderWidth: 1, borderColor: colors.border, padding: 15 },
  showcaseRow: { flexDirection: "row", gap: 10 },
  showcaseItem: { flex: 1, alignItems: "center", gap: 7 },
  showcaseBadge: { width: 60, height: 66, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  showcaseGlyph: { fontSize: 25, fontWeight: "900" },
  showcaseTitle: { color: colors.text, fontSize: 9, lineHeight: 12, textAlign: "center", fontWeight: "800" },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  primaryAction: { minHeight: 54, borderRadius: 13, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 17, marginTop: 2 },
  primaryActionText: { color: colors.background, fontSize: 13, fontWeight: "900" },
  actionArrow: { color: colors.background, fontSize: 22, fontWeight: "700" },
  inviteAction: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.accent },
  inviteActionText: { color: colors.accent },
  disabled: { opacity: .42 },
  pressed: { opacity: .82, transform: [{ scale: .99 }] },
});
