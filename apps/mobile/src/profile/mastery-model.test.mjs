import assert from "node:assert/strict";
import test from "node:test";

import { buildMasteryStandings, masteryTierFor, nextMasteryTarget } from "./mastery-model.ts";

test("tier thresholds map correct counts to tiers", () => {
  assert.equal(masteryTierFor(0), "NONE");
  assert.equal(masteryTierFor(9), "NONE");
  assert.equal(masteryTierFor(10), "BRONZE");
  assert.equal(masteryTierFor(24), "BRONZE");
  assert.equal(masteryTierFor(25), "SILVER");
  assert.equal(masteryTierFor(60), "GOLD");
  assert.equal(masteryTierFor(500), "GOLD");
});

test("next target walks the ladder and stops at gold", () => {
  assert.equal(nextMasteryTarget(0), 10);
  assert.equal(nextMasteryTarget(10), 25);
  assert.equal(nextMasteryTarget(40), 60);
  assert.equal(nextMasteryTarget(60), null);
});

test("standings sort by correct then hit rate and compute progress", () => {
  const rows = buildMasteryStandings([
    { club_external_id: "a", club_name: "Alpha", correct_count: 12, attempt_count: 20, hit_rate: 60 },
    { club_external_id: "b", club_name: "Beta", correct_count: 30, attempt_count: 33, hit_rate: 90.9 },
    { club_external_id: "c", club_name: "Gamma", correct_count: 12, attempt_count: 14, hit_rate: 85.7 },
  ]);
  assert.deepEqual(rows.map(row => row.clubExternalId), ["b", "c", "a"]);
  assert.equal(rows[0].tier, "SILVER");
  assert.equal(rows[0].nextTierAt, 60);
  assert.ok(Math.abs(rows[0].progress - (30 - 25) / (60 - 25)) < 1e-9);
});

test("gold rows report full progress and no next target", () => {
  const [row] = buildMasteryStandings([
    { club_external_id: "x", club_name: "X", correct_count: 75, attempt_count: 80, hit_rate: 93.8 },
  ]);
  assert.equal(row.tier, "GOLD");
  assert.equal(row.nextTierAt, null);
  assert.equal(row.progress, 1);
});

test("malformed rows are dropped and counts coerced", () => {
  const rows = buildMasteryStandings([
    { club_external_id: "", club_name: "Bad", correct_count: 5, attempt_count: 5, hit_rate: 100 },
    { club_external_id: "ok", club_name: "", correct_count: "7", attempt_count: Number.NaN, hit_rate: Number.NaN },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clubName, "ok");
  assert.equal(rows[0].correct, 7);
  assert.equal(rows[0].attempts, 0);
});
