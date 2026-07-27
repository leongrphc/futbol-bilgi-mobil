export type StreakStatus = {
  current_length: number;
  best_length: number;
  claimed_today: boolean | null;
  day_index: number;
  reward_today: number;
  rewards: number[];
};

export type StreakDay = {
  index: number;
  reward: number;
  state: "CLAIMED" | "TODAY" | "UPCOMING";
};

const FALLBACK_REWARDS = [10, 15, 20, 25, 30, 40, 60];

const asCount = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
};

export function buildStreakWeek(status: StreakStatus | null | undefined): StreakDay[] {
  const rewards = Array.isArray(status?.rewards) && status.rewards.length === 7
    ? status.rewards.map(value => asCount(value))
    : FALLBACK_REWARDS;
  const dayIndex = Math.min(Math.max(asCount(status?.day_index, 1), 1), 7);
  const claimedToday = status?.claimed_today === true;

  return rewards.map((reward, position) => {
    const index = position + 1;
    let state: StreakDay["state"] = "UPCOMING";
    if (index < dayIndex || (index === dayIndex && claimedToday)) state = "CLAIMED";
    else if (index === dayIndex) state = "TODAY";
    return { index, reward, state };
  });
}

export function normalizeStreakStatus(raw: unknown): StreakStatus {
  const value = (raw ?? {}) as Partial<StreakStatus>;
  return {
    current_length: asCount(value.current_length),
    best_length: asCount(value.best_length),
    claimed_today: value.claimed_today === true,
    day_index: Math.min(Math.max(asCount(value.day_index, 1), 1), 7),
    reward_today: asCount(value.reward_today, FALLBACK_REWARDS[0]),
    rewards: Array.isArray(value.rewards) && value.rewards.length === 7
      ? value.rewards.map(item => asCount(item))
      : FALLBACK_REWARDS,
  };
}
