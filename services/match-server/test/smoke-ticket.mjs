import { SignJWT } from "jose";

export async function createSmokeTicket({ playerId, matchId, mode = "bot", base }) {
  const accessToken = process.env.MATCH_ACCESS_TOKEN;
  if (accessToken) {
    if (!base) throw new Error("MATCH_URL must be provided when using MATCH_ACCESS_TOKEN");
    const endpoint = `${base.replace(/^ws/i, "http")}/match-token`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, mode }),
    });
    if (!response.ok) throw new Error(`match ticket request failed (${response.status}): ${await response.text()}`);
    const payload = await response.json();
    if (typeof payload.token !== "string") throw new Error("match ticket response did not include a token");
    return payload.token;
  }

  const secret = process.env.MATCH_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MATCH_TOKEN_SECRET must be set to the Worker secret (minimum 32 characters)");
  }

  return new SignJWT({ match_id: matchId, mode })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(playerId)
    .setAudience("football-link-match")
    .setIssuer("football-link-worker")
    .setIssuedAt()
    .setExpirationTime("60s")
    .setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(secret));
}

export function matchSocketUrl(base, matchId, ticket) {
  return `${base}/match/${encodeURIComponent(matchId)}?token=${encodeURIComponent(ticket)}`;
}
