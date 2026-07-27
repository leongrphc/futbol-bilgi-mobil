import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);
const migrationName = readdirSync(migrationsDirectory).find(file =>
  file.endsWith("_restrict_profile_private_columns.sql"),
);

if (!migrationName) {
  throw new Error("Profile private column migration is missing.");
}

const migration = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

const PRIVATE_COLUMNS = ["coins", "dollars", "preferred_locale", "tutorial_completed_at"];

const grantedColumns = migration
  .match(/grant select \(([^)]*)\) on table public\.profiles to authenticated/i)?.[1]
  .split(",")
  .map(column => column.trim())
  .filter(Boolean) ?? [];

describe("profile private column boundaries", () => {
  it("drops table-wide profile reads for every client role", () => {
    expect(migration).toMatch(
      /revoke select on table public\.profiles from anon, authenticated/i,
    );
  });

  it("re-grants only the public player card columns", () => {
    expect(grantedColumns).toEqual([
      "id",
      "display_name",
      "player_code",
      "avatar_url",
      "trophies",
      "blitz_trophies",
      "ranked_trophies",
      "created_at",
    ]);
    for (const column of PRIVATE_COLUMNS) {
      expect(grantedColumns).not.toContain(column);
    }
  });

  it("keeps the ladder and player card columns readable so invoker RPCs still resolve", () => {
    // competition_quick_nearby and competition_ranked_nearby run as security
    // invoker and read these columns straight from public.profiles.
    for (const column of ["display_name", "player_code", "trophies", "ranked_trophies", "created_at"]) {
      expect(grantedColumns).toContain(column);
    }
  });

  it("returns the private columns only through an owner-scoped definer RPC", () => {
    expect(migration).toMatch(
      /create or replace function public\.profile_self\(\) returns jsonb language plpgsql security definer set search_path = ''/i,
    );
    expect(migration).toMatch(/me uuid := auth\.uid\(\);/i);
    expect(migration).toMatch(/if me is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;/i);
    expect(migration).toMatch(/select \* into profile_row from public\.profiles where id = me;/i);
    for (const column of PRIVATE_COLUMNS) {
      expect(migration).toMatch(new RegExp(`'${column}', profile_row\\.${column}`, "i"));
    }
  });

  it("keeps the RPC off anonymous clients", () => {
    expect(migration).toMatch(/revoke all on function public\.profile_self\(\) from public, anon;/i);
    expect(migration).toMatch(/grant execute on function public\.profile_self\(\) to authenticated;/i);
  });
});

const mobileSources = [
  "apps/mobile/src/auth/auth-context.tsx",
  "apps/mobile/app/match.tsx",
  "apps/mobile/app/settings.tsx",
  "apps/mobile/src/language/account-language-sync.tsx",
  "apps/mobile/src/onboarding/tutorial.ts",
  "apps/mobile/src/profile/avatar.ts",
].map(relativePath => ({
  relativePath,
  source: readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    "utf8",
  ),
}));

describe("mobile profile reads", () => {
  it("never selects a private column from the profiles table", () => {
    for (const { relativePath, source } of mobileSources) {
      const selects = source.match(/from\("profiles"\)\s*\.select\((["'`])(.*?)\1/gs) ?? [];
      for (const select of selects) {
        for (const column of PRIVATE_COLUMNS) {
          expect(select, `${relativePath} selects ${column} from the profiles table`)
            .not.toContain(column);
        }
      }
    }
  });

  it("loads the owner profile through profile_self", () => {
    const authContext = mobileSources.find(entry => entry.relativePath.endsWith("auth-context.tsx"));
    expect(authContext?.source).toMatch(/supabase\.rpc\("profile_self"\)/);
    expect(authContext?.source).not.toMatch(/from\("profiles"\)\s*\.select/);
  });
});
