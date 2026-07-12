import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AccessibilityInfo, Alert, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import type { Club, EmoteId, QuickMessageId, ServerMessage } from "@football-link/shared";
import { EMOTE_GLYPHS } from "@football-link/shared";
import { normalizeAnswer } from "@football-link/answer-normalizer";
import { colors } from "@/theme/colors";
import { useMatchSocket } from "@/match/use-match-socket";
import { clearActiveMatch, saveActiveMatch } from "@/match/active-match";
import { locale, tr } from "@/i18n";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";
import { getChatStyle, type ChatStyleId } from "@/cosmetics/chat-style";
import { freeEmotesFallback, loadOwnedEmotes, type OwnedEmote } from "@/cosmetics/emotes";
import { badgeGlyph, defaultLoadout, getCosmeticLoadout, pitchThemes, type CosmeticLoadout } from "@/cosmetics/loadout";
import { playSfx, preloadSounds, stopLobbyMusic } from "@/audio/sounds";

type UiPhase = "WAITING" | "READY" | "SELECTING" | "COUNTDOWN" | "ANSWERING" | "REVEAL" | "FINISHED" | "PAUSED";
type AnswerFeedback = "correct" | "wrong" | null;
type PlayerCard = { player_id: string; display_name: string; player_code: string; trophies: number; form: string[] };
type QuickMessageState = {
  eventId: string;
  playerId: string;
  kind: "TEXT" | "EMOJI";
  messageId?: QuickMessageId;
  emoteId?: EmoteId;
  styleId: string;
};
type ViewState = { phase: UiPhase; pool: Club[]; searchableClubs: Club[]; deadline: number | null; reveal: Record<string, unknown> | undefined; result: Record<string, unknown> | undefined; round: number; locked: boolean; teams: string[]; selectionCycle: number; scores: Record<string, number>; error: string | undefined; selectionNotice: string | undefined; rematchOfferId: string | undefined; rematchPending: boolean; lastSecond: boolean; answerFeedback: AnswerFeedback; suddenDeath: boolean; suddenDeathPulse: number; playerCards: PlayerCard[]; answerChoices: string[]; choiceMode: boolean; matchMode: string; winningScore: number; quickMessage: QuickMessageState | undefined };
const initial: ViewState = { phase: "WAITING", pool: [], searchableClubs: [], deadline: null, reveal: undefined, result: undefined, round: 0, locked: false, teams: [], selectionCycle: 0, scores: {}, error: undefined, selectionNotice: undefined, rematchOfferId: undefined, rematchPending: false, lastSecond: false, answerFeedback: null, suddenDeath: false, suddenDeathPulse: 0, playerCards: [], answerChoices: [], choiceMode: false, matchMode: "FRIEND", winningScore: 3, quickMessage: undefined };
const parsePlayerCards = (value: unknown): PlayerCard[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.player_id !== "string") return [];
    return [{
      player_id: row.player_id,
      display_name: typeof row.display_name === "string" ? row.display_name : "Player",
      player_code: typeof row.player_code === "string" ? row.player_code : "",
      trophies: Number(row.trophies ?? 0),
      form: Array.isArray(row.form) ? row.form.map(String) : [],
    }];
  });
};
const phaseLabels: Record<UiPhase, string> = tr.match.phases;
const errorLabels: Record<string, string> = tr.match.errors;
const clubSearchText = locale === "tr" ? { a11y: "Takım ara", placeholder: "Takım adını yaz…", choose: "SEÇ", notFound: "Bu adla seçilebilir bir takım bulunamadı.", suggestions: "6 RASTGELE ÖNERİ" } : { a11y: "Search clubs", placeholder: "Enter a club name…", choose: "PICK", notFound: "No selectable club matches this name.", suggestions: "6 RANDOM PICKS" };
const friendlyError = (code: unknown) => {
  const value = String(code ?? "UNKNOWN");
  if (value === "EMOTE_COOLDOWN") return tr.effects.cooldown;
  if (value === "EMOTE_NOT_OWNED" || value === "INVALID_EMOTE") return tr.emotes.notOwned;
  return errorLabels[value] ?? (value.startsWith("INVALID_PHASE") ? errorLabels.INVALID_PHASE! : tr.match.errors.fallback);
};
const selectionError = (reason: unknown) => ({ SAME_CLUB: tr.selection.sameClub, PAIR_ALREADY_USED: tr.selection.usedPair, NO_COMMON_PLAYER: tr.selection.noCommonPlayer }[String(reason)] ?? tr.selection.fallback);

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduced); const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced); return () => subscription.remove(); }, []);
  return reduced;
}

function reconnectState(state: ViewState, payload: Record<string, unknown>): ViewState {
  const phases: Record<string, UiPhase> = { READY_CHECK: "READY", TEAM_SELECTION: "SELECTING", SELECTION_VALIDATION: "SELECTING", COUNTDOWN: "COUNTDOWN", ANSWERING: "ANSWERING", REVEAL: "REVEAL", SUDDEN_DEATH: "COUNTDOWN", FINISHED: "FINISHED", PAUSED: "PAUSED" };
  const phase = phases[String(payload.phase)] ?? state.phase;
  const selections = (payload.selections ?? {}) as Record<string, unknown>;
  const teams = phase === "SELECTING" ? [] : Object.values(selections).filter((value): value is string => typeof value === "string");
  const winnerId = typeof payload.winnerId === "string" ? payload.winnerId : null;
  return { ...state, phase, pool: Array.isArray(payload.pool) ? payload.pool as Club[] : state.pool, searchableClubs: Array.isArray(payload.searchable_clubs) ? payload.searchable_clubs as Club[] : state.searchableClubs, teams, scores: (payload.scores ?? state.scores) as Record<string, number>, round: Number(payload.normalRound ?? state.round), deadline: payload.deadline == null ? null : Number(payload.deadline), locked: Boolean(payload.confirmed), suddenDeath: payload.suddenDeath === true || state.suddenDeath, result: phase === "FINISHED" ? { winner_id: winnerId } : state.result, error: undefined };
}

function reduceEvents(events: ServerMessage[]): ViewState {
  return events.reduce<ViewState>((state, event) => {
    const payload = event.payload;
    switch (event.event_type) {
      case "READY_CHECK_STARTED": {
        const rules = (payload.rules ?? {}) as Record<string, unknown>;
        return {
          ...state,
          phase: "READY",
          deadline: Number(payload.deadline),
          playerCards: parsePlayerCards(payload.player_cards).length ? parsePlayerCards(payload.player_cards) : state.playerCards,
          matchMode: typeof payload.match_mode === "string" ? payload.match_mode : state.matchMode,
          winningScore: Number(rules.winning_score ?? state.winningScore) || state.winningScore,
        };
      }
      case "MATCH_STARTED": return {
        ...state,
        playerCards: parsePlayerCards(payload.player_cards).length ? parsePlayerCards(payload.player_cards) : state.playerCards,
        matchMode: typeof payload.match_mode === "string" ? payload.match_mode : state.matchMode,
      };
      case "TEAM_POOL_CREATED": return { ...state, pool: (payload.clubs ?? []) as Club[], searchableClubs: (payload.searchable_clubs ?? payload.clubs ?? []) as Club[] };
      case "TEAM_SELECTION_STARTED": return { ...state, phase: "SELECTING", deadline: Number(payload.deadline), locked: false, lastSecond: false, answerFeedback: null, reveal: undefined, teams: [], selectionCycle: state.selectionCycle + 1, error: undefined, answerChoices: [], choiceMode: false };
      case "TEAM_SELECTION_LOCKED": return { ...state, locked: true };
      case "TEAM_SELECTION_INVALID": return { ...state, selectionNotice: selectionError(payload.reason) };
      case "TEAMS_REVEALED": return { ...state, teams: payload.club_ids as string[] };
      case "SUDDEN_DEATH_STARTED": {
        const clubs = Array.isArray(payload.clubs) ? (payload.clubs as Club[]) : [];
        const clubIds = clubs.map(club => club.id).filter(Boolean);
        return {
          ...state,
          suddenDeath: true,
          suddenDeathPulse: state.suddenDeathPulse + 1,
          teams: clubIds.length === 2 ? clubIds : state.teams,
          searchableClubs: clubs.length ? [...state.searchableClubs.filter(existing => !clubs.some(club => club.id === existing.id)), ...clubs] : state.searchableClubs,
          reveal: undefined,
          answerFeedback: null,
          lastSecond: false,
        };
      }
      case "COUNTDOWN_STARTED": return { ...state, phase: "COUNTDOWN", deadline: Number(payload.deadline) };
      case "ANSWER_PHASE_STARTED": {
        const choices = Array.isArray(payload.choices) ? payload.choices.map(String).filter(Boolean) : [];
        return {
          ...state,
          phase: "ANSWERING",
          deadline: Number(payload.deadline),
          locked: false,
          answerFeedback: null,
          lastSecond: false,
          answerChoices: choices,
          choiceMode: payload.input_mode === "CHOICE" && choices.length >= 2,
        };
      }
      case "ANSWER_ACCEPTED": return { ...state, locked: true, lastSecond: payload.last_second === true, answerFeedback: payload.correct === true ? "correct" : payload.correct === false ? "wrong" : null };
      case "QUICK_MESSAGE": {
        if (typeof payload.player_id !== "string") return state;
        const styleId = typeof payload.chat_style_id === "string" ? payload.chat_style_id : "chat-classic";
        if (payload.kind === "EMOJI" || typeof payload.emote_id === "string") {
          if (typeof payload.emote_id !== "string") return state;
          return {
            ...state,
            quickMessage: {
              eventId: event.event_id,
              playerId: payload.player_id,
              kind: "EMOJI",
              emoteId: payload.emote_id as EmoteId,
              styleId,
            },
          };
        }
        if (typeof payload.message_id !== "string") return state;
        return {
          ...state,
          quickMessage: {
            eventId: event.event_id,
            playerId: payload.player_id,
            kind: "TEXT",
            messageId: payload.message_id as QuickMessageId,
            styleId,
          },
        };
      }
      case "REVEAL_STARTED": return { ...state, phase: "REVEAL", deadline: payload.reveal_deadline == null ? null : Number(payload.reveal_deadline), reveal: { ...payload, sudden_death: state.suddenDeath }, answerFeedback: null };
      case "SCORE_UPDATED": return { ...state, scores: payload.scores as Record<string, number> };
      case "NEXT_ROUND": return { ...state, round: Number(payload.round ?? state.round + 1) };
      case "MATCH_PAUSED": return { ...state, phase: "PAUSED", deadline: Number(payload.reconnect_deadline) };
      case "PLAYER_RECONNECTED": return reconnectState(state, payload);
      case "MATCH_FINISHED": return { ...state, phase: "FINISHED", deadline: null, result: { ...payload, sudden_death: state.suddenDeath } };
      case "REMATCH_REQUESTED": return { ...state, rematchPending: true };
      case "REMATCH_OFFER": return { ...state, rematchOfferId: typeof payload.match_id === "string" ? payload.match_id : "pending" };
      case "REMATCH_DECLINED": return { ...state, rematchPending: false };
      case "ERROR": return { ...state, error: friendlyError(payload.code) };
      default: return state;
    }
  }, initial);
}

export default function Match() {
  const { playerId = "player", matchId = "dev-room", mode, resume, tutorial } = useLocalSearchParams<{ playerId: string; matchId: string; mode?: string; resume?: string; tutorial?: string }>();
  const botMode = mode === "bot";
  const blitzMode = mode === "blitz";
  const eventMode = mode === "event";
  const tutorialMode = botMode && tutorial === "1";
  const socketMode = botMode ? "bot" as const : blitzMode ? "blitz" as const : eventMode ? "event" as const : mode === "quick" ? "quick" as const : undefined;
  const rankedKind = blitzMode ? "blitz" as const : mode === "quick" ? "quick" as const : null;
  const { profile, refreshProfile } = useAuth();
  const { connected, error: connectionError, events, send } = useMatchSocket(matchId, playerId, socketMode, resume === "1");
  const state = useMemo(() => reduceEvents(events), [events]);
  const [selected, setSelected] = useState<string>();
  const [clubQuery, setClubQuery] = useState("");
  const [chosenClubIds, setChosenClubIds] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [now, setNow] = useState(Date.now());
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [polledRematchOffer, setPolledRematchOffer] = useState(false);
  const [chatStyleId, setChatStyleId] = useState<ChatStyleId>("chat-classic");
  const [cosmeticLoadout, setCosmeticLoadout] = useState<CosmeticLoadout>(defaultLoadout);
  const [ownedEmotes, setOwnedEmotes] = useState<OwnedEmote[]>(freeEmotesFallback());
  const [emoteTrayOpen, setEmoteTrayOpen] = useState(false);
  const [readySent, setReadySent] = useState(false);
  const [confettiKey, setConfettiKey] = useState<string>();
  const [showSuddenDeath, setShowSuddenDeath] = useState(false);
  const [trophyBefore, setTrophyBefore] = useState<number | null>(null);
  const [trophyAfter, setTrophyAfter] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const stageEntrance = useRef(new Animated.Value(1)).current;
  const handledSuddenDeath = useRef(0);
  const finishedHandled = useRef(false);
  const lastTickSecond = useRef<number | null>(null);
  const finishSfxPlayed = useRef(false);
  const kickoffWhistlePlayed = useRef(false);
  useEffect(() => {
    void stopLobbyMusic();
    void preloadSounds();
  }, []);
  useEffect(() => {
    // First transition into club selection = match kickoff.
    if (state.phase !== "SELECTING" || kickoffWhistlePlayed.current) return;
    kickoffWhistlePlayed.current = true;
    void playSfx("whistle");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [state.phase]);
  useEffect(() => { void saveActiveMatch(botMode ? { matchId, playerId, mode: "bot" } : { matchId, playerId }); }, [botMode, matchId, playerId]);
  useEffect(() => { if (botMode) return; void supabase.rpc("social_set_presence", { p_state: "IN_MATCH" }); return () => { void supabase.rpc("social_set_presence", { p_state: "ONLINE" }); }; }, [botMode]);
  useEffect(() => {
    if (botMode) return;
    let alive = true;
    void Promise.all([getChatStyle(), getCosmeticLoadout(), loadOwnedEmotes().catch(() => freeEmotesFallback())]).then(([style, loadout, emotes]) => {
      if (!alive) return;
      setChatStyleId(style);
      setCosmeticLoadout(loadout);
      setOwnedEmotes(emotes.length ? emotes : freeEmotesFallback());
    });
    return () => { alive = false; };
  }, [botMode]);
  useEffect(() => { if (state.phase === "FINISHED") void clearActiveMatch(); }, [state.phase]);
  useEffect(() => { if (state.phase !== "READY") setReadySent(false); }, [state.phase]);
  useEffect(() => {
    if (!rankedKind || !profile) return;
    if (trophyBefore != null) return;
    setTrophyBefore(rankedKind === "blitz" ? profile.blitzTrophies : profile.trophies);
  }, [profile, rankedKind, trophyBefore]);
  useEffect(() => {
    if (state.phase !== "FINISHED" || !rankedKind || finishedHandled.current) return;
    finishedHandled.current = true;
    void (async () => {
      await refreshProfile();
      // small delay so auth context profile is fresh
      await new Promise(resolve => setTimeout(resolve, 150));
      const { data } = await supabase.from("profiles").select("trophies,blitz_trophies").eq("id", playerId).single();
      if (data) setTrophyAfter(rankedKind === "blitz" ? data.blitz_trophies : data.trophies);
    })();
  }, [state.phase, rankedKind, refreshProfile, playerId]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => { if (state.phase === "SELECTING") { setSelected(undefined); setClubQuery(""); setAnswer(""); } }, [state.phase, state.selectionCycle]);
  useEffect(() => { if (reducedMotion) { stageEntrance.setValue(1); return; } stageEntrance.setValue(0); Animated.timing(stageEntrance, { toValue: 1, duration: 240, useNativeDriver: true }).start(); }, [reducedMotion, stageEntrance, state.phase, state.round]);
  useEffect(() => { if (state.teams.length === 2 && selected) setChosenClubIds(old => old.includes(selected) ? old : [...old, selected]); }, [selected, state.teams]);
  const acceptedEvent = events.filter(event => event.event_type === "ANSWER_ACCEPTED").at(-1);
  const revealEvent = events.filter(event => event.event_type === "REVEAL_STARTED").at(-1);
  const handledAccepted = useRef<string | undefined>(undefined); const handledReveal = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!acceptedEvent?.event_id || handledAccepted.current === acceptedEvent.event_id) return;
    handledAccepted.current = acceptedEvent.event_id;
    if (acceptedEvent.payload.correct === false) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      void playSfx("wrong");
    } else if (acceptedEvent.payload.last_second === true) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      void playSfx("correct");
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void playSfx("correct");
    }
  }, [acceptedEvent]);
  useEffect(() => {
    if (!revealEvent?.event_id || handledReveal.current === revealEvent.event_id) return;
    handledReveal.current = revealEvent.event_id;
    const submissions = (revealEvent.payload.submissions ?? []) as { player_id?: string; correct?: boolean }[];
    if (revealEvent.payload.round_winner_id === playerId) {
      setConfettiKey(revealEvent.event_id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (submissions.some(item => item.player_id === playerId && item.correct === false)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [playerId, revealEvent]);
  useEffect(() => {
    if (!state.suddenDeathPulse || handledSuddenDeath.current === state.suddenDeathPulse) return;
    handledSuddenDeath.current = state.suddenDeathPulse;
    setShowSuddenDeath(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    void playSfx("sudden_death");
    const timer = setTimeout(() => setShowSuddenDeath(false), reducedMotion ? 900 : 1_800);
    return () => clearTimeout(timer);
  }, [reducedMotion, state.suddenDeathPulse]);
  useEffect(() => {
    if (state.phase !== "FINISHED" || finishSfxPlayed.current) return;
    finishSfxPlayed.current = true;
    void playSfx("finish");
  }, [state.phase]);
  useEffect(() => {
    if (!state.quickMessage?.eventId) return;
    void playSfx("emote");
  }, [state.quickMessage?.eventId]);
  useEffect(() => {
    if (botMode || state.phase !== "FINISHED" || state.rematchOfferId) return;
    let alive = true;
    const check = async () => {
      const { data } = await supabase.from("rematch_offers").select("id").eq("recipient_id", playerId).eq("room_key", matchId).eq("status", "PENDING").gt("expires_at", new Date().toISOString()).limit(1);
      if (alive && !!data?.length) setPolledRematchOffer(true);
    };
    void check(); const timer = setInterval(() => { void check(); }, 2_000);
    return () => { alive = false; clearInterval(timer); };
  }, [botMode, matchId, playerId, state.phase, state.rematchOfferId]);
  const seconds = state.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;
  useEffect(() => {
    // COUNTDOWN = round kickoff 3-2-1; ANSWERING = urgency ticks on last 3s.
    if (seconds == null || seconds <= 0) {
      lastTickSecond.current = null;
      return;
    }
    const countdownTick = state.phase === "COUNTDOWN";
    const answerUrgencyTick = state.phase === "ANSWERING" && seconds <= 3;
    if (!countdownTick && !answerUrgencyTick) {
      lastTickSecond.current = null;
      return;
    }
    if (lastTickSecond.current === seconds) return;
    lastTickSecond.current = seconds;
    void playSfx("tick");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [seconds, state.phase]);
  const normalizedClubQuery = normalizeAnswer(clubQuery);
  const clubResults = useMemo(() => normalizedClubQuery.length < 2 ? [] : state.searchableClubs.filter(club => !chosenClubIds.includes(club.id) && normalizeAnswer(club.name).includes(normalizedClubQuery)).sort((a, b) => {
    const aName = normalizeAnswer(a.name); const bName = normalizeAnswer(b.name);
    return Number(bName.startsWith(normalizedClubQuery)) - Number(aName.startsWith(normalizedClubQuery)) || a.name.localeCompare(b.name, "tr");
  }).slice(0, 6), [chosenClubIds, normalizedClubQuery, state.searchableClubs]);
  const selectedClub = state.searchableClubs.find(club => club.id === selected);
  const showClubResults = !state.locked && normalizedClubQuery.length >= 2 && normalizeAnswer(selectedClub?.name ?? "") !== normalizedClubQuery;
  const chooseClub = (club: Club) => { setSelected(club.id); setClubQuery(club.name); };
  const changeClubQuery = (value: string) => { setClubQuery(value); if (normalizeAnswer(selectedClub?.name ?? "") !== normalizeAnswer(value)) setSelected(undefined); };
  const submit = (value = answer) => { if (value.trim() && !state.locked) send("ANSWER_SUBMIT", { answer: value.trim() }); };
  const pickChoice = (value: string) => {
    if (state.locked) return;
    setAnswer(value);
    submit(value);
  };
  const confirmSelection = () => { if (!selected || state.locked) return; send("TEAM_SELECT", { club_id: selected }); send("TEAM_CONFIRM"); };
  const clubName = (id: string) => state.searchableClubs.find(club => club.id === id)?.name ?? state.pool.find(club => club.id === id)?.name ?? id;
  const clubInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("tr-TR")).join("");
  const opponentId = botMode ? "test-bot" : state.playerCards.find(card => card.player_id !== playerId)?.player_id ?? Object.keys(state.scores).find(id => id !== playerId);
  const playerScore = state.scores[playerId] ?? 0;
  const opponentScore = opponentId ? state.scores[opponentId] ?? 0 : 0;
  const myCard = state.playerCards.find(card => card.player_id === playerId);
  const opponentCard = state.playerCards.find(card => card.player_id !== playerId);
  const pitchTheme = pitchThemes[cosmeticLoadout.pitch.itemId] ?? pitchThemes["pitch-classic"]!;
  const exitMatch = () => Alert.alert(tr.match.exitTitle, tr.match.exitCopy, [{ text: tr.match.stay, style: "cancel" }, { text: tr.match.exit, style: "destructive", onPress: () => { send("LEAVE_MATCH"); void clearActiveMatch().finally(() => router.replace({ pathname: "/lobby", params: { playerId } })); } }]);
  const submitReport = async (reason: "WRONG_RESULT" | "OFFENSIVE_CONTENT" | "OTHER") => {
    if (reporting || reported || botMode) return;
    setReporting(true);
    const { error } = await supabase.rpc("submit_result_report", { p_room_key: matchId, p_round_ordinal: Math.max(1, state.round), p_reason_code: reason });
    setReporting(false);
    if (error) Alert.alert(tr.report.failed); else { setReported(true); Alert.alert(tr.report.sent); }
  };
  const openReport = () => Alert.alert(tr.report.title, undefined, [
    { text: tr.report.wrongResult, onPress: () => { void submitReport("WRONG_RESULT"); } },
    { text: tr.report.offensiveContent, onPress: () => { void submitReport("OFFENSIVE_CONTENT"); } },
    { text: tr.report.otherIssue, onPress: () => { void submitReport("OTHER"); } },
    { text: tr.report.cancel, style: "cancel" },
  ]);
  const requestRematch = () => { send("REMATCH_REQUEST"); };
  const modeLabel = botMode
    ? tr.match.bot
    : eventMode || state.matchMode === "EVENT"
      ? tr.event.badge
      : blitzMode || state.matchMode === "BLITZ"
        ? tr.blitz.action
        : mode === "quick"
          ? tr.quick.action
          : tr.lobby.friendRoom;
  const winTarget = blitzMode || state.matchMode === "BLITZ" ? Math.max(2, state.winningScore) : Math.max(3, state.winningScore);
  const shareResult = async () => {
    const winnerId = state.result?.winner_id;
    const outcome = winnerId === playerId ? tr.share.win : winnerId ? tr.share.loss : playerScore === opponentScore ? tr.share.draw : playerScore > opponentScore ? tr.share.win : tr.share.loss;
    await Share.share({
      title: tr.share.matchTitle,
      message: tr.share.matchMessage({
        outcome,
        myScore: playerScore,
        oppScore: opponentScore,
        mode: modeLabel,
        rounds: Math.max(1, state.round),
      }),
    });
  };
  const rematchStartId = events.filter(event => event.event_type === "REMATCH_STARTED").at(-1)?.payload.match_id;
  useEffect(() => { if (typeof rematchStartId === "string") router.replace({ pathname: "/match", params: { playerId, matchId: rematchStartId } }); }, [playerId, rematchStartId]);
  const rematchDeclined = events.filter(event => event.event_type === "REMATCH_DECLINED").at(-1)?.event_id;
  const handledDecline = useRef<string | undefined>(undefined);
  useEffect(() => { if (rematchDeclined && handledDecline.current !== rematchDeclined) { handledDecline.current = rematchDeclined; Alert.alert(tr.rematch.declined); } }, [rematchDeclined]);

  return <SafeAreaView style={[styles.safe, { backgroundColor: pitchTheme.background }]}>
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View pointerEvents="none" style={[styles.pitchAtmosphere, { borderColor: pitchTheme.line, backgroundColor: pitchTheme.haze }]}><View style={[styles.atmosphereCircle, { borderColor: pitchTheme.line }]} /><View style={[styles.atmosphereHalf, { backgroundColor: pitchTheme.line }]} /></View>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr.match.exit} onPress={exitMatch} hitSlop={12}><Text style={styles.close}>×</Text></Pressable>
        <View style={styles.connection}><View style={[styles.dot, { backgroundColor: connected ? colors.primary : colors.danger }]} /><Text style={styles.connectionText}>{connected ? tr.match.live : tr.match.connecting}</Text></View>
        <View style={styles.roundWrap}>{state.suddenDeath && <Text style={styles.sdBadge}>{tr.effects.suddenDeathBadge}</Text>}<Text style={styles.round}>R{Math.max(1, state.round)}</Text></View>
      </View>

      <View style={styles.scoreboardWrap}><View style={[styles.scoreboard, { backgroundColor: pitchTheme.surface, borderColor: state.suddenDeath ? colors.signal : pitchTheme.line }]}>
        <View style={styles.side}><View style={styles.playerIdentity}><Text numberOfLines={1} style={styles.sideName}>{tr.match.you}</Text><PlayerBadge itemId={cosmeticLoadout.badge.itemId} name={cosmeticLoadout.badge.name} accent={cosmeticLoadout.badge.accent} /></View><View><Text style={styles.score}>{playerScore}</Text><ScorePips score={playerScore} target={winTarget} reducedMotion={reducedMotion} accent={pitchTheme.accent} /></View></View>
        <View style={styles.matchMeta}><Text style={[styles.phase, { color: state.suddenDeath ? colors.signal : (eventMode || state.matchMode === "EVENT" ? "#F4C95D" : blitzMode || state.matchMode === "BLITZ" ? "#B896FF" : pitchTheme.accent) }]}>{(eventMode || state.matchMode === "EVENT") && state.phase !== "FINISHED" ? tr.event.badge : (blitzMode || state.matchMode === "BLITZ") && state.phase !== "FINISHED" ? tr.blitz.badge : state.suddenDeath && state.phase !== "FINISHED" && state.phase !== "REVEAL" ? tr.effects.suddenDeath : phaseLabels[state.phase]}</Text><View style={[styles.midfield, { backgroundColor: pitchTheme.line }]}><View style={[styles.centerCircle, { borderColor: pitchTheme.accent, backgroundColor: pitchTheme.surface }]} /></View>{seconds !== null && <Text style={styles.timer}>{seconds}<Text style={styles.timerUnit}>{tr.match.seconds}</Text></Text>}</View>
        <View style={[styles.side, styles.sideRight]}><Text numberOfLines={1} style={styles.sideName}>{botMode ? tr.match.bot : tr.match.opponent}</Text><View style={styles.rightScore}><Text style={styles.score}>{opponentScore}</Text><ScorePips score={opponentScore} target={winTarget} align="right" reducedMotion={reducedMotion} accent={pitchTheme.accent} /></View></View>
      </View><ChatBubble message={state.quickMessage} playerId={playerId} reducedMotion={reducedMotion} /><ConfettiBurst burstKey={confettiKey} reducedMotion={reducedMotion} /></View>
      {state.suddenDeath && !showSuddenDeath && state.phase !== "FINISHED" && <View style={styles.sdStrip}><Text style={styles.sdStripText}>{tr.effects.suddenDeath}</Text><Text style={styles.sdStripCopy}>{tr.effects.suddenDeathCopy}</Text></View>}

      {(eventMode || state.matchMode === "EVENT") && state.phase !== "FINISHED" && <View style={styles.eventStrip}><Text style={styles.eventStripText}>{tr.event.badge}</Text><Text style={styles.eventStripCopy}>{tr.event.unranked}</Text></View>}
      {botMode && state.phase !== "ANSWERING" && <View style={styles.testStrip}><Text style={styles.testStripText}>{tutorialMode ? tr.tutorial.banner : tr.match.testMatch}</Text><Text style={styles.testStripCopy}>{tutorialMode ? tr.tutorial.copy : tr.match.testMatchCopy}</Text></View>}
      {tutorialMode && state.phase === "SELECTING" && <View style={styles.tipStrip}><Text style={styles.tipText}>{tr.tutorial.tipSelect}</Text></View>}
      {tutorialMode && state.phase === "ANSWERING" && <View style={styles.tipStrip}><Text style={styles.tipText}>{tr.tutorial.tipAnswer}</Text></View>}
      {tutorialMode && (state.phase === "REVEAL" || state.phase === "FINISHED") && <View style={styles.tipStrip}><Text style={styles.tipText}>{state.phase === "FINISHED" ? tr.tutorial.done : tr.tutorial.tipReveal}</Text></View>}
      {(state.error || connectionError) && <View style={styles.error}><Text style={styles.errorText}>{state.error || connectionError}</Text></View>}
      {!botMode && state.phase !== "FINISHED" && (
        <MatchReactBar
          open={emoteTrayOpen}
          onToggle={() => setEmoteTrayOpen(value => !value)}
          emotes={ownedEmotes}
          onSendText={id => {
            setEmoteTrayOpen(false);
            send("EMOTE_SEND", { kind: "TEXT", message_id: id, chat_style_id: chatStyleId });
          }}
          onSendEmote={id => {
            setEmoteTrayOpen(false);
            send("EMOTE_SEND", { kind: "EMOJI", emote_id: id, chat_style_id: chatStyleId });
          }}
        />
      )}

      <Animated.View style={[styles.stage, state.phase === "ANSWERING" && styles.answeringStage, { opacity: stageEntrance, transform: [{ translateY: stageEntrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
        {state.phase === "WAITING" && <Centered title={tr.match.fieldPreparing} copy={botMode ? tr.match.botConnecting : tr.match.playerNeeded} />}
        {state.phase === "READY" && <Centered title={botMode ? tr.match.botReady : tr.match.opponentFound} copy={readySent ? tr.match.readyWaiting : tr.match.readyCopy}>
          {!botMode && (myCard || opponentCard) && <View style={styles.cardRow}>
            {myCard && <OpponentCardView card={myCard} mine />}
            {opponentCard && <OpponentCardView card={opponentCard} />}
          </View>}
          <ActionButton
            label={readySent ? tr.match.readySent : tr.match.readyAction}
            confirmed={readySent}
            disabled={readySent}
            onPress={() => {
              if (readySent) return;
              setReadySent(true);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              send("READY_CONFIRM");
            }}
          />
        </Centered>}
        {state.phase === "SELECTING" && <View style={styles.selection}>
          <Text style={styles.stageKicker}>{tr.match.pool(state.pool.filter(club => !chosenClubIds.includes(club.id)).length)}</Text><Text style={styles.stageTitle}>{tr.match.buildLink}</Text><Text style={styles.stageCopy}>{botMode ? tr.match.selectionBot : tr.match.selectionPlayer}</Text>
          {!!state.selectionNotice && <View accessibilityRole="alert" style={styles.selectionNotice}><Text style={styles.selectionNoticeText}>{state.selectionNotice}</Text></View>}
          <View style={styles.clubSearch}>
            <View style={[styles.clubSearchField, !!selected && styles.clubSearchFieldSelected]}><Text style={styles.searchGlyph}>⌕</Text><TextInput accessibilityLabel={clubSearchText.a11y} value={clubQuery} onChangeText={changeClubQuery} editable={!state.locked} autoCorrect={false} autoCapitalize="words" returnKeyType="done" placeholder={clubSearchText.placeholder} placeholderTextColor={colors.muted} style={styles.clubSearchInput} />{!!selected && <Text style={styles.searchValid}>✓</Text>}</View>
            {showClubResults && <View style={styles.clubResults}>{clubResults.length ? clubResults.map(club => <Pressable key={club.id} accessibilityRole="button" onPress={() => chooseClub(club)} style={({ pressed }) => [styles.clubResult, pressed && styles.pressed]}><View style={styles.resultMonogram}><Text style={styles.resultMonogramText}>{clubInitials(club.name)}</Text></View><Text style={styles.clubResultName}>{club.name}</Text><Text style={styles.clubResultAction}>{clubSearchText.choose}</Text></Pressable>) : <Text style={styles.clubNoResult}>{clubSearchText.notFound}</Text>}</View>}
          </View>
          <Text style={styles.suggestionLabel}>{clubSearchText.suggestions}</Text>
          <View style={styles.clubGrid}>{state.pool.map((club, index) => <ClubCard key={club.id} club={club} index={index} used={chosenClubIds.includes(club.id)} selected={selected === club.id} locked={state.locked} reducedMotion={reducedMotion} initials={clubInitials(club.name)} onPress={() => chooseClub(club)} />)}</View>
          <ActionButton label={state.locked ? tr.match.selectionLocked : tr.match.confirmSelection} disabled={!selected || state.locked} onPress={confirmSelection} />
        </View>}
        {state.teams.length === 2 && state.phase !== "SELECTING" && <View style={styles.versus}><Text style={styles.team}>{clubName(state.teams[0]!)}</Text><Text style={styles.vs}>×</Text><Text style={[styles.team, styles.teamRight]}>{clubName(state.teams[1]!)}</Text></View>}
        {state.phase === "COUNTDOWN" && <CountdownPulse value={seconds} reducedMotion={reducedMotion} />}
        {state.phase === "ANSWERING" && <View style={styles.answerBox}>
          <Text style={styles.stageKicker}>{tr.match.commonPlayer}</Text>
          <Text style={styles.stageTitle}>{tr.match.whoLinks}</Text>
          {botMode && state.choiceMode && <Text style={styles.choiceHint}>{tr.match.choiceHint}</Text>}
          {botMode && state.choiceMode ? (
            <View style={styles.choiceList}>
              {state.answerChoices.map((choice, index) => {
                const selectedChoice = answer === choice;
                const wrong = selectedChoice && state.answerFeedback === "wrong";
                const correct = selectedChoice && state.answerFeedback === "correct";
                return <Pressable key={`${choice}-${index}`} accessibilityRole="button" accessibilityState={{ disabled: state.locked, selected: selectedChoice }} disabled={state.locked} onPress={() => pickChoice(choice)} style={({ pressed }) => [styles.choiceButton, selectedChoice && styles.choiceSelected, wrong && styles.choiceWrong, correct && styles.choiceCorrect, pressed && !state.locked && styles.pressed]}>
                  <Text style={[styles.choiceIndex, (selectedChoice || correct) && styles.choiceIndexOn]}>{String.fromCharCode(65 + index)}</Text>
                  <Text style={[styles.choiceText, (selectedChoice || correct) && styles.choiceTextOn]}>{choice}</Text>
                </Pressable>;
              })}
            </View>
          ) : (
            <>
              <AnswerField value={answer} onChangeText={setAnswer} editable={!state.locked} feedback={state.answerFeedback} reducedMotion={reducedMotion} onSubmit={() => submit()} />
              <ActionButton label={state.locked ? tr.match.answerSent : tr.match.sendAnswer} disabled={!answer.trim() || state.locked} onPress={() => submit()} />
            </>
          )}
          {state.answerFeedback === "wrong" && <View accessibilityRole="alert" style={styles.wrongBanner}><Text style={styles.wrongBannerText}>{tr.effects.wrongAnswer}</Text></View>}
          {state.answerFeedback === "correct" && <View style={styles.correctBanner}><Text style={styles.correctBannerText}>{tr.effects.correctAnswer}</Text></View>}
          {state.lastSecond && <View style={styles.lastSecond}><Text style={styles.lastSecondText}>{tr.effects.lastSecond}</Text></View>}
        </View>}
        {state.phase === "PAUSED" && <Centered title={tr.match.paused} copy={tr.match.pausedCopy} />}
        {state.phase === "REVEAL" && <ResultPanel title={tr.match.roundDone} value={state.reveal} playerId={playerId} reducedMotion={reducedMotion} momentumSeconds={seconds} suddenDeath={state.suddenDeath}>{!botMode && <ReportButton disabled={reporting || reported} onPress={openReport} />}</ResultPanel>}
        {state.phase === "FINISHED" && <ResultPanel title={tr.match.matchDone} value={state.result} playerId={playerId} reducedMotion={reducedMotion} suddenDeath={state.suddenDeath}>
          <ShareCardPreview myScore={playerScore} oppScore={opponentScore} modeLabel={modeLabel} winnerId={typeof state.result?.winner_id === "string" ? state.result.winner_id : null} playerId={playerId} suddenDeath={state.suddenDeath} />
          <TrophyDelta before={trophyBefore} after={trophyAfter} kind={rankedKind ?? (state.matchMode === "BLITZ" ? "blitz" : state.matchMode === "QUICK" ? "quick" : null)} />
          <ShareButton onPress={() => { void shareResult(); }} />
          {!botMode && !blitzMode && !eventMode && <>{state.rematchOfferId || polledRematchOffer ? <RematchOffer onAccept={() => send("REMATCH_ACCEPT")} onDecline={() => send("REMATCH_DECLINE")} /> : <><ReportButton disabled={reporting || reported} onPress={openReport} /><RematchButton disabled={state.rematchPending} onPress={requestRematch} /></>}</>}
          {!botMode && (blitzMode || eventMode) && <ReportButton disabled={reporting || reported} onPress={openReport} />}
          <ActionButton label={botMode ? tr.match.newBotMatch : tr.match.returnCenter} onPress={() => botMode ? router.replace({ pathname: "/match", params: { playerId, matchId: `bot-${playerId}-${Date.now()}`, mode: "bot" } }) : router.replace({ pathname: "/lobby", params: { playerId } })} />
        </ResultPanel>}
      </Animated.View>
    </ScrollView>
    </KeyboardAvoidingView>
    {showSuddenDeath && <SuddenDeathStinger reducedMotion={reducedMotion} onDone={() => setShowSuddenDeath(false)} />}
  </SafeAreaView>;
}

function ActionButton({ label, onPress, disabled = false, confirmed = false }: { label: string; onPress: () => void; disabled?: boolean; confirmed?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: confirmed }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        confirmed && styles.actionConfirmed,
        disabled && !confirmed && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, confirmed && styles.actionConfirmedText]}>{label}</Text>
      <Text style={[styles.actionArrow, confirmed && styles.actionConfirmedText]}>{confirmed ? "✓" : "→"}</Text>
    </Pressable>
  );
}
function TrophyDelta({ before, after, kind }: { before: number | null; after: number | null; kind: "quick" | "blitz" | null }) {
  if (!kind || before == null || after == null) return null;
  const delta = after - before;
  const label = kind === "blitz" ? tr.common.blitzTrophies : tr.common.trophies;
  const tone = delta > 0 ? colors.primary : delta < 0 ? colors.danger : colors.muted;
  const chip = delta > 0 ? tr.ranked.deltaWin(delta) : delta < 0 ? tr.ranked.deltaLoss(Math.abs(delta)) : tr.ranked.noChange;
  return <View style={styles.trophyDelta}>
    <Text style={styles.trophyDeltaLabel}>{tr.ranked.delta(before, after, label)}</Text>
    <Text style={[styles.trophyDeltaChip, { color: tone, borderColor: tone }]}>{chip}</Text>
  </View>;
}
function OpponentCardView({ card, mine = false }: { card: PlayerCard; mine?: boolean }) {
  return <View style={[styles.oppCard, mine && styles.oppCardMine]}>
    <Text style={styles.oppLabel}>{mine ? tr.match.you : tr.match.opponent}</Text>
    <Text numberOfLines={1} style={styles.oppName}>{card.display_name}</Text>
    <Text style={styles.oppCode}>#{card.player_code}</Text>
    <Text style={styles.oppTrophies}>{card.trophies} {tr.common.trophies}</Text>
    {!!card.form.length && <Text style={styles.oppForm}>{card.form.join(" ")}</Text>}
  </View>;
}
function ShareButton({ onPress }: { onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.shareAction, pressed && styles.pressed]}><Text style={styles.shareActionText}>{tr.share.action}</Text></Pressable>; }
function ReportButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.reportAction, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.reportActionText}>{tr.report.action}</Text></Pressable>; }
function RematchButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.rematchAction, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.rematchActionText}>{disabled ? tr.rematch.pending : tr.rematch.action}</Text><Text style={styles.rematchArrow}>↻</Text></Pressable>; }
function RematchOffer({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) { return <View accessibilityRole="alert" style={styles.rematchOffer}><Text style={styles.rematchOfferTitle}>{tr.rematch.offerTitle}</Text><Text style={styles.rematchOfferCopy}>{tr.rematch.offerCopy}</Text><View style={styles.rematchOfferActions}><Pressable accessibilityRole="button" onPress={onDecline} style={({ pressed }) => [styles.rematchDecline, pressed && styles.pressed]}><Text style={styles.rematchDeclineText}>{tr.rematch.decline}</Text></Pressable><Pressable accessibilityRole="button" onPress={onAccept} style={({ pressed }) => [styles.rematchAccept, pressed && styles.pressed]}><Text style={styles.rematchAcceptText}>{tr.rematch.accept}</Text></Pressable></View></View>; }
function ConfettiBurst({ burstKey, reducedMotion }: { burstKey?: string; reducedMotion: boolean }) { const progress = useRef(new Animated.Value(0)).current; useEffect(() => { if (!burstKey || reducedMotion) return; progress.setValue(0); const animation = Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: true }); animation.start(); return () => animation.stop(); }, [burstKey, progress, reducedMotion]); if (!burstKey || reducedMotion) return null; const palette = [colors.primary, colors.accent, "#72C7FF", "#FF8A5C"]; return <View pointerEvents="none" style={styles.confetti}>{Array.from({ length: 12 }, (_, index) => { const angle = (index / 12) * Math.PI * 2; const distance = 58 + (index % 3) * 14; return <Animated.View key={`${burstKey}-${index}`} style={[styles.confettiPiece, { backgroundColor: palette[index % palette.length], opacity: progress.interpolate({ inputRange: [0, .15, .8, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) }, { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${180 + index * 30}deg`] }) }] }]} />; })}</View>; }
const chatThemes: Record<string, { backgroundColor: string; borderColor: string; text: string; label: string }> = { "chat-floodlight": { backgroundColor: "#EAF6FF", borderColor: "#72C7FF", text: "#07151F", label: "#246B8B" }, "chat-derby": { backgroundColor: "#5A211C", borderColor: "#FF8A5C", text: "#FFFFFF", label: "#FFB49B" }, "chat-neon": { backgroundColor: "#2D1E48", borderColor: "#B896FF", text: "#FFFFFF", label: "#77E6FF" } };
function ChatBubble({ message, playerId, reducedMotion }: { message: ViewState["quickMessage"]; playerId: string; reducedMotion: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const eventId = message?.eventId;
  useEffect(() => {
    if (!eventId) return;
    progress.stopAnimation();
    progress.setValue(0);
    if (reducedMotion) { progress.setValue(0.7); return; }
    const animation = Animated.timing(progress, { toValue: 1, duration: 1550, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [eventId, progress, reducedMotion]);
  if (!message) return null;
  const fromYou = message.playerId === playerId;
  const theme = chatThemes[message.styleId];
  const body = message.kind === "EMOJI" && message.emoteId
    ? (EMOTE_GLYPHS[message.emoteId] ?? "•")
    : message.messageId
      ? tr.quickMessages[message.messageId]
      : "";
  const emojiMode = message.kind === "EMOJI";
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.chatBubble,
        fromYou ? styles.chatBubbleYou : styles.chatBubbleOpponent,
        theme && { backgroundColor: theme.backgroundColor, borderColor: theme.borderColor },
        emojiMode && styles.chatBubbleEmoji,
        {
          opacity: progress.interpolate({ inputRange: [0, .12, .78, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, -76] }) },
            { scale: progress.interpolate({ inputRange: [0, .15, 1], outputRange: [.88, 1, 1.04] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.chatBubbleSender, fromYou ? styles.chatBubbleSenderYou : styles.chatBubbleSenderOpponent, theme && { color: theme.label, opacity: 1 }]}>
        {fromYou ? tr.match.you : tr.match.opponent}
      </Text>
      <Text style={[
        styles.chatBubbleText,
        fromYou ? styles.chatBubbleTextYou : styles.chatBubbleTextOpponent,
        theme && { color: theme.text },
        emojiMode && styles.chatBubbleEmojiText,
      ]}>
        {body}
      </Text>
    </Animated.View>
  );
}

function MatchReactBar({
  open,
  onToggle,
  emotes,
  onSendText,
  onSendEmote,
}: {
  open: boolean;
  onToggle: () => void;
  emotes: OwnedEmote[];
  onSendText: (id: QuickMessageId) => void;
  onSendEmote: (id: EmoteId) => void;
}) {
  const textIds: QuickMessageId[] = ["GOOD_LUCK", "NICE_ONE", "SO_CLOSE", "READY"];
  return (
    <View style={styles.quickMessages}>
      <View style={styles.reactBar}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={({ pressed }) => [styles.emoteToggle, open && styles.emoteToggleOpen, pressed && styles.pressed]}>
          <Text style={styles.emoteToggleGlyph}>😊</Text>
          <Text style={styles.emoteToggleText}>{tr.emotes.toggle}</Text>
        </Pressable>
        <View style={styles.quickMessageButtons}>
          {textIds.map(id => (
            <Pressable key={id} accessibilityRole="button" onPress={() => onSendText(id)} style={({ pressed }) => [styles.quickMessageButton, pressed && styles.pressed]}>
              <Text style={styles.quickMessageText}>{tr.quickMessages[id]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {open && (
        <View style={styles.emoteTray}>
          <Text style={styles.emoteTrayTitle}>{tr.emotes.trayTitle}</Text>
          <View style={styles.emoteGrid}>
            {emotes.map(emote => (
              <Pressable
                key={emote.item_id}
                accessibilityRole="button"
                accessibilityLabel={tr.emotes.names[emote.item_id] ?? emote.name}
                onPress={() => onSendEmote(emote.item_id)}
                style={({ pressed }) => [styles.emoteCell, emote.is_premium && styles.emoteCellPremium, pressed && styles.pressed]}
              >
                <Text style={styles.emoteGlyph}>{emote.glyph}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
function CountdownPulse({ value, reducedMotion }: { value: number | null; reducedMotion: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (reducedMotion) { scale.setValue(1); return; } scale.setValue(0.68); Animated.spring(scale, { toValue: 1, tension: 150, friction: 6, useNativeDriver: true }).start(); }, [reducedMotion, scale, value]);
  return <Animated.Text style={[styles.countdown, { transform: [{ scale }] }]}>{value}</Animated.Text>;
}
function ClubCard({ club, index, used, selected, locked, reducedMotion, initials, onPress }: { club: Club; index: number; used: boolean; selected: boolean; locked: boolean; reducedMotion: boolean; initials: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (reducedMotion) { scale.setValue(1); return; } Animated.spring(scale, { toValue: selected ? 1.025 : 1, tension: 180, friction: 9, useNativeDriver: true }).start(); }, [reducedMotion, scale, selected]);
  return <Animated.View style={[styles.clubSlot, { transform: [{ scale }] }]}><Pressable accessibilityRole="button" accessibilityState={{ disabled: locked || used, selected }} accessibilityLabel={`${club.name}${used ? tr.match.usedA11y : ""}`} disabled={locked || used} onPress={onPress} style={({ pressed }) => [styles.club, used && styles.clubUsed, selected && styles.clubSelected, pressed && !used && styles.pressed]}><View style={styles.clubMeta}><Text style={[styles.clubIndex, used && styles.clubUsedText, selected && styles.clubSelectedText]}>{String(index + 1).padStart(2, "0")}</Text>{used && <Text style={styles.usedBadge}>{tr.match.used}</Text>}</View><View style={styles.clubIdentity}><View style={[styles.monogram, selected && styles.monogramSelected]}><Text style={[styles.monogramText, selected && styles.clubSelectedText]}>{initials}</Text></View><Text numberOfLines={2} style={[styles.clubName, used && styles.clubUsedText, selected && styles.clubSelectedText]}>{club.name}</Text></View></Pressable></Animated.View>;
}
function PlayerBadge({ itemId, name, accent }: { itemId: string; name: string; accent: string }) { return <View accessibilityLabel={name} style={[styles.playerBadge, { borderColor: accent, backgroundColor: `${accent}20` }]}><Text style={[styles.playerBadgeText, { color: accent }]}>{badgeGlyph(itemId)}</Text></View>; }
function ScorePips({ score, target = 3, align = "left", reducedMotion, accent = colors.primary }: { score: number; target?: number; align?: "left" | "right"; reducedMotion: boolean; accent?: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const previous = useRef(score);
  const pips = Math.max(2, Math.min(target, 5));
  useEffect(() => { if (score > previous.current && !reducedMotion) { pulse.setValue(0.65); Animated.spring(pulse, { toValue: 1, tension: 170, friction: 6, useNativeDriver: true }).start(); } previous.current = score; }, [pulse, reducedMotion, score]);
  return <Animated.View accessibilityLabel={tr.match.scoreA11y(score)} style={[styles.scorePips, align === "right" && styles.scorePipsRight, { transform: [{ scale: pulse }] }]}>{Array.from({ length: pips }, (_, index) => <View key={index} style={[styles.scorePip, index < score && { backgroundColor: accent }]} />)}</Animated.View>;
}
function Centered({ title, copy, children }: { title: string; copy: string; children?: ReactNode }) { return <View style={styles.centered}><Text style={styles.stageTitle}>{title}</Text><Text style={styles.stageCopy}>{copy}</Text>{children}</View>; }
function AnswerField({ value, onChangeText, editable, feedback, reducedMotion, onSubmit }: { value: string; onChangeText: (value: string) => void; editable: boolean; feedback: AnswerFeedback; reducedMotion: boolean; onSubmit: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!feedback || reducedMotion) { pulse.setValue(1); return; }
    pulse.setValue(0.96);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.03, duration: 90, useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 1, tension: 180, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [feedback, pulse, reducedMotion]);
  const borderColor = feedback === "wrong" ? colors.danger : feedback === "correct" ? colors.primary : colors.border;
  const guardPaste = (next: string) => {
    // Block bulk paste (anti-cheat soft). Typing + short autocorrect still OK.
    if (next.length - value.length > 2) return;
    onChangeText(next);
  };
  return <Animated.View style={{ transform: [{ scale: pulse }] }}><TextInput accessibilityLabel={tr.match.answerA11y} autoFocus value={value} onChangeText={guardPaste} editable={editable} autoCorrect={false} autoComplete="off" textContentType="none" importantForAutofill="no" contextMenuHidden returnKeyType="send" blurOnSubmit={false} onSubmitEditing={onSubmit} placeholder={tr.match.answerPlaceholder} placeholderTextColor={colors.muted} style={[styles.answerInput, { borderColor }, feedback === "wrong" && styles.answerInputWrong, feedback === "correct" && styles.answerInputCorrect]} /></Animated.View>;
}
function formatRevealReason(value?: Record<string, unknown>): string {
  const reason = String(value?.win_reason ?? "");
  if (reason === "FIRST_CORRECT") return tr.match.reasonFirstCorrect;
  if (reason === "ONLY_CORRECT") return tr.match.reasonOnlyCorrect;
  if (reason === "NO_CORRECT") return tr.match.reasonNoCorrect;
  return "";
}
function commentatorLine(value: Record<string, unknown> | undefined, playerId: string, suddenDeath: boolean): string {
  if (!value) return "";
  const reason = String(value.win_reason ?? "");
  const winner = value.winner_id ?? value.round_winner_id;
  const marginMs = typeof value.margin_ms === "number" ? value.margin_ms : null;
  if (suddenDeath && winner) return tr.match.commentator.suddenDeathWin;
  if (reason === "FIRST_CORRECT") return marginMs != null && marginMs < 400 ? tr.match.commentator.firstCorrectClose : tr.match.commentator.firstCorrectFast;
  if (reason === "ONLY_CORRECT") return tr.match.commentator.onlyCorrect;
  if (reason === "NO_CORRECT") return tr.match.commentator.noCorrect;
  if (winner === playerId) return tr.match.commentator.youWin;
  if (winner) return tr.match.commentator.theyWin;
  return "";
}
function SuddenDeathStinger({ reducedMotion, onDone }: { reducedMotion: boolean; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.86)).current;
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      const timer = setTimeout(onDone, 900);
      return () => clearTimeout(timer);
    }
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(1_100),
        Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
      Animated.spring(scale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDone(); });
  }, [onDone, opacity, reducedMotion, scale]);
  return <Animated.View pointerEvents="none" accessibilityRole="alert" style={[styles.sdOverlay, { opacity }]}>
    <Animated.View style={[styles.sdCard, { transform: [{ scale }] }]}>
      <Text style={styles.sdKicker}>FOOTBALL LINK</Text>
      <Text style={styles.sdTitle}>{tr.effects.suddenDeath}</Text>
      <Text style={styles.sdCopy}>{tr.effects.suddenDeathCopy}</Text>
    </Animated.View>
  </Animated.View>;
}
function ShareCardPreview({ myScore, oppScore, modeLabel, winnerId, playerId, suddenDeath }: { myScore: number; oppScore: number; modeLabel: string; winnerId: string | null; playerId: string; suddenDeath: boolean }) {
  const outcome = winnerId === playerId ? tr.share.win : winnerId ? tr.share.loss : myScore === oppScore ? tr.share.draw : myScore > oppScore ? tr.share.win : tr.share.loss;
  return <View style={styles.shareCard}>
    <Text style={styles.shareCardKicker}>FOOTBALL LINK</Text>
    <Text style={styles.shareCardScore}>{myScore} – {oppScore}</Text>
    <Text style={styles.shareCardOutcome}>{outcome}</Text>
    <Text style={styles.shareCardMeta}>{modeLabel}{suddenDeath ? ` · ${tr.effects.suddenDeath}` : ""}</Text>
  </View>;
}
function ResultPanel({ title, value, playerId, reducedMotion, momentumSeconds, suddenDeath = false, children }: { title: string; value?: Record<string, unknown>; playerId: string; reducedMotion: boolean; momentumSeconds?: number | null; suddenDeath?: boolean; children?: ReactNode }) {
  const winner = value?.winner_id ?? value?.round_winner_id;
  const submissions = (value?.submissions ?? []) as { player_id?: string; answer?: string; correct?: boolean; received_at_ms?: number; sequence?: number }[];
  const marginMs = typeof value?.margin_ms === "number" ? value.margin_ms : null;
  const reason = formatRevealReason(value);
  const line = commentatorLine(value, playerId, suddenDeath || value?.sudden_death === true);
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => { if (reducedMotion) { entrance.setValue(1); return; } Animated.timing(entrance, { toValue: 1, duration: 280, useNativeDriver: true }).start(); }, [entrance, reducedMotion, value]);
  const headline = winner ? (winner === playerId ? tr.match.roundYours : tr.match.roundOpponent) : tr.match.noPoint;
  return <Animated.View style={[styles.result, suddenDeath && styles.resultSudden, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
    <Text style={styles.stageKicker}>{suddenDeath ? tr.effects.suddenDeath : tr.match.referee}</Text>
    <Text style={styles.stageTitle}>{title}</Text>
    <Text style={styles.resultHeadline}>{headline}</Text>
    {!!line && <Text style={styles.commentator}>{line}</Text>}
    {!!reason && <Text style={styles.resultReason}>{reason}</Text>}
    {marginMs != null && winner != null && <View style={styles.marginChip}><Text style={styles.marginChipText}>{tr.match.marginBy(marginMs)}</Text></View>}
    {submissions.filter(item => item.player_id !== "test-bot").map((item, index) => {
      const mine = item.player_id === playerId;
      return <View key={`${item.player_id}-${index}`} style={[styles.submission, item.correct === false && styles.submissionWrong, item.correct === true && item.player_id === winner && styles.submissionWinner]}>
        <View style={styles.submissionMeta}><Text style={styles.submissionWho}>{mine ? tr.match.yourTime : tr.match.opponentTime}</Text><Text style={styles.submissionAnswer}>{item.answer || tr.match.noAnswer}</Text></View>
        <Text style={[styles.verdict, { color: item.correct ? colors.primary : colors.danger }]}>{item.correct ? tr.match.correct : tr.match.wrong}</Text>
      </View>;
    })}
    {momentumSeconds != null && momentumSeconds > 0 && <View style={styles.momentum}><Text style={styles.momentumText}>{tr.match.waitingNext(momentumSeconds)}</Text></View>}
    {children}
  </Animated.View>;
}

const styles = StyleSheet.create({
  confetti: { position: "absolute", left: "50%", top: "54%", width: 1, height: 1, zIndex: 12 }, confettiPiece: { position: "absolute", width: 7, height: 11, borderRadius: 2 },
  lastSecond: { backgroundColor: "rgba(244,201,93,.16)", borderWidth: 1, borderColor: colors.accent, borderRadius: 10, padding: 10, alignItems: "center" }, lastSecondText: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  wrongBanner: { backgroundColor: "rgba(232,93,93,.16)", borderWidth: 1, borderColor: colors.danger, borderRadius: 10, padding: 10, alignItems: "center" }, wrongBannerText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  correctBanner: { backgroundColor: "rgba(61,184,122,.14)", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 10, alignItems: "center" }, correctBannerText: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 }, page: { padding: 18, gap: 14, paddingBottom: 40, overflow: "hidden" }, pitchAtmosphere: { position: "absolute", width: 330, height: 330, borderRadius: 165, borderWidth: 1, right: -190, top: 190, opacity: .55, alignItems: "center", justifyContent: "center" }, atmosphereCircle: { width: 112, height: 112, borderRadius: 56, borderWidth: 1 }, atmosphereHalf: { position: "absolute", width: 1, height: 330 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, close: { color: colors.text, fontSize: 31, fontWeight: "300" }, connection: { flexDirection: "row", alignItems: "center", gap: 7 }, dot: { width: 7, height: 7, borderRadius: 4 }, connectionText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, roundWrap: { flexDirection: "row", alignItems: "center", gap: 6 }, sdBadge: { color: colors.ink, backgroundColor: colors.signal, overflow: "hidden", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, fontWeight: "900" }, round: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  sdStrip: { backgroundColor: "rgba(255,107,61,.14)", borderWidth: 1, borderColor: colors.signal, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, gap: 3 }, sdStripText: { color: colors.signal, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, sdStripCopy: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  sdOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,18,28,.88)", alignItems: "center", justifyContent: "center", zIndex: 40, padding: 24 }, sdCard: { width: "100%", maxWidth: 340, borderRadius: 22, borderWidth: 1, borderColor: colors.signal, backgroundColor: "#1A0F12", paddingVertical: 28, paddingHorizontal: 22, alignItems: "center", gap: 8 }, sdKicker: { color: colors.signal, fontSize: 10, fontWeight: "900", letterSpacing: 2 }, sdTitle: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -0.8, textAlign: "center" }, sdCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 260 },
  shareCard: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 16, gap: 4, alignItems: "center" }, shareCardKicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 }, shareCardScore: { color: colors.text, fontSize: 36, fontWeight: "900", letterSpacing: -1 }, shareCardOutcome: { color: colors.accent, fontSize: 15, fontWeight: "900" }, shareCardMeta: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  scoreboardWrap: { position: "relative", zIndex: 1 }, scoreboard: { minHeight: 134, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "stretch", overflow: "hidden" }, side: { flex: 1, padding: 14, justifyContent: "space-between" }, sideRight: { alignItems: "flex-end" }, playerIdentity: { flexDirection: "row", alignItems: "center", gap: 7 }, sideName: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, playerBadge: { width: 25, height: 25, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }] }, playerBadgeText: { fontSize: 7, fontWeight: "900", transform: [{ rotate: "-45deg" }] }, score: { color: colors.text, fontSize: 42, lineHeight: 45, fontWeight: "900", letterSpacing: -1 }, rightScore: { alignItems: "flex-end" }, scorePips: { flexDirection: "row", gap: 4, marginTop: 5 }, scorePipsRight: { justifyContent: "flex-end" }, scorePip: { width: 15, height: 3, borderRadius: 2, backgroundColor: colors.border }, scorePipOn: { backgroundColor: colors.primary }, chatBubble: { position: "absolute", top: 28, maxWidth: "72%", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, shadowColor: "#000", shadowOpacity: .28, shadowRadius: 8, elevation: 7 }, chatBubbleEmoji: { minWidth: 64, alignItems: "center" }, chatBubbleYou: { right: 12, backgroundColor: colors.primary, borderColor: "rgba(245,241,232,.4)" }, chatBubbleOpponent: { left: 12, backgroundColor: "#244554", borderColor: colors.accent, borderWidth: 1.5 }, chatBubbleSender: { fontSize: 8, fontWeight: "900", letterSpacing: 1 }, chatBubbleSenderYou: { color: colors.background, opacity: .7 }, chatBubbleSenderOpponent: { color: colors.accent }, chatBubbleText: { fontSize: 14, fontWeight: "900", marginTop: 2 }, chatBubbleEmojiText: { fontSize: 28, lineHeight: 34, marginTop: 2 }, chatBubbleTextYou: { color: colors.background }, chatBubbleTextOpponent: { color: "#FFFFFF" },
  matchMeta: { width: 112, alignItems: "center", justifyContent: "space-between", paddingVertical: 15 }, phase: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textAlign: "center" }, midfield: { width: 1, flex: 1, backgroundColor: colors.pitchLine, marginVertical: 8, justifyContent: "center" }, centerCircle: { width: 15, height: 15, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, position: "absolute", left: -7, backgroundColor: colors.surface }, timer: { color: colors.accent, fontSize: 18, fontWeight: "900" }, timerUnit: { fontSize: 9, color: colors.muted },
  testStrip: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 }, testStripText: { color: colors.background, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, testStripCopy: { color: colors.background, opacity: 0.75, fontSize: 11, flex: 1 }, eventStrip: { backgroundColor: "rgba(244,201,93,.14)", borderRadius: 10, borderWidth: 1, borderColor: "#F4C95D", paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 }, eventStripText: { color: "#F4C95D", fontSize: 9, fontWeight: "900", letterSpacing: 1 }, eventStripCopy: { color: colors.muted, fontSize: 11, flex: 1, fontWeight: "700" }, tipStrip: { backgroundColor: "rgba(114,199,255,.12)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(114,199,255,.35)", paddingHorizontal: 12, paddingVertical: 10 }, tipText: { color: colors.floodlight, fontSize: 12, fontWeight: "700", lineHeight: 17 }, error: { backgroundColor: "#3A2025", borderRadius: 10, padding: 12 }, errorText: { color: colors.danger, fontWeight: "700", fontSize: 13 }, quickMessages: { gap: 8 }, reactBar: { flexDirection: "row", alignItems: "center", gap: 8 }, emoteToggle: { minHeight: 36, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 }, emoteToggleOpen: { borderColor: colors.accent, backgroundColor: "rgba(244,201,93,.12)" }, emoteToggleGlyph: { fontSize: 15 }, emoteToggleText: { color: colors.text, fontSize: 11, fontWeight: "900" }, emoteTray: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 10 }, emoteTrayTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, emoteGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, emoteCell: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }, emoteCellPremium: { borderColor: "#6B4DFF" }, emoteGlyph: { fontSize: 24 }, quickMessageNotice: { color: colors.accent, fontSize: 12, fontWeight: "800" }, quickMessageButtons: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }, quickMessageButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 14 }, quickMessageText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  stage: { minHeight: 360, justifyContent: "center" }, answeringStage: { minHeight: 236, justifyContent: "flex-start", paddingTop: 10 }, centered: { alignItems: "center", gap: 12, paddingHorizontal: 14 }, stageKicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, stageTitle: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: -0.8 }, stageCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 },
  selection: { gap: 13 }, selectionNotice: { backgroundColor: "#3A2025", borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 }, selectionNoticeText: { color: colors.danger, fontWeight: "800", fontSize: 13, lineHeight: 18 },
  clubSearch: { position: "relative", zIndex: 3 }, clubSearchField: { minHeight: 56, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: 15 }, clubSearchFieldSelected: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.14, shadowRadius: 10, elevation: 3 }, searchGlyph: { color: colors.primary, fontSize: 25, marginRight: 10, marginTop: -3 }, clubSearchInput: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "700", paddingVertical: 15 }, searchValid: { color: colors.primary, fontSize: 16, fontWeight: "900" }, clubResults: { marginTop: 7, borderRadius: 13, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated }, clubResult: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, resultMonogram: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.pitchLine }, resultMonogramText: { color: colors.primary, fontSize: 8, fontWeight: "900" }, clubResultName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" }, clubResultAction: { color: colors.primary, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 }, clubNoResult: { color: colors.muted, paddingHorizontal: 15, paddingVertical: 17, fontSize: 13, fontWeight: "700" }, suggestionLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 2 },
  clubGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, clubSlot: { width: "48.5%" }, club: { width: "100%", minHeight: 104, borderRadius: 12, padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "space-between" }, clubUsed: { opacity: 0.42, backgroundColor: colors.background, borderStyle: "dashed" }, clubSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, clubMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, clubIndex: { color: colors.primary, fontSize: 9, fontWeight: "900" }, usedBadge: { color: colors.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 }, clubIdentity: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10 }, monogram: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.pitchLine }, monogramSelected: { backgroundColor: "rgba(7,21,31,0.12)", borderColor: "rgba(7,21,31,0.28)" }, monogramText: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.3 }, clubName: { color: colors.text, fontSize: 14, lineHeight: 17, fontWeight: "800", flex: 1 }, clubUsedText: { color: colors.muted }, clubSelectedText: { color: colors.background },
  action: { minHeight: 55, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, alignSelf: "stretch" }, actionConfirmed: { backgroundColor: "rgba(89,213,166,.16)", borderWidth: 1.5, borderColor: colors.primary }, actionText: { color: colors.background, fontSize: 16, fontWeight: "900" }, actionConfirmedText: { color: colors.primary }, actionArrow: { color: colors.background, fontSize: 23 }, disabled: { opacity: 0.35 }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  versus: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 18 }, team: { color: colors.text, fontSize: 18, fontWeight: "900", flex: 1 }, teamRight: { textAlign: "right" }, vs: { color: colors.accent, fontSize: 22, fontWeight: "300" }, countdown: { color: colors.accent, fontSize: 112, fontWeight: "900", textAlign: "center", letterSpacing: -6 },
  answerBox: { gap: 12, paddingBottom: 16 }, answerInput: { backgroundColor: colors.surface, borderRadius: 13, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 17, paddingVertical: 17, fontSize: 18 }, answerInputWrong: { backgroundColor: "rgba(232,93,93,.08)", shadowColor: colors.danger, shadowOpacity: 0.25, shadowRadius: 8 }, answerInputCorrect: { backgroundColor: "rgba(61,184,122,.08)" },
  choiceHint: { color: colors.muted, fontSize: 12, fontWeight: "700" }, choiceList: { gap: 8 }, choiceButton: { minHeight: 54, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }, choiceSelected: { borderColor: colors.accent }, choiceWrong: { borderColor: colors.danger, backgroundColor: "rgba(255,113,108,.12)" }, choiceCorrect: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.14)" }, choiceIndex: { width: 26, height: 26, borderRadius: 13, overflow: "hidden", textAlign: "center", textAlignVertical: "center", color: colors.muted, backgroundColor: colors.background, fontSize: 12, fontWeight: "900", lineHeight: 26 }, choiceIndexOn: { color: colors.background, backgroundColor: colors.accent }, choiceText: { color: colors.text, fontSize: 16, fontWeight: "800", flex: 1 }, choiceTextOn: { color: colors.text },
  result: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 }, resultSudden: { borderColor: colors.signal }, resultHeadline: { color: colors.accent, fontSize: 18, fontWeight: "800", marginTop: 5 }, commentator: { color: colors.floodlight, fontSize: 14, fontWeight: "800", lineHeight: 20, fontStyle: "italic" }, resultReason: { color: colors.muted, fontSize: 13, fontWeight: "700", lineHeight: 18 }, marginChip: { alignSelf: "flex-start", backgroundColor: "rgba(244,201,93,.16)", borderColor: colors.accent, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }, marginChipText: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 }, submission: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.background, borderRadius: 10, padding: 13, gap: 10 }, submissionWrong: { borderWidth: 1, borderColor: "rgba(232,93,93,.45)" }, submissionWinner: { borderWidth: 1, borderColor: "rgba(61,184,122,.45)" }, submissionMeta: { flex: 1, gap: 3 }, submissionWho: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, submissionAnswer: { color: colors.text, fontSize: 15, fontWeight: "700" }, verdict: { fontSize: 10, fontWeight: "900", letterSpacing: 1 }, momentum: { backgroundColor: "rgba(114,199,255,.12)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(114,199,255,.35)", paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" }, momentumText: { color: colors.accent, fontSize: 12, fontWeight: "800" }, cardRow: { flexDirection: "row", gap: 10, width: "100%", marginBottom: 4 }, oppCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 3 }, oppCardMine: { borderColor: colors.primary }, oppLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, oppName: { color: colors.text, fontSize: 15, fontWeight: "900" }, oppCode: { color: colors.muted, fontSize: 11, fontWeight: "700" }, oppTrophies: { color: colors.accent, fontSize: 12, fontWeight: "900", marginTop: 4 }, oppForm: { color: colors.floodlight, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  trophyDelta: { backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6, alignItems: "center" }, trophyDeltaLabel: { color: colors.text, fontSize: 14, fontWeight: "800" }, trophyDeltaChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: "900" },
  shareAction: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(89,213,166,.12)" }, shareActionText: { color: colors.primary, fontWeight: "900", fontSize: 13 },
  reportAction: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.danger, alignItems: "center", justifyContent: "center" }, reportActionText: { color: colors.danger, fontWeight: "800", fontSize: 13 }, rematchAction: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, rematchActionText: { color: colors.accent, fontWeight: "900", fontSize: 14 }, rematchArrow: { color: colors.accent, fontSize: 19 }, rematchOffer: { backgroundColor: "rgba(255,184,77,0.12)", borderColor: colors.accent, borderWidth: 1, borderRadius: 11, padding: 13, gap: 7 }, rematchOfferTitle: { color: colors.accent, fontSize: 14, fontWeight: "900" }, rematchOfferCopy: { color: colors.text, fontSize: 13, lineHeight: 18 }, rematchOfferActions: { flexDirection: "row", gap: 8, marginTop: 4 }, rematchDecline: { flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" }, rematchDeclineText: { color: colors.muted, fontWeight: "800" }, rematchAccept: { flex: 1, minHeight: 42, borderRadius: 8, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" }, rematchAcceptText: { color: colors.background, fontWeight: "900" },
});
