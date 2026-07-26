import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { useAuth } from "@/auth/auth-context";
import { locale, tr } from "@/i18n";
import { supabase } from "@/auth/supabase";
import { DailyQuestsCard } from "@/quests/DailyQuestsCard";
import { CoinPill, DollarPill } from "@/economy/CoinPill";
import { getAudioPrefsSync, loadAudioPrefs, setMusicEnabled, setSfxEnabled, subscribeAudioPrefs, type AudioPrefs } from "@/audio/preferences";
import { playSfx, startLobbyMusic } from "@/audio/sounds";
import { useLanguage } from "@/language/language-provider";
import { useNotifications } from "@/notifications/notification-provider";

export default function Lobby() {
  useLanguage();
  const { room: invitedRoom } = useLocalSearchParams<{ room?: string }>();
  const { profile, loading, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const playerId = profile?.id ?? "";
  useEffect(() => { if (!loading && !profile) router.replace(invitedRoom ? { pathname: "/", params: { room: invitedRoom } } : "/"); }, [invitedRoom, loading, profile]);
  const [room, setRoom] = useState(invitedRoom?.trim() || "");
  const [roomCreated, setRoomCreated] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [blitzBusy, setBlitzBusy] = useState(false);
  const [rankedBusy, setRankedBusy] = useState(false);
  const [rankedProgress, setRankedProgress] = useState({ completed: 0, required: 5, unlocked: false });
  const [eventBusy, setEventBusy] = useState(false);
  const [activePlayers, setActivePlayers] = useState<number>();
  const [queueNote, setQueueNote] = useState<string>();
  const [audioPrefs, setAudioPrefs] = useState<AudioPrefs>(getAudioPrefsSync());
  const [eventCard, setEventCard] = useState<{
    status: "NONE" | "LIVE";
    id?: string;
    title?: string;
    league?: string;
    accent?: string;
    clubCount?: number;
  }>({ status: "NONE" });
  const quickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blitzTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rankedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const eventTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueRegion = locale === "tr" ? "TR" : "EU";
  useEffect(() => { if (invitedRoom?.trim()) setRoom(invitedRoom.trim()); }, [invitedRoom]);
  useEffect(() => {
    void loadAudioPrefs().then(setAudioPrefs);
    return subscribeAudioPrefs(setAudioPrefs);
  }, []);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const loadActivePlayers = async () => {
      await supabase.rpc("social_set_presence", { p_state: "ONLINE" });
      const active = await supabase.rpc("social_active_player_count");
      if (alive && !active.error) setActivePlayers(Number(active.data ?? 0));
    };
    void (async () => {
      const [ranked, event] = await Promise.all([
        supabase.rpc("ranked_progress"),
        supabase.rpc("event_current"),
        loadActivePlayers(),
      ]);
      if (alive && !ranked.error && ranked.data) {
        setRankedProgress({
          completed: Number(ranked.data.completed_quick_matches ?? 0),
          required: Number(ranked.data.required_quick_matches ?? 5),
          unlocked: ranked.data.unlocked === true,
        });
      }
      if (!alive) return;
      if (!event.error && event.data && typeof event.data === "object") {
        const row = event.data as {
          status?: string;
          id?: string;
          title_tr?: string;
          title_en?: string;
          league?: string;
          accent?: string;
          club_count?: number;
        };
        if (row.status === "LIVE" && row.league) {
          setEventCard({
            status: "LIVE",
            id: row.id,
            title: locale === "tr" ? (row.title_tr ?? row.title_en ?? row.league) : (row.title_en ?? row.title_tr ?? row.league),
            league: row.league,
            accent: row.accent ?? colors.accent,
            clubCount: Number(row.club_count ?? 0),
          });
        } else {
          setEventCard({ status: "NONE" });
        }
      } else {
        setEventCard({ status: "NONE" });
      }
    })();
    const activeTimer = setInterval(() => { void loadActivePlayers(); }, 15_000);
    return () => {
      alive = false;
      clearInterval(activeTimer);
    };
  }, []));
  const openAccountMenu = () => Alert.alert(profile?.displayName ?? tr.nav.account, profile ? `#${profile.playerCode}` : undefined, [
    { text: tr.report.cancel, style: "cancel" },
    { text: tr.profile.open, onPress: () => router.push("/profile" as never) },
    { text: tr.achievements.menu, onPress: () => router.push("/achievements" as never) },
    { text: tr.settings.open, onPress: () => router.push("/settings" as never) },
    {
      text: audioPrefs.sfxEnabled ? tr.audio.sfxOn : tr.audio.sfxOff,
      onPress: () => {
        void setSfxEnabled(!audioPrefs.sfxEnabled).then(next => {
          setAudioPrefs(next);
          if (next.sfxEnabled) void playSfx("correct");
        });
      },
    },
    {
      text: audioPrefs.musicEnabled ? tr.audio.musicOn : tr.audio.musicOff,
      onPress: () => {
        void setMusicEnabled(!audioPrefs.musicEnabled).then(next => {
          setAudioPrefs(next);
          if (next.musicEnabled) void startLobbyMusic();
        });
      },
    },
    { text: tr.lobby.signOut, style: "destructive", onPress: () => { void signOut().then(() => router.replace("/")); } },
  ]);
  const startBotMatch = () => {
    if (!playerId) return;
    router.replace({ pathname: "/match", params: { playerId, matchId: `bot-${playerId}-${Date.now()}`, mode: "bot" } });
  };
  const joinRoom = () => { if (playerId && room.trim()) router.replace({ pathname: "/match", params: { playerId, matchId: room.trim() } }); };
  const createRoom = () => { const id = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; setRoom(id.toLowerCase()); setRoomCreated(true); };
  const shareInvite = async () => { if (!room.trim()) return; const url = Linking.createURL("lobby", { queryParams: { room: room.trim() } }); await Share.share({ title: tr.lobby.inviteTitle, message: tr.lobby.inviteMessage(url), url }); };
  const anyQueueBusy = quickBusy || blitzBusy || rankedBusy || eventBusy;
  const runQueue = async (kind: "quick" | "blitz" | "ranked" | "event") => {
    if (!playerId) return;
    if (anyQueueBusy) return;
    if (kind === "event" && eventCard.status !== "LIVE") {
      setQueueNote(tr.event.noEvent);
      return;
    }
    if (kind === "ranked" && !rankedProgress.unlocked) {
      setQueueNote(tr.ranked.locked(rankedProgress.completed, rankedProgress.required));
      return;
    }
    if (kind === "quick") setQuickBusy(true);
    else if (kind === "blitz") setBlitzBusy(true);
    else if (kind === "ranked") setRankedBusy(true);
    else setEventBusy(true);
    setQueueNote(undefined);
    const session = await supabase.auth.getSession(); const token = session.data.session?.access_token;
    const base = (process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const path = kind === "blitz" ? "/blitz-match" : kind === "ranked" ? "/ranked-match" : kind === "event" ? "/event-match" : "/quick-match";
    const timerRef = kind === "blitz" ? blitzTimer : kind === "ranked" ? rankedTimer : kind === "event" ? eventTimer : quickTimer;
    const setBusy = kind === "blitz" ? setBlitzBusy : kind === "ranked" ? setRankedBusy : kind === "event" ? setEventBusy : setQuickBusy;
    const poll = async () => {
      if (!token) { setBusy(false); return; }
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", region: queueRegion }),
        });
        const result = await response.json() as { status?: string; match_id?: string; cooldown_ms?: number; band?: number | string; required_quick_matches?: number };
        if (result.status === "MATCHED" && result.match_id) {
          setBusy(false);
          setQueueNote(undefined);
          void playSfx("match_found");
          router.replace({ pathname: "/match", params: { playerId, matchId: result.match_id, mode: kind } });
          return;
        }
        if (result.status === "NO_EVENT") {
          setBusy(false);
          setEventCard({ status: "NONE" });
          setQueueNote(tr.event.noEvent);
          return;
        }
        if (result.status === "RANKED_LOCKED") {
          setBusy(false);
          setRankedProgress(old => ({ ...old, unlocked: false }));
          setQueueNote(tr.ranked.locked(rankedProgress.completed, Number(result.required_quick_matches ?? rankedProgress.required)));
          return;
        }
        if (result.status === "COOLDOWN") {
          setBusy(false);
          const seconds = Math.max(1, Math.ceil(Number(result.cooldown_ms ?? 0) / 1000));
          setQueueNote(tr.quick.cooldown(seconds));
          return;
        }
        if (result.status === "WAITING" && result.band != null && kind !== "event") {
          setQueueNote(tr.quick.band(String(result.band)));
        }
      } catch { /* next poll keeps the queue interaction resilient to transient network errors */ }
      timerRef.current = setTimeout(() => { void poll(); }, 2_000);
    };
    await poll();
  };
  const cancelQueue = async (kind: "quick" | "blitz" | "ranked" | "event") => {
    const timerRef = kind === "blitz" ? blitzTimer : kind === "ranked" ? rankedTimer : kind === "event" ? eventTimer : quickTimer;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (kind === "blitz") setBlitzBusy(false);
    else if (kind === "ranked") setRankedBusy(false);
    else if (kind === "event") setEventBusy(false);
    else setQuickBusy(false);
    setQueueNote(undefined);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const base = (process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const path = kind === "blitz" ? "/blitz-match" : kind === "ranked" ? "/ranked-match" : kind === "event" ? "/event-match" : "/quick-match";
    try {
      const response = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const result = await response.json() as { cooldown_ms?: number };
      if (result.cooldown_ms) setQueueNote(tr.quick.cooldown(Math.max(1, Math.ceil(result.cooldown_ms / 1000))));
    } catch { /* cancel best-effort */ }
  };
  useEffect(() => () => {
    if (quickTimer.current) clearTimeout(quickTimer.current);
    if (blitzTimer.current) clearTimeout(blitzTimer.current);
    if (rankedTimer.current) clearTimeout(rankedTimer.current);
    if (eventTimer.current) clearTimeout(eventTimer.current);
  }, []);

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View pointerEvents="none" style={styles.stadiumGlow}><View style={styles.glowRing} /><View style={styles.glowRingInner} /></View>
      <View style={styles.topbar}>
        <View accessibilityLabel="Football Link" style={styles.brandBadge}><Text style={styles.brandMark}>FL</Text></View>
        <View style={styles.topbarActions}>
          <CoinPill amount={profile?.coins ?? 0} />
          <DollarPill amount={profile?.dollars ?? 0} />
          <Pressable accessibilityRole="button" accessibilityLabel={tr.profile.open} onPress={() => router.push("/profile" as never)} style={({ pressed }) => [styles.playerChip, pressed && styles.pressed]}>
            <View style={styles.online} />
            <View style={styles.playerText}>
              <Text numberOfLines={1} style={styles.playerName}>{profile?.displayName ?? tr.lobby.noSession}</Text>
              {!!profile && <Text numberOfLines={1} style={styles.playerCode}>#{profile.playerCode}</Text>}
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.notifications.title} onPress={() => router.push("/notifications" as never)} style={({ pressed }) => [styles.notificationButton, pressed && styles.pressed]}>
            <Text style={styles.notificationGlyph}>!</Text>
            {unreadCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.nav.account} onPress={openAccountMenu} style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}><Text style={styles.menuDots}>•••</Text></Pressable>
        </View>
      </View>
      <View style={styles.heading}>
        <View style={styles.headingMeta}>
          <Text style={styles.kicker}>{tr.lobby.kicker}</Text>
          {activePlayers != null && <View style={styles.livePulse}><View style={styles.livePulseDot} /><Text style={styles.livePulseText}>{tr.lobby.activePlayers(activePlayers)}</Text></View>}
        </View>
        <Text style={styles.title}>{tr.lobby.title}</Text>
        <View style={styles.headingRule}><View style={styles.headingSpot} /></View>
      </View>
      {eventCard.status === "LIVE" && (
        <Pressable
          accessibilityRole="button"
          onPress={() => { void (eventBusy ? cancelQueue("event") : runQueue("event")); }}
          style={({ pressed }) => [styles.eventLiveCard, { borderColor: eventCard.accent ?? colors.accent }, pressed && styles.pressed]}
        >
          <Text style={[styles.eventLiveKicker, { color: eventCard.accent ?? colors.accent }]}>{tr.event.kicker} · {tr.event.live}</Text>
          <Text style={styles.eventLiveTitle}>{eventBusy ? tr.event.waiting : (eventCard.title ?? eventCard.league)}</Text>
          <Text style={styles.eventLiveCopy}>
            {eventBusy
              ? tr.event.cancel
              : tr.event.copy(eventCard.league ?? "", eventCard.clubCount ?? 0)}
          </Text>
          <Text style={styles.eventLiveMeta}>{tr.event.unranked}</Text>
          <View style={styles.eventLiveAction}>
            {eventBusy ? <ActivityIndicator color={eventCard.accent ?? colors.accent} /> : <Text style={[styles.eventLiveCta, { color: eventCard.accent ?? colors.accent }]}>{tr.event.play} →</Text>}
          </View>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={() => { void (quickBusy ? cancelQueue("quick") : runQueue("quick")); }} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
        <View style={styles.signalStrip} />
        <View style={styles.quickContent}>
          <Text style={styles.quickKicker}>{tr.quick.eyebrow}</Text>
          <Text style={styles.quickTitle}>{quickBusy ? tr.quick.waiting : tr.quick.action}</Text>
          <Text style={styles.quickCopy}>{quickBusy ? tr.quick.cancel : (queueNote && !blitzBusy && !rankedBusy ? queueNote : tr.quick.copy)}</Text>
          {!!profile && <Text style={styles.rankedCups}>{profile.trophies} {tr.common.quickTrophies}</Text>}
        </View>
        <View style={styles.quickAction}>{quickBusy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.quickArrow}>→</Text>}</View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { void (rankedBusy ? cancelQueue("ranked") : runQueue("ranked")); }} style={({ pressed }) => [styles.rankedCard, pressed && styles.pressed]}>
        <View style={styles.rankedStrip} />
        <View style={styles.quickContent}>
          <Text style={styles.rankedKicker}>{tr.ranked.eyebrow}</Text>
          <Text style={styles.rankedTitle}>{rankedBusy ? tr.ranked.waiting : tr.ranked.action}</Text>
          <Text style={styles.rankedCopy}>{rankedBusy ? tr.ranked.cancel : rankedProgress.unlocked ? tr.ranked.copy : tr.ranked.locked(rankedProgress.completed, rankedProgress.required)}</Text>
          {!!profile && <Text style={styles.rankedModeCups}>{profile.rankedTrophies} {tr.common.rankedTrophies}</Text>}
        </View>
        <View style={styles.rankedAction}>{rankedBusy ? <ActivityIndicator color="#F3C969" /> : <Text style={styles.rankedArrow}>✦</Text>}</View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { void (blitzBusy ? cancelQueue("blitz") : runQueue("blitz")); }} style={({ pressed }) => [styles.blitzCard, pressed && styles.pressed]}>
        <View style={styles.blitzStrip} />
        <View style={styles.quickContent}>
          <Text style={styles.blitzKicker}>{tr.blitz.eyebrow}</Text>
          <Text style={styles.blitzTitle}>{blitzBusy ? tr.blitz.waiting : tr.blitz.action}</Text>
          <Text style={styles.blitzCopy}>{blitzBusy ? tr.blitz.cancel : tr.blitz.copy}</Text>
          {!!profile && <Text style={styles.blitzCups}>{profile.blitzTrophies} {tr.common.blitzTrophies}</Text>}
        </View>
        <View style={styles.quickAction}>{blitzBusy ? <ActivityIndicator color={colors.floodlight} /> : <Text style={styles.blitzArrow}>⚡</Text>}</View>
      </Pressable>
      {!!queueNote && !quickBusy && !blitzBusy && !rankedBusy && !eventBusy && <Text style={styles.queueNote}>{queueNote}</Text>}
      <DailyQuestsCard />
      <Pressable accessibilityRole="button" onPress={() => router.push("/album")} style={({ pressed }) => [styles.albumCard, pressed && styles.pressed]}>
        <Text style={styles.albumKicker}>{tr.album.kicker}</Text>
        <Text style={styles.albumTitle}>{tr.album.openCta}</Text>
        <Text style={styles.albumCopy}>{tr.album.note}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tr.lobby.botA11y} onPress={startBotMatch} style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
        <View pointerEvents="none" style={styles.pitch}><View style={styles.pitchCircle} /><View style={styles.pitchHalf} /></View>
        <View style={styles.heroTop}><View style={styles.trainingMark}><View style={styles.trainingDot} /><Text style={styles.trainingLabel}>{tr.ranked.unranked}</Text></View><View style={styles.testBadge}><Text style={styles.testBadgeText}>{tr.lobby.recommended}</Text></View></View>
        <Text style={styles.heroTitle}>{tr.lobby.botTitle}</Text><Text style={styles.heroCopy}>{tr.ranked.botCopy}</Text>
        <View style={styles.heroAction}><Text style={styles.heroActionText}>{tr.lobby.botAction}</Text><Text style={styles.heroArrow}>→</Text></View>
      </Pressable>
      <View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>{tr.ranked.unranked}</Text><View style={styles.rule} /></View>
      <View style={styles.roomCard}>
        <Text style={styles.roomTitle}>{tr.lobby.roomTitle}</Text><Text style={styles.roomCopy}>{tr.ranked.friendCopy}</Text>
        <TextInput accessibilityLabel={tr.lobby.roomCode} value={room} onChangeText={setRoom} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={joinRoom} placeholder="dev-room" placeholderTextColor={colors.muted} style={styles.input} />
        {roomCreated && <Text style={styles.roomNotice}>{tr.lobby.roomCreated}</Text>}
        <View style={styles.roomActions}><Pressable accessibilityRole="button" onPress={createRoom} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}><Text style={styles.outlineText}>{tr.lobby.createRoom}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: !room.trim() }} disabled={!room.trim()} onPress={() => { void shareInvite(); }} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed, !room.trim() && styles.disabled]}><Text style={styles.outlineText}>{tr.lobby.shareInvite}</Text></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !room.trim() }} disabled={!room.trim()} onPress={joinRoom} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, !room.trim() && styles.disabled]}><Text style={styles.secondaryText}>{tr.lobby.join}</Text></Pressable>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 }, page: { padding: 22, gap: 22, paddingBottom: 116, overflow: "hidden" }, stadiumGlow: { position: "absolute", width: 310, height: 310, borderRadius: 155, top: -190, right: -110, backgroundColor: "rgba(255,243,207,0.035)", alignItems: "center", justifyContent: "center" }, glowRing: { position: "absolute", width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: "rgba(255,243,207,0.07)" }, glowRingInner: { width: 145, height: 145, borderRadius: 73, borderWidth: 1, borderColor: "rgba(255,243,207,0.08)" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, topbarActions: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 }, brandBadge: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.pitchLine, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, brandMark: { color: colors.floodlight, fontSize: 11, fontWeight: "900", letterSpacing: 1 }, playerChip: { flexShrink: 1, flexDirection: "row", gap: 7, alignItems: "center", backgroundColor: "rgba(16,34,46,0.88)", borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 }, online: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, playerText: { flexShrink: 1, gap: 1 }, playerName: { color: colors.text, fontWeight: "800", fontSize: 11 }, playerCode: { color: colors.muted, fontWeight: "700", fontSize: 9, letterSpacing: .3 }, notificationButton: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, notificationGlyph: { color: colors.primary, fontSize: 14, fontWeight: "900" }, notificationBadge: { position: "absolute", minWidth: 16, height: 16, borderRadius: 8, top: -5, right: -5, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger, borderWidth: 1, borderColor: colors.background }, notificationBadgeText: { color: "#FFF", fontSize: 8, fontWeight: "900" }, menuButton: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }, menuDots: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heading: { marginTop: 7 }, headingMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, kicker: { flex: 1, color: colors.primary, fontWeight: "900", fontSize: 10, letterSpacing: 2.2 }, livePulse: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "rgba(89,213,166,.32)", backgroundColor: "rgba(89,213,166,.08)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, livePulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }, livePulseText: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: .35 }, title: { color: colors.text, fontSize: 40, lineHeight: 43, fontWeight: "900", letterSpacing: -1.5, marginTop: 10, maxWidth: 320 }, headingRule: { height: 1, backgroundColor: colors.border, marginTop: 18, justifyContent: "center" }, headingSpot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal, marginLeft: 26 },
  quickCard: { backgroundColor: colors.floodlight, borderRadius: 16, minHeight: 104, flexDirection: "row", alignItems: "stretch", overflow: "hidden", shadowColor: "#000", shadowOpacity: .22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 }, signalStrip: { width: 8, backgroundColor: colors.signal }, quickContent: { flex: 1, paddingHorizontal: 17, paddingVertical: 15, justifyContent: "center" }, quickKicker: { color: colors.signal, fontSize: 9, fontWeight: "900", letterSpacing: 1.35, marginBottom: 7 }, quickTitle: { color: colors.ink, fontWeight: "900", fontSize: 20, letterSpacing: -.3 }, quickCopy: { color: colors.ink, opacity: 0.62, fontSize: 12, marginTop: 4 }, rankedCups: { color: colors.ink, opacity: 0.7, fontSize: 11, fontWeight: "800", marginTop: 6 }, quickAction: { width: 54, borderLeftWidth: 1, borderLeftColor: "rgba(8,23,32,.14)", alignItems: "center", justifyContent: "center" }, quickArrow: { color: colors.ink, fontSize: 26 }, queueNote: { color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: -8 },
  blitzCard: { backgroundColor: "#1A1028", borderRadius: 16, minHeight: 104, flexDirection: "row", alignItems: "stretch", overflow: "hidden", borderWidth: 1, borderColor: "#6B4DFF" }, blitzStrip: { width: 8, backgroundColor: "#8B6CFF" }, blitzKicker: { color: "#B896FF", fontSize: 9, fontWeight: "900", letterSpacing: 1.25, marginBottom: 7 }, blitzTitle: { color: colors.floodlight, fontWeight: "900", fontSize: 20, letterSpacing: -.3 }, blitzCopy: { color: colors.muted, fontSize: 12, marginTop: 4 }, blitzCups: { color: "#B896FF", fontSize: 11, fontWeight: "800", marginTop: 6 }, blitzArrow: { color: "#B896FF", fontSize: 22 },
  rankedCard: { backgroundColor: "#241D16", borderRadius: 16, minHeight: 104, flexDirection: "row", alignItems: "stretch", overflow: "hidden", borderWidth: 1, borderColor: "#8F7440" },
  rankedStrip: { width: 8, backgroundColor: "#F3C969" },
  rankedKicker: { color: "#F3C969", fontSize: 9, fontWeight: "900", letterSpacing: 1.25, marginBottom: 7 },
  rankedTitle: { color: "#FFF7E3", fontWeight: "900", fontSize: 20, letterSpacing: -.3 },
  rankedCopy: { color: "#C8BFAE", fontSize: 12, lineHeight: 17, marginTop: 4 },
  rankedModeCups: { color: "#F3C969", fontSize: 11, fontWeight: "800", marginTop: 7 },
  rankedAction: { width: 54, borderLeftWidth: 1, borderLeftColor: "rgba(243,201,105,.22)", alignItems: "center", justifyContent: "center" },
  rankedArrow: { color: "#F3C969", fontSize: 24 },
  albumCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6 }, albumKicker: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, albumTitle: { color: colors.text, fontSize: 18, fontWeight: "900" }, albumCopy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  eventLiveCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 6 },
  eventLiveKicker: { fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  eventLiveTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  eventLiveCopy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  eventLiveMeta: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 2 },
  eventLiveAction: { marginTop: 8, minHeight: 28, justifyContent: "center" },
  eventLiveCta: { fontSize: 14, fontWeight: "900" },
  tutorialCard: { backgroundColor: "rgba(255,180,84,.12)", borderRadius: 16, borderWidth: 1, borderColor: colors.accent, padding: 16, gap: 8 }, tutorialKicker: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, tutorialTitle: { color: colors.text, fontSize: 20, fontWeight: "900" }, tutorialCopy: { color: colors.muted, fontSize: 13, lineHeight: 19 }, tutorialActions: { flexDirection: "row", gap: 8, marginTop: 4 }, tutorialSkip: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, tutorialSkipText: { color: colors.muted, fontWeight: "800" }, tutorialStart: { flex: 1.4, minHeight: 44, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }, tutorialStartText: { color: colors.ink, fontWeight: "900" },
  replayTutorial: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, replayTutorialText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  hero: { backgroundColor: colors.primary, borderRadius: 20, padding: 20, minHeight: 272, justifyContent: "space-between", overflow: "hidden" }, pitch: { position: "absolute", width: 238, height: 238, borderRadius: 119, right: -74, bottom: -72, borderWidth: 1, borderColor: "rgba(8,23,32,.14)", alignItems: "center", justifyContent: "center" }, pitchCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 1, borderColor: "rgba(8,23,32,.14)" }, pitchHalf: { position: "absolute", width: 1, height: 238, backgroundColor: "rgba(8,23,32,.14)" }, heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, trainingMark: { flexDirection: "row", alignItems: "center", gap: 7 }, trainingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink }, trainingLabel: { color: colors.ink, opacity: .6, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, testBadge: { backgroundColor: colors.ink, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 }, testBadgeText: { color: colors.primary, fontSize: 9, letterSpacing: 0.7, fontWeight: "900" },
  heroTitle: { color: colors.ink, fontSize: 32, fontWeight: "900", letterSpacing: -1, marginTop: 32 }, heroCopy: { color: colors.ink, opacity: 0.64, fontSize: 15, lineHeight: 22, maxWidth: 260 }, heroAction: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(8,23,32,0.2)", paddingTop: 16, marginTop: 22 }, heroActionText: { color: colors.ink, fontWeight: "900", fontSize: 15 }, heroArrow: { color: colors.ink, fontSize: 25 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 }, rule: { height: 1, backgroundColor: colors.border, flex: 1 }, or: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  roomCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border }, roomTitle: { color: colors.text, fontSize: 19, fontWeight: "900" }, roomCopy: { color: colors.muted, fontSize: 14, marginBottom: 5 }, roomNotice: { color: colors.primary, fontSize: 12, lineHeight: 17, fontWeight: "700" }, input: { color: colors.text, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, fontSize: 16 }, roomActions: { flexDirection: "row", gap: 8 }, outlineButton: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, outlineText: { color: colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" },
  secondaryButton: { minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, justifyContent: "center", alignItems: "center" }, secondaryText: { color: colors.primary, fontWeight: "900" }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.4 },
});
