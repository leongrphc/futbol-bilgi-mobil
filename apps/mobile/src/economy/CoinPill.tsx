import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { tr } from "@/i18n";

function CurrencyPill({ amount, large = false, currency }: { amount: number; large?: boolean; currency: "COIN" | "DOLLAR" }) {
  const dollar = currency === "DOLLAR";
  return (
    <View accessibilityLabel={dollar ? tr.common.dollarBalance(amount) : tr.common.coinBalance(amount)} style={[styles.pill, dollar && styles.dollarPill, large && styles.pillLarge]}>
      <View style={[styles.coin, dollar && styles.dollar, large && styles.coinLarge]}><Text style={[styles.coinMark, dollar && styles.dollarMark, large && styles.coinMarkLarge]}>{dollar ? "$" : "C"}</Text></View>
      <Text style={[styles.amount, dollar && styles.dollarAmount, large && styles.amountLarge]}>{amount}</Text>
      {large && <Text style={[styles.label, dollar && styles.dollarLabel]}>{dollar ? tr.common.dollars : tr.common.coins}</Text>}
    </View>
  );
}

export function CoinPill(props: { amount: number; large?: boolean }) { return <CurrencyPill {...props} currency="COIN" />; }
export function DollarPill(props: { amount: number; large?: boolean }) { return <CurrencyPill {...props} currency="DOLLAR" />; }

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 9, backgroundColor: "rgba(244,201,93,.10)", borderWidth: 1, borderColor: "rgba(244,201,93,.38)" },
  dollarPill: { backgroundColor: "rgba(114,199,255,.10)", borderColor: "rgba(114,199,255,.38)" },
  pillLarge: { paddingVertical: 10, paddingHorizontal: 13, gap: 8, alignSelf: "flex-start" },
  coin: { width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F4C95D", borderWidth: 2, borderColor: "#FFE49A" },
  dollar: { backgroundColor: "#72C7FF", borderColor: "#C9ECFF" },
  coinLarge: { width: 25, height: 25, borderRadius: 13 },
  coinMark: { color: "#6A4710", fontSize: 9, fontWeight: "900" },
  dollarMark: { color: "#153E58" },
  coinMarkLarge: { fontSize: 11 },
  amount: { color: "#FFE49A", fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  dollarAmount: { color: "#C9ECFF" },
  amountLarge: { color: colors.floodlight, fontSize: 18 },
  label: { color: "#CBB778", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  dollarLabel: { color: "#86BBD8" },
});
