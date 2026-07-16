import { describe, expect, it } from "vitest";
import { createMatchTicket, verifyMatchTicket } from "../src/auth";

const secret = "test-secret-that-is-long-enough-for-hmac";

describe("match tickets", () => {
  it("binds a player ticket to one match", async () => {
    const token = await createMatchTicket({ playerId: "player-1", matchId: "room-a", mode: "bot" }, secret);
    await expect(verifyMatchTicket(token, "room-a", secret)).resolves.toEqual({ playerId: "player-1", matchId: "room-a", mode: "bot" });
    await expect(verifyMatchTicket(token, "room-b", secret)).rejects.toThrow("MATCH_TICKET_SCOPE_INVALID");
  });

  it("rejects tickets signed with another secret", async () => {
    const token = await createMatchTicket({ playerId: "player-1", matchId: "room-a" }, secret);
    await expect(verifyMatchTicket(token, "room-a", "another-secret-that-is-long-enough")).rejects.toThrow();
  });

  it("keeps Ranked mode bound to the signed match ticket", async () => {
    const token = await createMatchTicket({ playerId: "player-ranked", matchId: "ranked-room", mode: "ranked" }, secret);
    await expect(verifyMatchTicket(token, "ranked-room", secret)).resolves.toMatchObject({ playerId: "player-ranked", mode: "ranked" });
  });
});
