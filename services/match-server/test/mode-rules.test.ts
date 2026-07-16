import { describe, expect, it } from "vitest";
import { applyMatchModeRules, blitzRules, rankedRules, type MatchRules } from "../src/data";

const classic: MatchRules = {
  teamPoolSize: 6,
  selectionMs: 20_000,
  answerMs: 15_000,
  revealMs: 4_000,
  reconnectMs: 60_000,
  suddenDeathMinAnswers: 1,
  winningScore: 3,
  maximumRounds: 9,
};

describe("mode-specific match rules", () => {
  it("keeps Quick on the classic first-to-three rules", () => {
    expect(applyMatchModeRules(classic, "quick")).toEqual(classic);
  });

  it("keeps Blitz short and first-to-two", () => {
    expect(applyMatchModeRules(classic, "blitz")).toEqual({ ...classic, ...blitzRules });
  });

  it("gives Ranked five extra seconds for selection and typed answers", () => {
    expect(applyMatchModeRules(classic, "ranked")).toEqual({ ...classic, ...rankedRules });
    expect(applyMatchModeRules(classic, "ranked")).toMatchObject({ selectionMs: 25_000, answerMs: 20_000, winningScore: 3, maximumRounds: 9 });
  });
});
