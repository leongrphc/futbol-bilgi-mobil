export type RematchRouteMode = "quick" | "blitz" | "ranked" | "event";

export function normalizeRematchMode(value: unknown): RematchRouteMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === "quick" || normalized === "blitz" || normalized === "ranked" || normalized === "event"
    ? normalized
    : undefined;
}
