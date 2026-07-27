import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { normalizeRematchMode } from "@/match/rematch-mode";
import { loadNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from "@/notifications/api";
import { useNotifications } from "@/notifications/notification-provider";
import { enablePushNotifications } from "@/notifications/push";
import { colors } from "@/theme/colors";

export default function NotificationsScreen() {
  const { notificationId } = useLocalSearchParams<{ notificationId?: string }>();
  const { locale } = useLanguage();
  const { profile } = useAuth();
  const { pushEnabled, refresh: refreshUnread, refreshPushState } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const next = await loadNotifications();
      setItems(next);
      await markAllNotificationsRead();
      setItems(current => current.map(item => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      await refreshUnread();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [refreshUnread]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const enablePush = async () => {
    const result = await enablePushNotifications(locale);
    await refreshPushState();
    Alert.alert(
      result === "ENABLED"
        ? tr.notifications.pushEnabled
        : result === "DENIED"
          ? tr.notifications.pushDenied
          : tr.notifications.pushUnavailable,
    );
  };

  const finishAction = async (item: AppNotification, action: "ACCEPT" | "DECLINE") => {
    if (!profile || busyId) return;
    setBusyId(item.id);
    try {
      if (item.type === "FRIEND_REQUEST" && item.actorId) {
        const { error: actionError } = await supabase.rpc("social_respond_friend", {
          p_requester_id: item.actorId,
          p_accept: action === "ACCEPT",
        });
        if (actionError) throw actionError;
      } else if (item.type === "FRIEND_MATCH_INVITE" && item.entityId) {
        const { error: actionError } = await supabase.rpc("social_respond_invite", {
          p_invite_id: item.entityId,
          p_accept: action === "ACCEPT",
        });
        if (actionError) throw actionError;
        if (action === "ACCEPT" && item.roomKey) {
          await markNotificationRead(item.id);
          router.replace({ pathname: "/match", params: { playerId: profile.id, matchId: item.roomKey } });
          return;
        }
      } else if (item.type === "TOURNAMENT_INVITE" && item.entityId) {
        const { error: actionError } = await supabase.rpc("tournament_respond", {
          p_tournament_id: item.entityId,
          p_accept: action === "ACCEPT",
        });
        if (actionError) throw actionError;
        if (action === "ACCEPT") {
          await markNotificationRead(item.id);
          router.replace("/friends" as never);
          return;
        }
      } else if (item.type === "REMATCH_OFFER" && item.entityId) {
        const status = action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
        const { error: actionError } = await supabase.from("rematch_offers").update({ status }).eq("id", item.entityId).eq("status", "PENDING");
        if (actionError) throw actionError;
        if (action === "ACCEPT" && item.roomKey) {
          const mode = normalizeRematchMode(item.matchMode);
          await markNotificationRead(item.id);
          router.replace({
            pathname: "/match",
            params: { playerId: profile.id, matchId: item.roomKey, ...(mode ? { mode } : {}) },
          });
          return;
        }
      }
      await markNotificationRead(item.id);
      await load();
    } catch {
      Alert.alert(tr.notifications.actionFailed);
    } finally {
      setBusyId(undefined);
    }
  };

  const openResolved = async (item: AppNotification) => {
    await markNotificationRead(item.id).catch(() => undefined);
    if (item.type === "STREAK_REMINDER") { router.replace("/lobby" as never); return; }
    if (item.type === "WEEKLY_REWARD_READY" || item.type === "TOURNAMENT_INVITE") { router.replace("/friends" as never); return; }
    if (item.actorId) router.push({ pathname: "/player-card", params: { playerId: item.actorId } } as never);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.notifications.back} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.back}>←</Text>
          </Pressable>
          <View style={styles.heading}>
            <Text style={styles.kicker}>{tr.notifications.kicker}</Text>
            <Text style={styles.title}>{tr.notifications.title}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={pushEnabled}
          onPress={() => { void enablePush(); }}
          style={({ pressed }) => [styles.pushCard, pushEnabled && styles.pushCardEnabled, pressed && styles.pressed]}
        >
          <View style={[styles.pushIcon, pushEnabled && styles.pushIconEnabled]}><Text style={styles.pushGlyph}>{pushEnabled ? "✓" : "!"}</Text></View>
          <View style={styles.pushCopy}>
            <Text style={styles.pushTitle}>{pushEnabled ? tr.notifications.pushEnabled : tr.notifications.enablePush}</Text>
            <Text style={styles.pushNote}>{pushEnabled ? tr.notifications.pushEnabledCopy : tr.notifications.pushCopy}</Text>
          </View>
          {!pushEnabled && <Text style={styles.pushArrow}>›</Text>}
        </Pressable>

        {loading && !items.length ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : error && !items.length ? (
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.errorCard}>
            <Text style={styles.errorText}>{tr.notifications.loadFailed}</Text>
          </Pressable>
        ) : !items.length ? (
          <View style={styles.emptyCard}><Text style={styles.emptyMark}>○</Text><Text style={styles.emptyTitle}>{tr.notifications.empty}</Text><Text style={styles.emptyCopy}>{tr.notifications.emptyCopy}</Text></View>
        ) : (
          <View style={styles.list}>
            {items.map(item => {
              const expired = !!item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();
              const actionable = item.actionStatus === "PENDING" && !expired;
              const highlighted = notificationId === item.id;
              return (
                <View key={item.id} style={[styles.notification, highlighted && styles.highlighted]}>
                  <Pressable accessibilityRole="button" onPress={() => { void openResolved(item); }} style={({ pressed }) => [styles.notificationMain, pressed && styles.pressed]}>
                    <View style={[styles.typeMark, typeTone(item.type)]}><Text style={styles.typeGlyph}>{typeGlyph(item.type)}</Text></View>
                    <View style={styles.notificationCopy}>
                      <Text style={styles.notificationTitle}>{notificationTitle(item)}</Text>
                      <Text style={styles.notificationBody}>{notificationBody(item)}</Text>
                      <Text style={styles.notificationMeta}>{formatDate(item.createdAt, locale)}{expired ? ` · ${tr.notifications.expired}` : ""}</Text>
                    </View>
                  </Pressable>
                  {actionable && item.type !== "FRIEND_ACCEPTED" && (
                    <View style={styles.actions}>
                      <Pressable disabled={busyId === item.id} onPress={() => { void finishAction(item, "DECLINE"); }} style={({ pressed }) => [styles.decline, pressed && styles.pressed, busyId === item.id && styles.disabled]}>
                        <Text style={styles.declineText}>{tr.friends.decline}</Text>
                      </Pressable>
                      <Pressable disabled={busyId === item.id} onPress={() => { void finishAction(item, "ACCEPT"); }} style={({ pressed }) => [styles.accept, pressed && styles.pressed, busyId === item.id && styles.disabled]}>
                        <Text style={styles.acceptText}>{busyId === item.id ? "…" : tr.friends.accept}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function notificationTitle(item: AppNotification): string {
  if (item.type === "FRIEND_REQUEST") return tr.notifications.friendRequest;
  if (item.type === "FRIEND_ACCEPTED") return tr.notifications.friendAccepted;
  if (item.type === "FRIEND_MATCH_INVITE") return tr.notifications.matchInvite;
  if (item.type === "STREAK_REMINDER") return tr.notifications.streakReminder;
  if (item.type === "WEEKLY_REWARD_READY") return tr.notifications.weeklyReward;
  if (item.type === "TOURNAMENT_INVITE") return tr.notifications.tournamentInvite;
  return tr.notifications.rematch;
}

function notificationBody(item: AppNotification): string {
  if (item.type === "FRIEND_REQUEST") return tr.notifications.friendRequestCopy(item.actorName);
  if (item.type === "FRIEND_ACCEPTED") return tr.notifications.friendAcceptedCopy(item.actorName);
  if (item.type === "FRIEND_MATCH_INVITE") return tr.notifications.matchInviteCopy(item.actorName);
  if (item.type === "STREAK_REMINDER") return tr.notifications.streakReminderCopy;
  if (item.type === "WEEKLY_REWARD_READY") return tr.notifications.weeklyRewardCopy;
  if (item.type === "TOURNAMENT_INVITE") return tr.notifications.tournamentInviteCopy(item.actorName);
  return tr.notifications.rematchCopy(item.actorName);
}

function typeGlyph(type: AppNotification["type"]): string {
  if (type === "FRIEND_REQUEST") return "+";
  if (type === "FRIEND_ACCEPTED") return "✓";
  if (type === "FRIEND_MATCH_INVITE") return "↗";
  if (type === "STREAK_REMINDER") return "⚡";
  if (type === "WEEKLY_REWARD_READY") return "★";
  if (type === "TOURNAMENT_INVITE") return "🏆";
  return "↻";
}

function typeTone(type: AppNotification["type"]) {
  return type === "REMATCH_OFFER" ? styles.typeRematch : type === "FRIEND_MATCH_INVITE" ? styles.typeInvite : styles.typeFriend;
}

function formatDate(value: string, locale: "tr" | "en"): string {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, paddingBottom: 54, gap: 18 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 14 },
  backButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  back: { color: colors.text, fontSize: 25, marginTop: -2 },
  heading: { flex: 1 },
  kicker: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 27, fontWeight: "900", marginTop: 3 },
  pushCard: { minHeight: 82, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: "rgba(255,180,84,.07)", flexDirection: "row", alignItems: "center", gap: 12 },
  pushCardEnabled: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.08)" },
  pushIcon: { width: 42, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  pushIconEnabled: { borderColor: colors.primary },
  pushGlyph: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  pushCopy: { flex: 1 },
  pushTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  pushNote: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  pushArrow: { color: colors.accent, fontSize: 25 },
  loader: { marginVertical: 80 },
  errorCard: { padding: 17, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: `${colors.danger}10` },
  errorText: { color: colors.danger, fontWeight: "800" },
  emptyCard: { padding: 28, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" },
  emptyMark: { color: colors.primary, fontSize: 32 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 10 },
  emptyCopy: { color: colors.muted, textAlign: "center", lineHeight: 19, marginTop: 6 },
  list: { gap: 11 },
  notification: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  highlighted: { borderColor: colors.accent },
  notificationMain: { padding: 14, flexDirection: "row", gap: 12 },
  typeMark: { width: 42, height: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  typeFriend: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.10)" },
  typeInvite: { borderColor: colors.accent, backgroundColor: "rgba(255,180,84,.10)" },
  typeRematch: { borderColor: colors.blitzSoft, backgroundColor: "rgba(184,150,255,.10)" },
  typeGlyph: { color: colors.text, fontSize: 19, fontWeight: "900" },
  notificationCopy: { flex: 1 },
  notificationTitle: { color: colors.text, fontWeight: "900", fontSize: 13 },
  notificationBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  notificationMeta: { color: colors.muted, opacity: .75, fontSize: 9, fontWeight: "700", marginTop: 7 },
  actions: { borderTopWidth: 1, borderTopColor: colors.border, padding: 10, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  decline: { minHeight: 36, borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  declineText: { color: colors.muted, fontWeight: "900", fontSize: 10 },
  accept: { minHeight: 36, borderRadius: 9, backgroundColor: colors.primary, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  acceptText: { color: colors.background, fontWeight: "900", fontSize: 10 },
  pressed: { opacity: .8, transform: [{ scale: .99 }] },
  disabled: { opacity: .45 },
});
