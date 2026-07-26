import { describe, expect, it } from "vitest";
import { rematchModeFromMatchId } from "../src/rematch-mode";

describe("rematch mode inference", () => {
  it.each([
    ["quick-room-rematch-abc", "quick"],
    ["blitz-room-rematch-abc", "blitz"],
    ["ranked-room-rematch-abc", "ranked"],
    ["event-room-rematch-abc", "event"],
  ] as const)("keeps %s in its original mode", (matchId, expected) => {
    expect(rematchModeFromMatchId(matchId)).toBe(expected);
  });

  it("does not infer a competitive mode for normal or friend room ids", () => {
    expect(rematchModeFromMatchId("quick-room")).toBeUndefined();
    expect(rematchModeFromMatchId("friend-room-rematch-abc")).toBeUndefined();
  });
});
