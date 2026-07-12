import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/auth/supabase";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";
import { setChatStyle, type ChatStyleId } from "@/cosmetics/chat-style";
import { badgeGlyph, pitchThemes } from "@/cosmetics/loadout";
import { useAuth } from "@/auth/auth-context";
import { CoinPill, DollarPill } from "@/economy/CoinPill";

type Kind = "PITCH_THEME" | "BADGE" | "CHAT_STYLE" | "EMOTE";
type Cosmetic = {
  item_id: string;
  name: string;
  kind: Kind;
  accent: string;
  equipped: boolean;
  is_premium: boolean;
  glyph: string | null;
  owned: boolean;
  price_coins: number;
  price_dollars: number;
};

const categories: { kind: Kind; icon: string; label: () => string; note: () => string }[] = [
  { kind: "EMOTE", icon: "☺", label: () => tr.cosmetics.emotes, note: () => tr.cosmetics.categoryNotes.emotes },
  { kind: "CHAT_STYLE", icon: "Aa", label: () => tr.cosmetics.chatBubbles, note: () => tr.cosmetics.categoryNotes.chat },
  { kind: "PITCH_THEME", icon: "▦", label: () => tr.cosmetics.themes, note: () => tr.cosmetics.categoryNotes.themes },
  { kind: "BADGE", icon: "◆", label: () => tr.cosmetics.badges, note: () => tr.cosmetics.categoryNotes.badges },
];

export default function Cosmetics() {
  const { profile, refreshProfile } = useAuth();
  const [items, setItems] = useState<Cosmetic[]>([]);
  const [activeKind, setActiveKind] = useState<Kind>("EMOTE");
  const [busyId, setBusyId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("cosmetics_mine");
    setLoadError(Boolean(error));
    if (!error) setItems((data ?? []) as Cosmetic[]);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const activeCategory = categories.find(category => category.kind === activeKind)!;
  const activeItems = useMemo(() => items.filter(item => item.kind === activeKind), [activeKind, items]);

  const equip = async (item: Cosmetic) => {
    setBusyId(item.item_id);
    const { error } = await supabase.rpc("cosmetics_equip", { p_item_id: item.item_id });
    setBusyId(undefined);
    if (error) { Alert.alert(tr.cosmetics.equipFailed); return; }
    if (item.kind === "CHAT_STYLE") await setChatStyle(item.item_id as ChatStyleId);
    await load();
  };

  const purchase = async (item: Cosmetic) => {
    setBusyId(item.item_id);
    const { error } = await supabase.rpc("cosmetics_purchase", { p_item_id: item.item_id });
    setBusyId(undefined);
    if (error) {
      const message = error.message.includes("INSUFFICIENT_DOLLARS")
        ? tr.cosmetics.insufficientDollars
        : error.message.includes("INSUFFICIENT_COINS")
          ? tr.cosmetics.insufficientCoins
          : tr.cosmetics.purchaseFailed;
      Alert.alert(message);
      return;
    }
    await Promise.all([load(), refreshProfile()]);
  };

  const confirmPurchase = (item: Cosmetic) => {
    const dollar = item.price_dollars > 0;
    const amount = dollar ? item.price_dollars : item.price_coins;
    Alert.alert(item.name, tr.cosmetics.confirmPurchase(amount, dollar ? "DOLLAR" : "COIN"), [
      { text: tr.report.cancel, style: "cancel" },
      { text: tr.cosmetics.buy, onPress: () => { void purchase(item); } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.shopHeading}><Text style={s.kicker}>{tr.cosmetics.kicker}</Text><Text style={s.title}>{tr.cosmetics.title}</Text><Text style={s.note}>{tr.cosmetics.note}</Text></View>
        <View style={s.wallet}><Text style={s.walletLabel}>{tr.cosmetics.wallet}</Text><View style={s.walletBalances}><CoinPill amount={profile?.coins ?? 0} large /><DollarPill amount={profile?.dollars ?? 0} large /></View></View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRail}>
          {categories.map(category => {
            const active = category.kind === activeKind;
            const count = items.filter(item => item.kind === category.kind).length;
            return (
              <Pressable key={category.kind} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setActiveKind(category.kind)} style={({ pressed }) => [s.categoryTab, active && s.categoryTabActive, pressed && s.pressed]}>
                <Text style={[s.categoryIcon, active && s.categoryIconActive]}>{category.icon}</Text>
                <Text style={[s.categoryLabel, active && s.categoryLabelActive]}>{category.label()}</Text>
                <Text style={[s.categoryCount, active && s.categoryCountActive]}>{count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.shelfHeader}>
          <View><Text style={s.shelfKicker}>{activeCategory.label()}</Text><Text style={s.shelfTitle}>{activeCategory.note()}</Text></View>
          <Text style={s.shelfNumber}>{String(categories.findIndex(category => category.kind === activeKind) + 1).padStart(2, "0")}</Text>
        </View>

        {loading && <ActivityIndicator color={colors.primary} style={s.loader} />}
        {loadError && !loading && <Pressable onPress={() => { void load(); }} style={s.retry}><Text style={s.retryText}>{tr.cosmetics.loadFailed}</Text></Pressable>}
        {!loading && !loadError && activeItems.length === 0 && <Text style={s.empty}>{tr.cosmetics.emptyCategory}</Text>}
        {!loading && !loadError && <View style={s.section}>{activeItems.map(item => <ProductCard key={item.item_id} item={item} busyId={busyId} onBuy={confirmPurchase} onEquip={equip} />)}</View>}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProductCard({ item, busyId, onBuy, onEquip }: { item: Cosmetic; busyId?: string; onBuy: (item: Cosmetic) => void; onEquip: (item: Cosmetic) => Promise<void> }) {
  const owned = Boolean(item.owned);
  const dollar = item.price_dollars > 0;
  const price = dollar ? item.price_dollars : item.price_coins;
  const busy = busyId === item.item_id;
  return (
    <View style={[s.card, item.equipped && owned && { borderColor: item.accent }, dollar && s.premiumCard]}>
      {dollar && <View style={s.specialRibbon}><Text style={s.specialText}>{tr.cosmetics.special}</Text></View>}
      {item.kind === "EMOTE"
        ? <View style={[s.emotePreview, { borderColor: item.accent }]}><Text style={s.emoteGlyph}>{item.glyph || "•"}</Text></View>
        : item.kind === "CHAT_STYLE"
          ? <View style={[s.chatPreview, { borderColor: item.accent }]}><Text style={[s.chatPreviewText, { color: item.accent }]}>Aa</Text></View>
          : item.kind === "PITCH_THEME"
            ? <PitchPreview itemId={item.item_id} accent={item.accent} />
            : <BadgePreview itemId={item.item_id} accent={item.accent} />}
      <View style={s.info}>
        <Text style={s.name}>{item.name}</Text>
        <View style={s.productMeta}>
          <Price currency={dollar ? "DOLLAR" : "COIN"} amount={price} />
          {owned && <Text style={s.owned}>{item.equipped ? tr.cosmetics.equipped : tr.cosmetics.owned}</Text>}
        </View>
      </View>
      {!owned ? (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(busyId) }} disabled={Boolean(busyId)} onPress={() => onBuy(item)} style={[s.buyButton, dollar && s.dollarButton, Boolean(busyId) && s.disabled]}>
          {busy ? <ActivityIndicator size="small" color={dollar ? "#C9ECFF" : "#FFE49A"} /> : <><Text style={[s.buyCurrency, dollar && s.buyCurrencyDollar]}>{dollar ? "$" : "C"}</Text><Text style={[s.buyPrice, dollar && s.buyPriceDollar]}>{price}</Text></>}
        </Pressable>
      ) : item.kind === "EMOTE" ? (
        <View style={[s.actionButton, s.on]}><Text style={s.onText}>✓</Text></View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: item.equipped, disabled: item.equipped || Boolean(busyId) }} disabled={item.equipped || Boolean(busyId)} onPress={() => { void onEquip(item); }} style={[s.actionButton, item.equipped && s.on, Boolean(busyId) && s.disabled]}>
          <Text style={[s.actionText, item.equipped && s.onText]}>{busy ? "…" : item.equipped ? "✓" : tr.cosmetics.equip}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Price({ currency, amount }: { currency: "COIN" | "DOLLAR"; amount: number }) {
  const dollar = currency === "DOLLAR";
  return <View style={[s.priceChip, dollar && s.priceChipDollar]}><Text style={[s.priceMark, dollar && s.priceMarkDollar]}>{dollar ? "$" : "C"}</Text><Text style={[s.priceAmount, dollar && s.priceAmountDollar]}>{amount}</Text></View>;
}
function PitchPreview({ itemId, accent }: { itemId: string; accent: string }) {
  const theme = pitchThemes[itemId] ?? pitchThemes["pitch-classic"]!;
  return <View style={[s.pitchPreview, { backgroundColor: theme.surface, borderColor: accent }]}><View style={[s.pitchHalf, { backgroundColor: theme.line }]} /><View style={[s.pitchCircle, { borderColor: theme.line }]} /></View>;
}
function BadgePreview({ itemId, accent }: { itemId: string; accent: string }) {
  return <View style={[s.badgePreview, { borderColor: accent, backgroundColor: `${accent}20` }]}><Text style={[s.badgeGlyph, { color: accent }]}>{badgeGlyph(itemId)}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 18, paddingBottom: 106 },
  shopHeading: { gap: 7 },
  kicker: { color: colors.primary, fontWeight: "900", fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 40, lineHeight: 42, fontWeight: "900", letterSpacing: -1.2 },
  note: { color: colors.muted, lineHeight: 19, maxWidth: 340 },
  wallet: { gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  walletLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  walletBalances: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryRail: { gap: 9, paddingRight: 22 },
  categoryTab: { width: 112, minHeight: 86, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 11, justifyContent: "space-between" },
  categoryTabActive: { backgroundColor: colors.floodlight, borderColor: colors.floodlight },
  categoryIcon: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  categoryIconActive: { color: colors.signal },
  categoryLabel: { color: colors.text, fontSize: 10, lineHeight: 13, fontWeight: "900" },
  categoryLabelActive: { color: colors.ink },
  categoryCount: { position: "absolute", top: 10, right: 10, color: colors.muted, fontSize: 9, fontWeight: "900" },
  categoryCountActive: { color: "rgba(8,23,32,.5)" },
  shelfHeader: { minHeight: 74, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 13 },
  shelfKicker: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  shelfTitle: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 5, maxWidth: 280 },
  shelfNumber: { color: colors.border, fontSize: 35, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  section: { gap: 9 },
  card: { position: "relative", flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: colors.surface, overflow: "hidden" },
  premiumCard: { borderColor: "rgba(114,199,255,.48)", backgroundColor: "#102431" },
  specialRibbon: { position: "absolute", right: -23, top: 7, width: 78, alignItems: "center", backgroundColor: "#72C7FF", transform: [{ rotate: "34deg" }], paddingVertical: 2 },
  specialText: { color: "#153E58", fontSize: 6, fontWeight: "900", letterSpacing: .7 },
  chatPreview: { height: 44, width: 50, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated },
  chatPreviewText: { fontWeight: "900", fontSize: 14 },
  emotePreview: { height: 44, width: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated },
  emoteGlyph: { fontSize: 22 },
  pitchPreview: { height: 44, width: 50, borderRadius: 9, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  pitchHalf: { position: "absolute", width: 1, height: 44 },
  pitchCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  badgePreview: { height: 40, width: 40, marginHorizontal: 5, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", transform: [{ rotate: "45deg" }] },
  badgeGlyph: { fontSize: 10, fontWeight: "900", transform: [{ rotate: "-45deg" }] },
  info: { flex: 1, gap: 5 },
  name: { color: colors.text, fontWeight: "900", paddingRight: 12 },
  productMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  priceChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  priceChipDollar: {},
  priceMark: { color: "#F4C95D", fontSize: 9, fontWeight: "900" },
  priceMarkDollar: { color: "#72C7FF" },
  priceAmount: { color: "#D7C889", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  priceAmountDollar: { color: "#A9DAF4" },
  owned: { color: colors.primary, fontSize: 8, fontWeight: "900", letterSpacing: .6 },
  buyButton: { minWidth: 58, minHeight: 38, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, backgroundColor: "rgba(244,201,93,.12)", borderWidth: 1, borderColor: "rgba(244,201,93,.42)" },
  dollarButton: { backgroundColor: "rgba(114,199,255,.12)", borderColor: "rgba(114,199,255,.46)" },
  buyCurrency: { color: "#F4C95D", fontSize: 10, fontWeight: "900" },
  buyCurrencyDollar: { color: "#72C7FF" },
  buyPrice: { color: "#FFE49A", fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  buyPriceDollar: { color: "#C9ECFF" },
  actionButton: { minWidth: 58, minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.primary },
  actionText: { color: colors.background, fontSize: 11, fontWeight: "900" },
  on: { backgroundColor: colors.surfaceElevated },
  onText: { color: colors.primary, fontSize: 16, fontWeight: "900" },
  loader: { marginVertical: 24 },
  retry: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, alignItems: "center", justifyContent: "center" },
  retryText: { color: colors.danger, fontWeight: "800" },
  empty: { color: colors.muted, paddingVertical: 22 },
  pressed: { opacity: .82, transform: [{ scale: .99 }] },
  disabled: { opacity: .45 },
});
