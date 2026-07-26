import type { MatchTicketMode } from "./auth";

export const rematchModeFromMatchId = (matchId: string): MatchTicketMode | undefined => {
  if (!matchId.includes("-rematch-")) return undefined;
  if (matchId.startsWith("quick-")) return "quick";
  if (matchId.startsWith("blitz-")) return "blitz";
  if (matchId.startsWith("ranked-")) return "ranked";
  if (matchId.startsWith("event-")) return "event";
  return undefined;
};
