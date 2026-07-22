import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/auth/supabase";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [message, setMessage] = useState<string>(tr.auth.checking);

  useEffect(() => {
    let alive = true;
    const finish = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { if (alive) setMessage(tr.auth.errors.invalidResponse); return; }
      }
      router.replace("/");
    };
    void finish();
    return () => { alive = false; };
  }, [code]);

  return <SafeAreaView style={styles.safe}><View style={styles.content}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.title}>{message}</Text></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }, title: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" } });
