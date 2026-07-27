import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { type } from "@/theme/type";

// Shared section divider: small label riding a hairline, like pitch chalk.
export function SectionLabel({ label, tone = colors.muted }: { label: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[type.sectionLabel, { color: tone }]}>{label}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: -8 },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
});
