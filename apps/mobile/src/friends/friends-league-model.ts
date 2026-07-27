export type FriendsLeagueRow = {
  player_id: string;
  display_name: string;
  player_code: string;
  is_me: boolean;
  weekly_trophy_delta: number;
  weekly_wins: number;
  weekly_losses: number;
  weekly_matches: number;
};

export type FriendsLeagueStanding = {
  rank: number;
  playerId: string;
  displayName: string;
  playerCode: string;
  isMe: boolean;
  trophyDelta: number;
  wins: number;
  losses: number;
  matches: number;
};

const asCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

export function buildFriendsLeague(rows: readonly FriendsLeagueRow[]): FriendsLeagueStanding[] {
  const standings = rows
    .filter(row => row && typeof row.player_id === "string" && row.player_id.length > 0)
    .map(row => ({
      rank: 0,
      playerId: row.player_id,
      displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : row.player_code ?? "?",
      playerCode: row.player_code ?? "",
      isMe: row.is_me === true,
      trophyDelta: asCount(row.weekly_trophy_delta),
      wins: asCount(row.weekly_wins),
      losses: asCount(row.weekly_losses),
      matches: asCount(row.weekly_matches),
    }))
    .sort((a, b) =>
      b.trophyDelta - a.trophyDelta
      || b.wins - a.wins
      || a.displayName.localeCompare(b.displayName)
      || a.playerId.localeCompare(b.playerId));

  let previous: FriendsLeagueStanding | undefined;
  return standings.map((standing, index) => {
    const tied = previous && previous.trophyDelta === standing.trophyDelta && previous.wins === standing.wins;
    const ranked = { ...standing, rank: tied && previous ? previous.rank : index + 1 };
    previous = ranked;
    return ranked;
  });
}

export function formatWeeklyDelta(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}
