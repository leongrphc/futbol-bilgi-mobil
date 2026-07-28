import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);
const migrationName = readdirSync(migrationsDirectory).find(file =>
  file.endsWith("_complete_tutorial_rpc.sql"),
);

if (!migrationName) {
  throw new Error("Tutorial completion RPC migration is missing.");
}

const migration = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");
const tutorialClient = readFileSync(
  fileURLToPath(new URL("../../../apps/mobile/src/onboarding/tutorial.ts", import.meta.url)),
  "utf8",
);

describe("tutorial completion boundaries", () => {
  it("completes only the authenticated player's tutorial", () => {
    expect(migration).toMatch(
      /create or replace function public\.complete_tutorial\(\) returns timestamptz language plpgsql security definer set search_path = ''/i,
    );
    expect(migration).toMatch(/me uuid := auth\.uid\(\);/i);
    expect(migration).toMatch(/where id = me for update;/i);
    expect(migration).toMatch(/update public\.profiles set tutorial_completed_at = completed_at where id = me;/i);
  });

  it("is idempotent and unavailable to anonymous clients", () => {
    expect(migration).toMatch(/if completed_at is null then/i);
    expect(migration).toMatch(/revoke all on function public\.complete_tutorial\(\) from public, anon;/i);
    expect(migration).toMatch(/grant execute on function public\.complete_tutorial\(\) to authenticated;/i);
  });

  it("does not expose tutorial progress through direct profile updates", () => {
    expect(migration).toMatch(
      /revoke update \(tutorial_completed_at\) on table public\.profiles from authenticated;/i,
    );
    expect(tutorialClient).toMatch(/supabase\.rpc\("complete_tutorial"\)/);
    expect(tutorialClient).not.toMatch(/from\("profiles"\)/);
    expect(tutorialClient).not.toMatch(/tutorial_completed_at/);
  });
});
