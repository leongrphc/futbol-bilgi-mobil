import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);
const migrationName = readdirSync(migrationsDirectory).find(file =>
  file.endsWith("_friends_weekly_league.sql"),
);

if (!migrationName) {
  throw new Error("Friends weekly league migration is missing.");
}

const migration = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("friends weekly league boundaries", () => {
  it("runs as security definer with an empty search path", () => {
    expect(migration).toMatch(
      /create or replace function public\.social_friends_weekly_league\(\)[\s\S]*?security definer set search_path = ''/i,
    );
  });

  it("scopes membership to the caller and accepted friendships only", () => {
    expect(migration).toMatch(/where p\.id = auth\.uid\(\)/i);
    expect(migration).toMatch(/where f\.status = 'ACCEPTED' and auth\.uid\(\) in \(f\.requester_id, f\.addressee_id\)/i);
    expect(migration).toMatch(/where auth\.uid\(\) is not null/i);
  });

  it("aggregates only finished trophy-mode matches from the current week", () => {
    expect(migration).toMatch(/m\.status = 'FINISHED'/i);
    expect(migration).toMatch(/m\.mode in \('QUICK', 'BLITZ', 'RANKED'\)/i);
    expect(migration).toMatch(/m\.finished_at >= date_trunc\('week', now\(\)\)/i);
  });

  it("returns aggregates only — no answers, aliases, submissions or match ids", () => {
    expect(migration).not.toMatch(/submissions/i);
    expect(migration).not.toMatch(/alias/i);
    expect(migration).not.toMatch(/raw_answer|normalized_answer/i);
    expect(migration).not.toMatch(/returns table\([^)]*match_id/i);
  });

  it("is executable by authenticated users only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.social_friends_weekly_league\(\) from public, anon/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.social_friends_weekly_league\(\) to authenticated/i,
    );
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+table/i);
  });
});
