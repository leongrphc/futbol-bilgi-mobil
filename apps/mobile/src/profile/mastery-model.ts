export type MasteryRow = {
  club_external_id: string;
  club_name: string;
  correct_count: number;
  attempt_count: number;
  hit_rate: number;
};

export type MasteryTier = "NONE" | "BRONZE" | "SILVER" | "GOLD";

export type MasteryStanding = {
  clubExternalId: string;
  clubName: string;
  correct: number;
  attempts: number;
  hitRate: number;
  tier: MasteryTier;
  nextTierAt: number | null;
  progress: number;
};

export const MASTERY_THRESHOLDS: Array<{ tier: MasteryTier; min: number }> = [
  { tier: "GOLD", min: 60 },
  { tier: "SILVER", min: 25 },
  { tier: "BRONZE", min: 10 },
];

export function masteryTierFor(correct: number): MasteryTier {
  for (const { tier, min } of MASTERY_THRESHOLDS) {
    if (correct >= min) return tier;
  }
  return "NONE";
}

export function nextMasteryTarget(correct: number): number | null {
  const targets = [...MASTERY_THRESHOLDS].reverse();
  for (const { min } of targets) {
    if (correct < min) return min;
  }
  return null;
}

const asCount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
};

export function buildMasteryStandings(rows: readonly MasteryRow[]): MasteryStanding[] {
  return rows
    .filter(row => row && typeof row.club_external_id === "string" && row.club_external_id.length > 0)
    .map(row => {
      const correct = asCount(row.correct_count);
      const nextTierAt = nextMasteryTarget(correct);
      const previousFloor = MASTERY_THRESHOLDS
        .map(item => item.min)
        .filter(min => min <= correct)
        .reduce((max, min) => Math.max(max, min), 0);
      const span = nextTierAt == null ? 1 : nextTierAt - previousFloor;
      return {
        clubExternalId: row.club_external_id,
        clubName: typeof row.club_name === "string" && row.club_name ? row.club_name : row.club_external_id,
        correct,
        attempts: asCount(row.attempt_count),
        hitRate: Number.isFinite(row.hit_rate) ? Number(row.hit_rate) : 0,
        tier: masteryTierFor(correct),
        nextTierAt,
        progress: nextTierAt == null ? 1 : Math.min(1, Math.max(0, (correct - previousFloor) / span)),
      };
    })
    .sort((a, b) => b.correct - a.correct || b.hitRate - a.hitRate || a.clubName.localeCompare(b.clubName));
}
