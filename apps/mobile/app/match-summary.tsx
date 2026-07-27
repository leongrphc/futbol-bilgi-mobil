import { useCallback, useRef, useState, type ComponentProps } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/auth/supabase";
import { tr } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { loadMatchSummary, MatchSummaryError } from "@/match/match-summary-api";
import type { MatchSummary, MatchSummaryRound, MatchSummaryRoundPlayer } from "@/match/match-summary-model";
import { colors } from "@/theme/colors";

type ReportReason = "WRONG_RESULT" | "OFFENSIVE_CONTENT" | "OTHER";
type LoadError = "NOT_FOUND" | "UNAVAILABLE";

export default function MatchSummaryScreen() {
  const { matchId: routeMatchId } = useLocalSearchParams<{ matchId?: string | string[] }>();
  const { locale } = useLanguage();
  const matchId = Array.isArray(routeMatchId) ? routeMatchId[0] : routeMatchId;
  const [summary, setSummary] = useState<MatchSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError>();
  const [reportingRound, setReportingRound] = useState<string>();
  const [reportTarget, setReportTarget] = useState<MatchSummaryRound>();
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(undefined);
    if (!matchId) {
      setSummary(undefined);
      setError("NOT_FOUND");
      setLoading(false);
      return;
    }
    try {
      const next = await loadMatchSummary(matchId);
      if (request !== requestRef.current) return;
      setSummary(next);
    } catch (value) {
      if (request !== requestRef.current) return;
      setSummary(undefined);
      setError(value instanceof MatchSummaryError ? value.code : "UNAVAILABLE");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [matchId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]));

  const submitReport = async (round: MatchSummaryRound, reason: ReportReason) => {
    if (!summary?.roomKey || reportingRound) return;
    setReportTarget(undefined);
    setReportingRound(round.id);
    try {
      const { error: reportError } = await supabase.rpc("submit_result_report", {
        p_room_key: summary.roomKey,
        p_round_ordinal: round.ordinal,
        p_reason_code: reason,
      });
      if (reportError) {
        Alert.alert(tr.report.failed);
        return;
      }
      setSummary(current => current ? {
        ...current,
        rounds: current.rounds.map(item => item.id === round.id ? { ...item, reportStatus: "OPEN" } : item),
      } : current);
      Alert.alert(tr.report.sent);
    } catch {
      Alert.alert(tr.report.failed);
    } finally {
      setReportingRound(undefined);
    }
  };

  const openReport = (round: MatchSummaryRound) => {
    if (!summary?.roomKey || round.reportStatus) return;
    setReportTarget(round);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.topbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr.matchSummary.back}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>
          <Text style={styles.topbarLabel}>{tr.matchSummary.kicker}</Text>
          <View style={styles.topbarSpacer} />
        </View>

        {loading && !summary ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : error || !summary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={error === "NOT_FOUND" ? `${tr.matchSummary.unavailable}. ${tr.matchSummary.back}` : `${tr.matchSummary.loadFailed}. ${tr.matchSummary.retry}`}
            onPress={() => {
              if (error === "NOT_FOUND") router.back();
              else void load();
            }}
            style={({ pressed }) => [styles.errorCard, pressed && styles.pressed]}
          >
            <Ionicons name={error === "NOT_FOUND" ? "arrow-back-circle-outline" : "refresh-circle-outline"} size={30} color={colors.danger} />
            <Text accessibilityRole="alert" style={styles.errorTitle}>{error === "NOT_FOUND" ? tr.matchSummary.unavailable : tr.matchSummary.loadFailed}</Text>
            <Text style={styles.retry}>{error === "NOT_FOUND" ? tr.matchSummary.back : tr.matchSummary.retry}</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.heading}>
              <Text style={styles.kicker}>{tr.matchSummary.kicker}</Text>
              <Text style={styles.title}>{tr.matchSummary.title}</Text>
            </View>

            <MatchHero summary={summary} locale={locale} />

            <View style={styles.privacyNote}>
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} />
              <Text style={styles.privacyText}>{tr.matchSummary.privacyNote}</Text>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{tr.matchSummary.rounds}</Text>
              <View style={styles.sectionRule} />
            </View>

            {summary.truncated && (
              <View style={styles.truncatedNote}>
                <Text style={styles.truncatedText}>{tr.matchSummary.truncated(summary.rounds.length, summary.totalRoundCount)}</Text>
              </View>
            )}

            {!summary.rounds.length ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyWhistle}><Ionicons name="document-text-outline" size={25} color={colors.accent} /></View>
                <Text style={styles.emptyTitle}>{tr.matchSummary.noRounds}</Text>
                <Text style={styles.emptyCopy}>{tr.matchSummary.noRoundsCopy}</Text>
              </View>
            ) : (
              <View style={styles.timeline}>
                {summary.rounds.map((round, index) => (
                  <RoundReport
                    key={round.id}
                    round={round}
                    last={index === summary.rounds.length - 1}
                    reportAvailable={!!summary.roomKey}
                    reporting={reportingRound === round.id}
                    onReport={() => openReport(round)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <ReportReasonSheet
        round={reportTarget}
        onClose={() => setReportTarget(undefined)}
        onSelect={reason => {
          if (reportTarget) void submitReport(reportTarget, reason);
        }}
      />
    </SafeAreaView>
  );
}

function ReportReasonSheet({
  round,
  onClose,
  onSelect,
}: {
  round?: MatchSummaryRound;
  onClose: () => void;
  onSelect: (reason: ReportReason) => void;
}) {
  const options: { reason: ReportReason; icon: ComponentProps<typeof Ionicons>["name"]; label: string }[] = [
    { reason: "WRONG_RESULT", icon: "help-circle-outline", label: tr.report.wrongResult },
    { reason: "OFFENSIVE_CONTENT", icon: "warning-outline", label: tr.report.offensiveContent },
    { reason: "OTHER", icon: "ellipsis-horizontal-circle-outline", label: tr.report.otherIssue },
  ];
  const roundLabel = round
    ? `${tr.matchSummary.round(round.ordinal)} · ${round.clubs[0].name} × ${round.clubs[1].name}`
    : "";

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={!!round}
    >
      <View accessibilityViewIsModal style={styles.modalRoot}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.reportSheet}>
          <View style={styles.sheetHandle} />
          <Text accessibilityRole="header" style={styles.sheetTitle}>{tr.report.title}</Text>
          <Text numberOfLines={2} style={styles.sheetRound}>{roundLabel}</Text>
          <View style={styles.reasonList}>
            {options.map(option => (
              <Pressable
                accessibilityRole="button"
                key={option.reason}
                onPress={() => onSelect(option.reason)}
                style={({ pressed }) => [styles.reasonButton, pressed && styles.pressed]}
              >
                <Ionicons name={option.icon} size={19} color={colors.danger} />
                <Text style={styles.reasonText}>{option.label}</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>{tr.report.cancel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MatchHero({ summary, locale }: { summary: MatchSummary; locale: "tr" | "en" }) {
  const won = summary.outcome === "WIN";
  return (
    <View style={[styles.hero, won ? styles.heroWin : styles.heroLoss]}>
      <View pointerEvents="none" style={styles.pitchMark}>
        <View style={styles.pitchCircle} />
        <View style={styles.pitchHalf} />
      </View>
      <View style={styles.heroTop}>
        <View style={[styles.outcomeChip, won ? styles.outcomeWin : styles.outcomeLoss]}>
          <Text style={[styles.outcomeText, won ? styles.outcomeTextWin : styles.outcomeTextLoss]}>{won ? tr.matchSummary.win : tr.matchSummary.loss}</Text>
        </View>
        <Text style={styles.date}>{formatDate(summary.finishedAt, locale)}</Text>
      </View>
      <View
        accessible
        accessibilityLabel={`${tr.matchSummary.score}: ${summary.scoreFor}, ${summary.scoreAgainst}`}
        style={styles.scoreStage}
      >
        <Text style={styles.score}>{summary.scoreFor}</Text>
        <View style={styles.scoreDivider}><View style={styles.scoreSpot} /></View>
        <Text style={styles.score}>{summary.scoreAgainst}</Text>
      </View>
      <Text style={styles.scoreLabel}>{tr.matchSummary.score} · {modeLabel(summary.mode)}</Text>
      <View style={styles.heroRule} />
      <View style={styles.heroMeta}>
        <View style={styles.opponentIdentity}>
          <Text style={styles.metaLabel}>{tr.matchSummary.opponentLabel}</Text>
          <Text numberOfLines={1} style={styles.opponentName}>{summary.opponent.name}</Text>
          <Text style={styles.opponentCode}>#{summary.opponent.code}</Text>
        </View>
        {summary.trophyDelta != null && summary.mode !== "EVENT" && (
          <View style={styles.deltaBlock}>
            <Text style={styles.metaLabel}>{tr.matchSummary.trophyChange}</Text>
            <Text style={[styles.deltaValue, summary.trophyDelta > 0 ? styles.deltaUp : summary.trophyDelta < 0 ? styles.deltaDown : undefined]}>
              {formatDelta(summary.trophyDelta)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function RoundReport({
  round,
  last,
  reportAvailable,
  reporting,
  onReport,
}: {
  round: MatchSummaryRound;
  last: boolean;
  reportAvailable: boolean;
  reporting: boolean;
  onReport: () => void;
}) {
  const outcomeTone = round.outcome === "ME" ? styles.roundOutcomeMe : round.outcome === "OPPONENT" ? styles.roundOutcomeOpponent : styles.roundOutcomeNone;
  const outcomeText = round.outcome === "ME" ? tr.matchSummary.pointMe : round.outcome === "OPPONENT" ? tr.matchSummary.pointOpponent : tr.matchSummary.noPoint;
  return (
    <View style={styles.timelineItem}>
      <View style={styles.rail}>
        {!last && <View style={styles.railLine} />}
        <View style={[styles.roundMarker, round.suddenDeath && styles.roundMarkerSudden]}>
          <Text style={[styles.roundNumber, round.suddenDeath && styles.roundNumberSudden]}>{round.ordinal}</Text>
        </View>
      </View>
      <View style={styles.roundCard}>
        <View style={styles.roundTop}>
          <View style={styles.roundLabels}>
            <Text style={styles.roundLabel}>{tr.matchSummary.round(round.ordinal)}</Text>
            {round.suddenDeath && <Text style={styles.suddenBadge}>{tr.matchSummary.suddenDeath}</Text>}
          </View>
          <Text style={[styles.roundOutcome, outcomeTone]}>{outcomeText}</Text>
        </View>

        <View style={styles.clubPair}>
          <View style={styles.clubPlate}><Text numberOfLines={2} style={styles.clubName}>{round.clubs[0].name}</Text></View>
          <View style={styles.linkMark}><Text style={styles.linkMarkText}>×</Text></View>
          <View style={styles.clubPlate}><Text numberOfLines={2} style={styles.clubName}>{round.clubs[1].name}</Text></View>
        </View>

        <View style={styles.answerBoard}>
          <AnswerStatus label={tr.matchSummary.you} answer={round.me} />
          <View style={styles.answerRule} />
          <AnswerStatus label={tr.matchSummary.opponent} answer={round.opponent} />
        </View>

        {round.reportStatus ? (
          <View style={styles.reported}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.muted} />
            <Text style={styles.reportedText}>{tr.matchSummary.reported}</Text>
          </View>
        ) : reportAvailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${tr.matchSummary.reportRound}: ${tr.matchSummary.round(round.ordinal)}, ${round.clubs[0].name} × ${round.clubs[1].name}`}
            accessibilityState={{ busy: reporting, disabled: reporting }}
            disabled={reporting}
            onPress={onReport}
            style={({ pressed }) => [styles.reportButton, reporting && styles.disabled, pressed && styles.pressed]}
          >
            {reporting ? <ActivityIndicator color={colors.danger} size="small" /> : <Ionicons name="flag-outline" size={15} color={colors.danger} />}
            <Text style={styles.reportText}>{tr.matchSummary.reportRound}</Text>
          </Pressable>
        ) : (
          <Text style={styles.reportUnavailable}>{tr.matchSummary.reportUnavailable}</Text>
        )}
      </View>
    </View>
  );
}

function AnswerStatus({ label, answer }: { label: string; answer: MatchSummaryRoundPlayer }) {
  const value = !answer.answered ? tr.matchSummary.noAnswer : answer.correct ? tr.matchSummary.correct : tr.matchSummary.wrong;
  const icon: ComponentProps<typeof Ionicons>["name"] = !answer.answered ? "remove-circle-outline" : answer.correct ? "checkmark-circle" : "close-circle";
  const tone = !answer.answered ? colors.muted : answer.correct ? colors.primary : colors.danger;
  return (
    <View style={styles.answerRow}>
      <Text style={styles.answerOwner}>{label}</Text>
      <View style={styles.answerResult}>
        {answer.lastSecond && <Text style={styles.lastSecond}>{tr.matchSummary.lastSecond}</Text>}
        <Ionicons name={icon} size={16} color={tone} />
        <Text style={[styles.answerValue, { color: tone }]}>{value}</Text>
      </View>
    </View>
  );
}

function modeLabel(mode: string): string {
  if (mode === "QUICK") return tr.quick.action;
  if (mode === "BLITZ") return tr.blitz.badge;
  if (mode === "RANKED") return tr.ranked.action;
  if (mode === "EVENT") return tr.event.badge;
  return tr.ranked.unranked;
}

function formatDate(value: string, locale: "tr" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, padding: 22, paddingBottom: 52, gap: 18 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  topbarLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  topbarSpacer: { width: 44, height: 44 },
  loading: { minHeight: 420, alignItems: "center", justifyContent: "center" },
  heading: { marginTop: 8 },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  title: { color: colors.text, fontSize: 37, lineHeight: 41, fontWeight: "900", letterSpacing: -1.2, marginTop: 8 },
  hero: { position: "relative", overflow: "hidden", borderRadius: 22, borderWidth: 1, backgroundColor: "#0D2831", padding: 18 },
  heroWin: { borderColor: colors.pitchLine },
  heroLoss: { borderColor: "#734246" },
  pitchMark: { position: "absolute", width: 250, height: 250, borderRadius: 125, right: -112, top: -85, borderWidth: 1, borderColor: "rgba(89,213,166,.12)", alignItems: "center", justifyContent: "center" },
  pitchCircle: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: "rgba(89,213,166,.14)" },
  pitchHalf: { position: "absolute", width: 1, height: 250, backgroundColor: "rgba(89,213,166,.10)" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  outcomeChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  outcomeWin: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.12)" },
  outcomeLoss: { borderColor: colors.danger, backgroundColor: "rgba(255,113,108,.11)" },
  outcomeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  outcomeTextWin: { color: colors.primary },
  outcomeTextLoss: { color: colors.danger },
  date: { flexShrink: 1, color: colors.muted, fontSize: 9, fontWeight: "700", textAlign: "right" },
  scoreStage: { minHeight: 92, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 9 },
  score: { width: 72, color: colors.floodlight, fontSize: 56, lineHeight: 62, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  scoreDivider: { width: 36, height: 1, backgroundColor: colors.pitchLine, alignItems: "center", justifyContent: "center" },
  scoreSpot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: colors.accent, backgroundColor: "#0D2831" },
  scoreLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, textAlign: "center" },
  heroRule: { height: 1, backgroundColor: "rgba(89,213,166,.17)", marginVertical: 16 },
  heroMeta: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 14 },
  opponentIdentity: { flex: 1, minWidth: 0 },
  metaLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.25 },
  opponentName: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 5 },
  opponentCode: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: .8, marginTop: 3 },
  deltaBlock: { alignItems: "flex-end" },
  deltaValue: { color: colors.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"], marginTop: 4 },
  deltaUp: { color: colors.primary },
  deltaDown: { color: colors.danger },
  privacyNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.pitchLine, backgroundColor: "rgba(89,213,166,.05)", padding: 13 },
  privacyText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 16, fontWeight: "700" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  sectionTitle: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  sectionRule: { flex: 1, height: 1, backgroundColor: colors.border },
  truncatedNote: { borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9 },
  truncatedText: { color: colors.muted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  rail: { width: 38, alignItems: "center" },
  railLine: { position: "absolute", top: 36, bottom: -1, width: 1, backgroundColor: colors.pitchLine },
  roundMarker: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", zIndex: 2 },
  roundMarkerSudden: { borderColor: colors.accent, backgroundColor: "#2A2116" },
  roundNumber: { color: colors.primary, fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
  roundNumberSudden: { color: colors.accent },
  roundCard: { flex: 1, minWidth: 0, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 13, marginBottom: 15 },
  roundTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  roundLabels: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  roundLabel: { color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: .9 },
  suddenBadge: { color: colors.accent, fontSize: 7, fontWeight: "900", letterSpacing: .75, borderRadius: 999, borderWidth: 1, borderColor: "#8F7440", paddingHorizontal: 6, paddingVertical: 3 },
  roundOutcome: { flexShrink: 1, fontSize: 8, lineHeight: 12, fontWeight: "900", letterSpacing: .65, textAlign: "right" },
  roundOutcomeMe: { color: colors.primary },
  roundOutcomeOpponent: { color: colors.danger },
  roundOutcomeNone: { color: colors.muted },
  clubPair: { flexDirection: "row", alignItems: "stretch", gap: 7, marginTop: 12 },
  clubPlate: { flex: 1, minWidth: 0, minHeight: 52, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  clubName: { color: colors.floodlight, fontSize: 10, lineHeight: 14, fontWeight: "900", textAlign: "center" },
  linkMark: { width: 22, alignItems: "center", justifyContent: "center" },
  linkMarkText: { color: colors.accent, fontSize: 15, fontWeight: "900" },
  answerBoard: { marginTop: 11, borderRadius: 11, backgroundColor: colors.background, overflow: "hidden" },
  answerRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 10, paddingVertical: 7 },
  answerOwner: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: .9 },
  answerResult: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  answerValue: { fontSize: 10, fontWeight: "900" },
  lastSecond: { color: colors.accent, fontSize: 7, fontWeight: "900", letterSpacing: .45, borderRadius: 999, backgroundColor: "rgba(255,180,84,.10)", paddingHorizontal: 6, paddingVertical: 3 },
  answerRule: { height: 1, backgroundColor: colors.border, marginLeft: 10 },
  reportButton: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,113,108,.55)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 11 },
  reportText: { color: colors.danger, fontSize: 9, fontWeight: "900", letterSpacing: .35 },
  reported: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 9 },
  reportedText: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: .7 },
  reportUnavailable: { color: colors.muted, fontSize: 8, lineHeight: 13, fontWeight: "700", textAlign: "center", marginTop: 9 },
  emptyCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 23, alignItems: "center" },
  emptyWhistle: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, borderColor: "#8F7440", backgroundColor: "rgba(255,180,84,.08)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "900", textAlign: "center", marginTop: 13 },
  emptyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6 },
  errorCard: { minHeight: 230, borderRadius: 18, borderWidth: 1, borderColor: colors.danger, backgroundColor: "rgba(255,113,108,.05)", padding: 23, alignItems: "center", justifyContent: "center" },
  errorTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "900", textAlign: "center", marginTop: 11 },
  retry: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: .8, marginTop: 12 },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.68)", padding: 14 },
  reportSheet: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, padding: 16, paddingBottom: 18 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900", textAlign: "center" },
  sheetRound: { color: colors.muted, fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center", marginTop: 5 },
  reasonList: { gap: 8, marginTop: 16 },
  reasonButton: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13 },
  reasonText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "800" },
  cancelButton: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 9 },
  cancelText: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: .4 },
  disabled: { opacity: .45 },
  pressed: { opacity: .72, transform: [{ scale: .99 }] },
});
