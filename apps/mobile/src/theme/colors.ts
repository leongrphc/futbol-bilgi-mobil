export const colors = {
  background: "#07121C",
  surface: "#10222E",
  surfaceElevated: "#18313F",
  primary: "#59D5A6",
  accent: "#FFB454",
  text: "#F6F1E7",
  muted: "#9BB0B9",
  danger: "#FF716C",
  border: "#284452",
  pitchLine: "#3A7567",
  floodlight: "#FFF3CF",
  ink: "#081720",
  signal: "#FF6B3D",

  // Mode identities. Quick shares the brand green; Blitz and Ranked own
  // their lanes. Never use `ranked` for rewards — that is what `reward` is for.
  quick: "#59D5A6",
  blitz: "#8B6CFF",
  blitzSoft: "#B896FF",
  blitzDeep: "#1A1028",
  ranked: "#F3C969",
  rankedDeep: "#241D16",

  // Economy and celebration. Warm amber, deliberately hotter than the pale
  // ranked gold so "prize" reads differently from "ranked mode".
  reward: "#FFB454",
  rewardDeep: "rgba(255,180,84,.10)",
  rewardBorder: "rgba(255,180,84,.38)",

  // Outcome tones.
  win: "#59D5A6",
  winWash: "rgba(89,213,166,.10)",
  loss: "#FF716C",
  lossWash: "rgba(255,113,108,.10)",
} as const;
