import assert from "node:assert/strict";
import test from "node:test";

import { buildStreakWeek, normalizeStreakStatus } from "./streak-model.ts";

test("unclaimed day three marks first two claimed, third today", () => {
  const week = buildStreakWeek({
    current_length: 2, best_length: 5, claimed_today: false,
    day_index: 3, reward_today: 20, rewards: [10, 15, 20, 25, 30, 40, 60],
  });
  assert.deepEqual(week.map(day => day.state), ["CLAIMED", "CLAIMED", "TODAY", "UPCOMING", "UPCOMING", "UPCOMING", "UPCOMING"]);
  assert.equal(week[2].reward, 20);
});

test("claimed today shows current day as claimed", () => {
  const week = buildStreakWeek({
    current_length: 3, best_length: 5, claimed_today: true,
    day_index: 3, reward_today: 20, rewards: [10, 15, 20, 25, 30, 40, 60],
  });
  assert.equal(week[2].state, "CLAIMED");
  assert.equal(week[3].state, "UPCOMING");
});

test("day index clamps to the 7-day cycle and falls back on bad rewards", () => {
  const week = buildStreakWeek({ day_index: 99, rewards: [1, 2] });
  assert.equal(week.length, 7);
  assert.equal(week[6].state, "TODAY");
  assert.equal(week[0].reward, 10);
});

test("normalize fills defaults for malformed payloads", () => {
  const status = normalizeStreakStatus({ current_length: "4", day_index: null, claimed_today: "yes" });
  assert.equal(status.current_length, 4);
  assert.equal(status.day_index, 1);
  assert.equal(status.claimed_today, false);
  assert.equal(status.rewards.length, 7);
});
