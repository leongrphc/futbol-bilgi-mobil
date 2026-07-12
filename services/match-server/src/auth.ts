import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

export interface AuthEnv { SUPABASE_URL: string; MATCH_TOKEN_SECRET: string }
export type MatchTicketMode = "bot" | "quick" | "blitz" | "event";
export interface MatchTicket { playerId: string; matchId: string; mode?: MatchTicketMode | undefined }

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function keySet(url: string) {
  let value = keySets.get(url);
  if (!value) {
    value = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
    keySets.set(url, value);
  }
  return value;
}

export async function verifySupabaseAccessToken(token: string, env: AuthEnv): Promise<string> {
  const { payload } = await jwtVerify(token, keySet(env.SUPABASE_URL), { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: "authenticated" });
  if (!payload.sub) throw new Error("TOKEN_SUBJECT_MISSING");
  return payload.sub;
}

export async function createMatchTicket(ticket: MatchTicket, secret: string): Promise<string> {
  return new SignJWT({ match_id: ticket.matchId, mode: ticket.mode })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(ticket.playerId).setAudience("football-link-match").setIssuer("football-link-worker")
    .setIssuedAt().setExpirationTime("60s").setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(secret));
}

export async function verifyMatchTicket(token: string, matchId: string, secret: string): Promise<MatchTicket> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"], audience: "football-link-match", issuer: "football-link-worker" });
  if (!payload.sub || payload.match_id !== matchId) throw new Error("MATCH_TICKET_SCOPE_INVALID");
  const mode = payload.mode === "bot" || payload.mode === "quick" || payload.mode === "blitz" || payload.mode === "event"
    ? payload.mode
    : undefined;
  return { playerId: payload.sub, matchId, mode };
}
