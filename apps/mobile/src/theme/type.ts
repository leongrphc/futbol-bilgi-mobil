import type { TextStyle } from "react-native";
import { colors } from "@/theme/colors";

// Typography scale. Discipline: 900 is reserved for display numbers, screen
// titles and verdict moments. Cards speak at 800, labels at 700, body at 500.
// If everything shouts, nothing does.
export const type = {
  display: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -1.1,
  } satisfies TextStyle,

  verdict: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.4,
  } satisfies TextStyle,

  screenTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
  } satisfies TextStyle,

  kicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  } satisfies TextStyle,

  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  } satisfies TextStyle,

  cardTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.2,
  } satisfies TextStyle,

  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  } satisfies TextStyle,

  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  } satisfies TextStyle,

  caption: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  } satisfies TextStyle,

  numeric: {
    color: colors.text,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
} as const;
