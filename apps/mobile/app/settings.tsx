import { useState } from "react";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { tr, type Locale } from "@/i18n";
import { useLanguage } from "@/language/language-provider";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/auth/supabase";

export default function Settings() {
  const { locale, setLocale } = useLanguage();
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const chooseLanguage = async (nextLocale: Locale) => {
    if (saving || (nextLocale === locale && !syncFailed)) return;
    setSaving(true);
    setSyncFailed(false);
    void Haptics.selectionAsync();
    try {
      await setLocale(nextLocale);
      if (profile) {
        const { error } = await supabase.from("profiles").update({ preferred_locale: nextLocale }).eq("id", profile.id);
        if (error) setSyncFailed(true);
        else await refreshProfile();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View pointerEvents="none" style={styles.pitchMark}><View style={styles.pitchCircle} /><View style={styles.pitchHalf} /></View>
        <View style={styles.topbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr.settings.back} onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>
          <Text style={styles.topbarLabel}>{tr.settings.open}</Text>
          <View style={styles.topbarSpacer} />
        </View>

        <View style={styles.heading}>
          <Text style={styles.kicker}>{tr.settings.kicker}</Text>
          <Text style={styles.title}>{tr.settings.title}</Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{tr.settings.language}</Text>
          <View style={styles.sectionRule} />
        </View>
        <Text style={styles.sectionCopy}>{tr.settings.languageCopy}</Text>

        <View style={styles.languageCard}>
          <LanguageOption
            code="TR"
            title={tr.settings.turkish}
            subtitle={tr.settings.turkishNative}
            selected={locale === "tr"}
            disabled={saving}
            onPress={() => { void chooseLanguage("tr"); }}
          />
          <View style={styles.divider} />
          <LanguageOption
            code="EN"
            title={tr.settings.english}
            subtitle={tr.settings.englishNative}
            selected={locale === "en"}
            disabled={saving}
            onPress={() => { void chooseLanguage("en"); }}
          />
        </View>

        <View style={styles.savedNote}>
          <Ionicons name="phone-portrait-outline" size={17} color={colors.primary} />
          <Text style={styles.savedText}>{profile ? tr.settings.accountSaved : tr.settings.saved}</Text>
        </View>
        {syncFailed && <Text accessibilityRole="alert" style={styles.syncError}>{tr.settings.syncFailed}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function LanguageOption({ code, title, subtitle, selected, disabled, onPress }: { code: string; title: string; subtitle: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.languageOption, selected && styles.languageOptionSelected, pressed && styles.pressed]}
    >
      <View style={[styles.languageCode, selected && styles.languageCodeSelected]}><Text style={[styles.languageCodeText, selected && styles.languageCodeTextSelected]}>{code}</Text></View>
      <View style={styles.languageCopy}>
        <Text style={styles.languageTitle}>{title}</Text>
        <Text style={styles.languageSubtitle}>{subtitle}</Text>
      </View>
      {selected ? <View style={styles.selectedBadge}><Text style={styles.selectedText}>{tr.settings.selected}</Text><Ionicons name="checkmark-circle" size={18} color={colors.primary} /></View> : <View style={styles.emptyRadio} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { position: "relative", overflow: "hidden", flexGrow: 1, padding: 22, gap: 18, paddingBottom: 44 },
  pitchMark: { position: "absolute", width: 250, height: 250, borderRadius: 125, right: -120, top: -72, borderWidth: 1, borderColor: "rgba(89,213,166,.1)", alignItems: "center", justifyContent: "center" },
  pitchCircle: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: "rgba(89,213,166,.12)" },
  pitchHalf: { position: "absolute", width: 1, height: 250, backgroundColor: "rgba(89,213,166,.09)" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  topbarLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.8, textTransform: "uppercase" },
  topbarSpacer: { width: 42 },
  heading: { marginTop: 24, marginBottom: 14, maxWidth: 340 },
  kicker: { color: colors.primary, fontWeight: "900", fontSize: 10, letterSpacing: 2.2 },
  title: { color: colors.text, fontSize: 38, lineHeight: 42, fontWeight: "900", letterSpacing: -1.3, marginTop: 10 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionTitle: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  sectionRule: { flex: 1, height: 1, backgroundColor: colors.border },
  sectionCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: -8, maxWidth: 330 },
  languageCard: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  languageOption: { minHeight: 88, paddingHorizontal: 15, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 13 },
  languageOptionSelected: { backgroundColor: "rgba(89,213,166,.075)" },
  languageCode: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  languageCodeSelected: { borderColor: colors.primary, backgroundColor: "rgba(89,213,166,.12)" },
  languageCodeText: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  languageCodeTextSelected: { color: colors.primary },
  languageCopy: { flex: 1, gap: 3 },
  languageTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  languageSubtitle: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  selectedBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectedText: { color: colors.primary, fontSize: 8, fontWeight: "900", letterSpacing: .8 },
  emptyRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 74 },
  savedNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.pitchLine, backgroundColor: "rgba(89,213,166,.05)", padding: 14 },
  savedText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: "700" },
  syncError: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  pressed: { opacity: .7, transform: [{ scale: .99 }] },
});
