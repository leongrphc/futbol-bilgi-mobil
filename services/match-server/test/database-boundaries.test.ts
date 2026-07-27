import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);
const migrationName = readdirSync(migrationsDirectory).find(file =>
  file.endsWith("_harden_client_mutation_boundaries.sql"),
);

if (!migrationName) {
  throw new Error("Client mutation hardening migration is missing.");
}

const migration = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("database client mutation boundaries", () => {
  it("keeps friendship consent changes behind the validated social RPCs", () => {
    expect(migration).toMatch(
      /create policy friendships_participant_read .* for select .* to authenticated/i,
    );
    expect(migration).toMatch(
      /using \( \(select auth\.uid\(\)\) in \(requester_id, addressee_id\) \)/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.friendships from anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.friendships to authenticated/i,
    );
  });

  it("keeps result report writes behind the participant-checking RPC", () => {
    expect(migration).toMatch(
      /create or replace function public\.submit_result_report\([\s\S]*?security definer\s+set search_path = ''/i,
    );
    expect(migration).toMatch(
      /where room_key = trim\(p_room_key\) and reporter in \(player_one_id, player_two_id\)/i,
    );
    expect(migration).toMatch(
      /where match_id = persisted_match_id and round_number = p_round_ordinal/i,
    );
    expect(migration).toMatch(
      /create policy result_reports_reporter_read .* using \( reporter_id = \(select auth\.uid\(\)\) \)/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.result_reports from anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.result_reports to authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete|all)\s+on\s+table\s+public\.result_reports\s+to\s+authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.submit_result_report\(text, integer, text, text\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.submit_result_report\(text, integer, text, text\) to authenticated/i,
    );
  });

  it("constrains report fields even for privileged writers", () => {
    expect(migration).toMatch(
      /check \(reason_code in \('WRONG_RESULT', 'OFFENSIVE_CONTENT', 'OTHER'\)\)/i,
    );
    expect(migration).toMatch(
      /check \(detail is null or char_length\(detail\) <= 500\)/i,
    );
    expect(migration).toMatch(
      /check \(status in \('OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED'\)\)/i,
    );
  });
});
