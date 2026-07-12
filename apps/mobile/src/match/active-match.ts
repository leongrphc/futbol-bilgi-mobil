import AsyncStorage from "@react-native-async-storage/async-storage";

const ACTIVE_MATCH_KEY = "football-link:active-match";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ActiveMatch = { matchId: string; playerId: string; mode?: "bot"; savedAt: number };

export async function saveActiveMatch(match: Omit<ActiveMatch, "savedAt">): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({ ...match, savedAt: Date.now() }));
}

export async function getActiveMatch(): Promise<ActiveMatch | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_MATCH_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ActiveMatch>;
    if (typeof value.matchId !== "string" || typeof value.playerId !== "string" || typeof value.savedAt !== "number" || Date.now() - value.savedAt > MAX_AGE_MS) {
      await clearActiveMatch();
      return null;
    }
    return { matchId: value.matchId, playerId: value.playerId, savedAt: value.savedAt, ...(value.mode === "bot" ? { mode: "bot" as const } : {}) };
  } catch {
    await clearActiveMatch();
    return null;
  }
}

export const clearActiveMatch = () => AsyncStorage.removeItem(ACTIVE_MATCH_KEY);
