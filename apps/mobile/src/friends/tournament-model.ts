export type TournamentMemberView = {
  playerId: string;
  displayName: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  isMe: boolean;
};

export type TournamentMatchView = {
  slot: 1 | 2 | 3;
  status: "PENDING" | "DONE";
  playerOne: { playerId: string; displayName: string };
  playerTwo: { playerId: string; displayName: string };
  winnerId: string | null;
  roomKey: string | null;
  involvesMe: boolean;
};

export type TournamentView = {
  tournamentId: string;
  status: "PENDING" | "ACTIVE" | "FINISHED" | "CANCELLED";
  creatorId: string;
  winner: { playerId: string; displayName: string } | null;
  members: TournamentMemberView[];
  matches: TournamentMatchView[];
  myPendingMatch: TournamentMatchView | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const asText = (value: unknown): string => typeof value === "string" ? value : "";

const parsePlayer = (value: unknown): { playerId: string; displayName: string } => {
  const row = asRecord(value);
  return { playerId: asText(row.player_id), displayName: asText(row.display_name) || "?" };
};

export function parseTournament(raw: unknown, myPlayerId: string): TournamentView | null {
  if (!raw || typeof raw !== "object") return null;
  const row = asRecord(raw);
  const tournamentId = asText(row.tournament_id);
  const status = asText(row.status);
  if (!tournamentId) return null;
  if (status !== "PENDING" && status !== "ACTIVE" && status !== "FINISHED" && status !== "CANCELLED") return null;

  const members: TournamentMemberView[] = (Array.isArray(row.members) ? row.members : []).flatMap(item => {
    const member = asRecord(item);
    const playerId = asText(member.player_id);
    const memberStatus = asText(member.status);
    if (!playerId) return [];
    if (memberStatus !== "INVITED" && memberStatus !== "ACCEPTED" && memberStatus !== "DECLINED") return [];
    return [{
      playerId,
      displayName: asText(member.display_name) || "?",
      status: memberStatus,
      isMe: member.is_me === true || playerId === myPlayerId,
    }];
  });

  const matches: TournamentMatchView[] = (Array.isArray(row.matches) ? row.matches : []).flatMap(item => {
    const match = asRecord(item);
    const slot = Number(match.slot);
    const matchStatus = asText(match.status);
    if (slot !== 1 && slot !== 2 && slot !== 3) return [];
    if (matchStatus !== "PENDING" && matchStatus !== "DONE") return [];
    const playerOne = parsePlayer(match.player_one);
    const playerTwo = parsePlayer(match.player_two);
    return [{
      slot: slot as 1 | 2 | 3,
      status: matchStatus as "PENDING" | "DONE",
      playerOne,
      playerTwo,
      winnerId: typeof match.winner_id === "string" ? match.winner_id : null,
      roomKey: typeof match.room_key === "string" && match.room_key ? match.room_key : null,
      involvesMe: playerOne.playerId === myPlayerId || playerTwo.playerId === myPlayerId,
    }];
  }).sort((a, b) => a.slot - b.slot);

  return {
    tournamentId,
    status,
    creatorId: asText(row.creator_id),
    winner: row.winner ? parsePlayer(row.winner) : null,
    members,
    matches,
    myPendingMatch: matches.find(match => match.status === "PENDING" && match.involvesMe && match.roomKey) ?? null,
  };
}
