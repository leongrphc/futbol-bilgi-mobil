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
import { isTutorialComplete, markTutorialComplete, resetTutorial } from "@/onboarding/tutorial";
import { CoinPill, DollarPill } from "@/economy/CoinPill";
import { getAudioPrefsSync, loadAudioPrefs, setMusicEnabled, setSfxEnabled, subscribeAudioPrefs, type AudioPrefs } from "@/audio/preferences";
import { playSfx, startLobbyMusic } from "@/audio/sounds";

export default function Lobby() {
  const { room: invitedRoom } = useLocalSearchParams<{ room?: string }>();
  const { profile, loading, signOut } = useAuth();
  const playerId = profile?.id ?? "";
  useEffect(() => { if (!loading && !profile) router.replace(invitedRoom ? { pathname: "/", params: { room: invitedRoom } } : "/"); }, [invitedRoom, loading, profile]);
  const [room, setRoom] = useState(invitedRoom?.trim() || "");
  const [roomCreated, setRoomCreated] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [blitzBusy, setBlitzBusy] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [queueNote, setQueueNote] = useState<string>();
  const [showTutorial, setShowTutorial] = useState(false);
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
  const eventTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueRegion = locale === "tr" ? "TR" : "EU";
  useEffect(() => { if (invitedRoom?.trim()) setRoom(invitedRoom.trim()); }, [invitedRoom]);
  useEffect(() => {
    void loadAudioPrefs().then(setAudioPrefs);
    return subscribeAudioPrefs(setAudioPrefs);
  }, []);
  useFocusEffect(useCallback(() => {
    let alive = true;
    void (async () => {
      const done = await isTutorialComplete();
      if (alive) setShowTutorial(!done);
      const event = await supabase.rpc("event_current");
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
    return () => {
      alive = false;
    };
  }, []));
  const openAccountMenu = () => Alert.alert(profile?.displayName ?? tr.nav.account, profile ? `#${profile.playerCode}` : undefined, [
    { text: tr.report.cancel, style: "cancel" },
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
  const startBotMatch = (tutorial = false) => {
    if (!playerId) return;
    if (tutorial) void markTutorialComplete();
    router.replace({ pathname: "/match", params: { playerId, matchId: `bot-${playerId}-${Date.now()}`, mode: "bot", ...(tutorial ? { tutorial: "1" } : {}) } });
  };
  const skipTutorial = () => { void markTutorialComplete(); setShowTutorial(false); };
  const showTutorialAgain = () => { void resetTutorial().then(() => setShowTutorial(true)); };
  const joinRoom = () => { if (playerId && room.trim()) router.replace({ pathname: "/match", params: { playerId, matchId: room.trim() } }); };
  const createRoom = () => { const id = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; setRoom(id.toLowerCase()); setRoomCreated(true); };
  const shareInvite = async () => { if (!room.trim()) return; const url = Linking.createURL("lobby", { queryParams: { room: room.trim() } }); await Share.share({ title: tr.lobby.inviteTitle, message: tr.lobby.inviteMessage(url), url }); };
  const anyQueueBusy = quickBusy || blitzBusy || eventBusy;
  const runQueue = async (kind: "quick" | "blitz" | "event") => {
    if (!playerId) return;
    if (anyQueueBusy) return;
    if (kind === "event" && eventCard.status !== "LIVE") {
      setQueueNote(tr.event.noEvent);
      return;
    }
    if (kind === "quick") setQuickBusy(true);
    else if (kind === "blitz") setBlitzBusy(true);
    else setEventBusy(true);
    setQueueNote(undefined);
    const session = await supabase.auth.getSession(); const token = session.data.session?.access_token;
    const base = (process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const path = kind === "blitz" ? "/blitz-match" : kind === "event" ? "/event-match" : "/quick-match";
    const timerRef = kind === "blitz" ? blitzTimer : kind === "event" ? eventTimer : quickTimer;
    const setBusy = kind === "blitz" ? setBlitzBusy : kind === "event" ? setEventBusy : setQuickBusy;
    const poll = async () => {
      if (!token) { setBusy(false); return; }
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", region: queueRegion }),
        });
        const result = await response.json() as { status?: string; match_id?: string; cooldown_ms?: number; band?: number | string };
        if (result.status === "MATCHED" && result.match_id) {
          setBusy(false);
          setQueueNote(undefined);
          router.replace({ pathname: "/match", params: { playerId, matchId: result.match_id, mode: kind } });
          return;
        }
        if (result.status === "NO_EVENT") {
          setBusy(false);
          setEventCard({ status: "NONE" });
          setQueueNote(tr.event.noEvent);
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
  const cancelQueue = async (kind: "quick" | "blitz" | "event") => {
    const timerRef = kind === "blitz" ? blitzTimer : kind === "event" ? eventTimer : quickTimer;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (kind === "blitz") setBlitzBusy(false);
    else if (kind === "event") setEventBusy(false);
    else setQuickBusy(false);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const base = (process.env.EXPO_PUBLIC_MATCH_SERVER_URL ?? "ws://localhost:8787").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const path = kind === "blitz" ? "/blitz-match" : kind === "event" ? "/event-match" : "/quick-match";
    try {
      const response = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const result = await response.json() as { cooldown_ms?: number };
      if (result.cooldown_ms) setQueueNote(tr.quick.cooldown(Math.max(1, Math.ceil(result.cooldown_ms / 1000))));
    } catch { /* cancel best-effort */ }
  };
  useEffect(() => () => {
    if (quickTimer.current) clearTimeout(quickTimer.current);
    if (blitzTimer.current) clearTimeout(blitzTimer.current);
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
          <Pressable accessibilityRole="button" accessibilityLabel={tr.nav.account} onPress={openAccountMenu} style={({ pressed }) => [styles.playerChip, pressed && styles.pressed]}>
            <View style={styles.online} />
            <View style={styles.playerText}>
              <Text numberOfLines={1} style={styles.playerName}>{profile?.displayName ?? tr.lobby.noSession}</Text>
              {!!profile && <Text numberOfLines={1} style={styles.playerCode}>#{profile.playerCode}</Text>}
            </View>
            <Text style={styles.menuDots}>•••</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.heading}><Text style={styles.kicker}>{tr.lobby.kicker}</Text><Text style={styles.title}>{tr.lobby.title}</Text><View style={styles.headingRule}><View style={styles.headingSpot} /></View></View>
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
      {showTutorial && <View style={styles.tutorialCard}>
        <Text style={styles.tutorialKicker}>{tr.tutorial.banner}</Text>
        <Text style={styles.tutorialTitle}>{tr.tutorial.title}</Text>
        <Text style={styles.tutorialCopy}>{tr.tutorial.copy}</Text>
        <View style={styles.tutorialActions}>
          <Pressable accessibilityRole="button" onPress={skipTutorial} style={({ pressed }) => [styles.tutorialSkip, pressed && styles.pressed]}><Text style={styles.tutorialSkipText}>{tr.tutorial.skip}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => startBotMatch(true)} style={({ pressed }) => [styles.tutorialStart, pressed && styles.pressed]}><Text style={styles.tutorialStartText}>{tr.tutorial.start}</Text></Pressable>
        </View>
      </View>}
      {!showTutorial && <Pressable accessibilityRole="button" onPress={showTutorialAgain} style={({ pressed }) => [styles.replayTutorial, pressed && styles.pressed]}>
        <Text style={styles.replayTutorialText}>{tr.tutorial.showAgain}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" onPress={() => { void (quickBusy ? cancelQueue("quick") : runQueue("quick")); }} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
        <View style={styles.signalStrip} />
        <View style={styles.quickContent}>
          <Text style={styles.quickKicker}>{tr.quick.rankedTag} · {queueRegion}</Text>
          <Text style={styles.quickTitle}>{quickBusy ? tr.quick.waiting : tr.quick.action}</Text>
          <Text style={styles.quickCopy}>{quickBusy ? tr.quick.cancel : (queueNote && !blitzBusy ? queueNote : tr.quick.copy)}</Text>
          {!!profile && <Text style={styles.rankedCups}>{profile.trophies} {tr.common.trophies}</Text>}
        </View>
        <View style={styles.quickAction}>{quickBusy ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.quickArrow}>→</Text>}</View>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { void (blitzBusy ? cancelQueue("blitz") : runQueue("blitz")); }} style={({ pressed }) => [styles.blitzCard, pressed && styles.pressed]}>
        <View style={styles.blitzStrip} />
        <View style={styles.quickContent}>
          <Text style={styles.blitzKicker}>{tr.blitz.rankedTag} · {tr.blitz.rules}</Text>
          <Text style={styles.blitzTitle}>{blitzBusy ? tr.blitz.waiting : tr.blitz.action}</Text>
          <Text style={styles.blitzCopy}>{blitzBusy ? tr.blitz.cancel : tr.blitz.copy}</Text>
          {!!profile && <Text style={styles.blitzCups}>{profile.blitzTrophies} {tr.common.blitzTrophies}</Text>}
        </View>
        <View style={styles.quickAction}>{blitzBusy ? <ActivityIndicator color={colors.floodlight} /> : <Text style={styles.blitzArrow}>⚡</Text>}</View>
      </Pressable>
      {!!queueNote && !quickBusy && !blitzBusy && !eventBusy && <Text style={styles.queueNote}>{queueNote}</Text>}
      <DailyQuestsCard />
      <Pressable accessibilityRole="button" onPress={() => router.push("/album")} style={({ pressed }) => [styles.albumCard, pressed && styles.pressed]}>
        <Text style={styles.albumKicker}>{tr.album.kicker}</Text>
        <Text style={styles.albumTitle}>{tr.album.openCta}</Text>
        <Text style={styles.albumCopy}>{tr.album.note}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tr.lobby.botA11y} onPress={() => startBotMatch(false)} style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
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
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, topbarActions: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 }, brandBadge: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.pitchLine, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, brandMark: { color: colors.floodlight, fontSize: 11, fontWeight: "900", letterSpacing: 1 }, playerChip: { flexShrink: 1, flexDirection: "row", gap: 7, alignItems: "center", backgroundColor: "rgba(16,34,46,0.88)", borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 }, online: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, playerText: { flexShrink: 1, gap: 1 }, playerName: { color: colors.text, fontWeight: "800", fontSize: 11 }, playerCode: { color: colors.muted, fontWeight: "700", fontSize: 9, letterSpacing: .3 }, menuDots: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heading: { marginTop: 7 }, kicker: { color: colors.primary, fontWeight: "900", fontSize: 10, letterSpacing: 2.2 }, title: { color: colors.text, fontSize: 40, lineHeight: 43, fontWeight: "900", letterSpacing: -1.5, marginTop: 10, maxWidth: 320 }, headingRule: { height: 1, backgroundColor: colors.border, marginTop: 18, justifyContent: "center" }, headingSpot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal, marginLeft: 26 },
  quickCard: { backgroundColor: colors.floodlight, borderRadius: 16, minHeight: 104, flexDirection: "row", alignItems: "stretch", overflow: "hidden", shadowColor: "#000", shadowOpacity: .22, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 }, signalStrip: { width: 8, backgroundColor: colors.signal }, quickContent: { flex: 1, paddingHorizontal: 17, paddingVertical: 15, justifyContent: "center" }, quickKicker: { color: colors.signal, fontSize: 8, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6 }, quickTitle: { color: colors.ink, fontWeight: "900", fontSize: 20, letterSpacing: -.3 }, quickCopy: { color: colors.ink, opacity: 0.62, fontSize: 12, marginTop: 4 }, rankedCups: { color: colors.ink, opacity: 0.7, fontSize: 11, fontWeight: "800", marginTop: 6 }, quickAction: { width: 54, borderLeftWidth: 1, borderLeftColor: "rgba(8,23,32,.14)", alignItems: "center", justifyContent: "center" }, quickArrow: { color: colors.ink, fontSize: 26 }, queueNote: { color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: -8 },
  blitzCard: { backgroundColor: "#1A1028", borderRadius: 16, minHeight: 104, flexDirection: "row", alignItems: "stretch", overflow: "hidden", borderWidth: 1, borderColor: "#6B4DFF" }, blitzStrip: { width: 8, backgroundColor: "#8B6CFF" }, blitzKicker: { color: "#B896FF", fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginBottom: 6 }, blitzTitle: { color: colors.floodlight, fontWeight: "900", fontSize: 20, letterSpacing: -.3 }, blitzCopy: { color: colors.muted, fontSize: 12, marginTop: 4 }, blitzCups: { color: "#B896FF", fontSize: 11, fontWeight: "800", marginTop: 6 }, blitzArrow: { color: "#B896FF", fontSize: 22 },
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
