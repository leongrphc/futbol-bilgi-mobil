import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { getActiveMatch, type ActiveMatch } from "@/match/active-match";
import { supabase } from "@/auth/supabase";
import { useAuth } from "@/auth/auth-context";
import { tr } from "@/i18n";

type FormMode = "sign-in" | "sign-up";

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login")) return tr.auth.errors.invalidLogin;
  if (message.includes("already registered")) return tr.auth.errors.registered;
  if (message.includes("password")) return tr.auth.errors.password;
  return error instanceof Error ? error.message : tr.auth.errors.fallback;
}

export default function Login() {
  const { room: invitedRoom } = useLocalSearchParams<{ room?: string }>();
  const { session, profile, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<FormMode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    void getActiveMatch().then(match => { if (alive) setActiveMatch(match); });
    return () => { alive = false; };
  }, []));

  const submitEmail = async () => {
    if (!email.trim() || password.length < 6 || (mode === "sign-up" && !displayName.trim())) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "sign-in") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const redirectTo = Linking.createURL("auth/callback");
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim() }, emailRedirectTo: redirectTo } });
        if (authError) throw authError;
        if (!data.session) setNotice(tr.auth.confirmationSent);
      }
    } catch (value) { setError(messageFor(value)); }
    finally { setBusy(false); }
  };

  const socialSignIn = async (provider: "google" | "apple") => {
    setBusy(true); setError(""); setNotice("");
    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error: authError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: Platform.OS !== "web" } });
      if (authError) throw authError;
      if (Platform.OS !== "web" && data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === "success") {
          const code = new URL(result.url).searchParams.get("code");
          if (!code) throw new Error(tr.auth.errors.invalidResponse);
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
      }
    } catch (value) { setError(messageFor(value)); }
    finally { setBusy(false); }
  };

  const enter = () => { if (profile) router.replace({ pathname: "/lobby", params: invitedRoom ? { playerId: profile.id, room: invitedRoom } : { playerId: profile.id } }); };
  const resumeMatch = () => {
    if (!activeMatch || !profile || activeMatch.playerId !== profile.id) return;
    const params: Record<string, string> = { playerId: profile.id, matchId: activeMatch.matchId, resume: "1" };
    if (activeMatch.mode) params.mode = activeMatch.mode;
    router.push({ pathname: "/match", params });
  };

  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    // Android pads manually; iOS relies on ScrollView auto keyboard insets only.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, event => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const formPadBottom = Platform.OS === "ios"
    ? (keyboardHeight > 0 ? 26 : 12)
    : Math.max(12, keyboardHeight > 0 ? keyboardHeight + 10 - insets.bottom : 12);

  if (authLoading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>{tr.auth.checking}</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={styles.keyboard} behavior={undefined} enabled={false}>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: formPadBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View style={styles.brand}>
          <Text style={styles.kicker}>{tr.auth.kicker}</Text>
          <Text style={styles.title}>{tr.auth.title}{"\n"}<Text style={styles.titleAccent}>{tr.auth.titleAccent}</Text></Text>
          <View style={styles.pitchLine}><View style={styles.centerSpot} /></View>
          <Text style={styles.lead}>{session ? tr.auth.welcome(profile?.displayName ?? tr.common.player) : tr.auth.lead}</Text>
        </View>

        {session && profile ? <View style={styles.signedIn}>
          {activeMatch?.playerId === profile.id && <Pressable accessibilityRole="button" onPress={resumeMatch} style={({ pressed }) => [styles.resumeCard, pressed && styles.pressed]}>
            <View><Text style={styles.resumeKicker}>{tr.auth.activeMatch}</Text><Text style={styles.resumeTitle}>{activeMatch.mode === "bot" ? tr.auth.botMatch : tr.auth.friendRoom}</Text></View><Text style={styles.resumeArrow}>↗</Text>
          </Pressable>}
          <View style={styles.profileCard}><View><Text style={styles.profileName}>{profile.displayName}</Text><Text style={styles.profileCode}>#{profile.playerCode} · {profile.trophies} {tr.common.trophies}</Text></View><View style={styles.statusDot} /></View>
          <Pressable onPress={enter} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>{tr.auth.matchCenter}</Text><Text style={styles.arrow}>→</Text></Pressable>
        </View> : <View style={styles.form}>
          <View style={styles.tabs}><Pressable onPress={() => setMode("sign-in")} style={[styles.tab, mode === "sign-in" && styles.tabActive]}><Text style={[styles.tabText, mode === "sign-in" && styles.tabTextActive]}>{tr.common.signIn}</Text></Pressable><Pressable onPress={() => setMode("sign-up")} style={[styles.tab, mode === "sign-up" && styles.tabActive]}><Text style={[styles.tabText, mode === "sign-up" && styles.tabTextActive]}>{tr.common.signUp}</Text></Pressable></View>
          {mode === "sign-up" && <TextInput accessibilityLabel={tr.auth.displayName} value={displayName} onChangeText={setDisplayName} placeholder={tr.auth.displayName} placeholderTextColor={colors.muted} style={styles.input} maxLength={30} />}
          <TextInput accessibilityLabel={tr.auth.email} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder={tr.auth.email} placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput accessibilityLabel={tr.auth.password} value={password} onChangeText={setPassword} secureTextEntry textContentType={mode === "sign-up" ? "newPassword" : "password"} returnKeyType="go" onSubmitEditing={submitEmail} placeholder={tr.auth.password} placeholderTextColor={colors.muted} style={styles.input} />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}{!!notice && <Text style={styles.notice}>{notice}</Text>}
          <Pressable disabled={busy} onPress={submitEmail} style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.buttonText}>{mode === "sign-in" ? tr.common.signIn : tr.common.signUp}</Text>{busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.arrow}>→</Text>}</Pressable>
          <View style={styles.socialDivider}><View style={styles.rule} /><Text style={styles.or}>{tr.auth.or}</Text><View style={styles.rule} /></View>
          <View style={styles.socialRow}><Pressable disabled={busy} onPress={() => socialSignIn("google")} style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}><Text style={styles.socialMark}>G</Text><Text style={styles.socialText}>Google</Text></Pressable><Pressable disabled={busy} onPress={() => socialSignIn("apple")} style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}><Text style={styles.socialMark}>●</Text><Text style={styles.socialText}>Apple</Text></Pressable></View>
        </View>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 }, loading: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 14 }, loadingText: { color: colors.muted, fontWeight: "700" }, page: { flexGrow: 1, padding: 24, justifyContent: "space-between", gap: 28 },
  brand: { paddingTop: 24 }, kicker: { color: colors.primary, fontSize: 11, fontWeight: "900", letterSpacing: 1.7 }, title: { color: colors.text, fontSize: 45, lineHeight: 49, fontWeight: "900", letterSpacing: -1.8, marginTop: 16 }, titleAccent: { color: colors.accent }, pitchLine: { height: 1, backgroundColor: colors.pitchLine, marginVertical: 23, alignItems: "center", justifyContent: "center" }, centerSpot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.background }, lead: { color: colors.muted, fontSize: 16, lineHeight: 23, maxWidth: 330 },
  form: { gap: 10, paddingBottom: 10, marginBottom: 10 }, tabs: { flexDirection: "row", padding: 4, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 4 }, tab: { flex: 1, paddingVertical: 11, alignItems: "center", borderRadius: 9 }, tabActive: { backgroundColor: colors.surfaceElevated }, tabText: { color: colors.muted, fontWeight: "800" }, tabTextActive: { color: colors.text }, input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 11, fontSize: 16 },
  button: { marginTop: 3, backgroundColor: colors.primary, minHeight: 54, borderRadius: 11, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, buttonText: { color: colors.background, fontSize: 16, fontWeight: "900" }, arrow: { color: colors.background, fontSize: 23 }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 }, notice: { color: colors.primary, fontSize: 13, lineHeight: 18 }, socialDivider: { flexDirection: "row", alignItems: "center", gap: 11, marginVertical: 5 }, rule: { height: 1, backgroundColor: colors.border, flex: 1 }, or: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, socialRow: { flexDirection: "row", gap: 10 }, socialButton: { flex: 1, minHeight: 49, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, socialMark: { color: colors.accent, fontWeight: "900", fontSize: 15 }, socialText: { color: colors.text, fontWeight: "800" },
  signedIn: { gap: 12, paddingBottom: 12 }, profileCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 17, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, profileName: { color: colors.text, fontSize: 20, fontWeight: "900" }, profileCode: { color: colors.muted, marginTop: 5, fontWeight: "700", fontSize: 12 }, statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }, resumeCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, resumeKicker: { color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, resumeTitle: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 5 }, resumeArrow: { color: colors.accent, fontSize: 24 }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] }, disabled: { opacity: 0.45 },
});
