import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);
const migrationName = readdirSync(migrationsDirectory).find(file =>
  file.endsWith("_competition_match_summary.sql"),
);

if (!migrationName) {
  throw new Error("Competition match summary migration is missing.");
}

const migrationSource = readFileSync(
  fileURLToPath(new URL(`../../../supabase/migrations/${migrationName}`, import.meta.url)),
  "utf8",
);
const migration = migrationSource.replace(/\s+/g, " ");
const participantSummarySource = migrationSource.slice(
  migrationSource.indexOf("create or replace function private.competition_match_summary_impl"),
  migrationSource.indexOf("create or replace function public.competition_match_summary"),
);
const adminContextSource = migrationSource.slice(
  migrationSource.indexOf("create or replace function public.admin_result_report_context"),
  migrationSource.indexOf("revoke all on function private.competition_match_summary_impl"),
);
const adminContext = adminContextSource.replace(/\s+/g, " ");
const adminReturnContract = adminContextSource.slice(
  adminContextSource.indexOf("returns table"),
  adminContextSource.indexOf("language sql"),
);
const adminSource = readFileSync(
  fileURLToPath(new URL("../../../apps/admin/src/index.ts", import.meta.url)),
  "utf8",
);

describe("competition match summary database boundary", () => {
  it("guards the privileged implementation with a generic finished-participant check", () => {
    expect(migration).toMatch(
      /create or replace function private\.competition_match_summary_impl\( p_match_id uuid \) returns jsonb language plpgsql stable security definer set search_path = ''/i,
    );
    expect(migration).toMatch(
      /where match_row\.id = p_match_id and match_row\.status = 'FINISHED' and me in \(match_row\.player_one_id, match_row\.player_two_id\)/i,
    );
    expect(migration.match(/message = 'MATCH_SUMMARY_NOT_AVAILABLE'/gi)).toHaveLength(3);
    expect(migration).toMatch(
      /order by round_row\.round_number desc, round_row\.sudden_death desc limit 50/i,
    );
  });

  it("returns only the documented participant-perspective summary shape", () => {
    for (const key of [
      "match_id",
      "room_key",
      "mode",
      "finished_at",
      "outcome",
      "score_for",
      "score_against",
      "trophy_delta",
      "opponent",
      "total_round_count",
      "truncated",
      "rounds",
      "round_id",
      "round_number",
      "sudden_death",
      "clubs",
      "answered",
      "correct",
      "last_second",
      "report_status",
    ]) {
      expect(migration).toContain(`'${key}'`);
    }

    expect(participantSummarySource).not.toMatch(
      /\b(raw_answer|normalized_answer|client_command_id|submission_sequence|received_at|player_aliases)\b/i,
    );
  });

  it("scopes report state to the caller and keeps direct submission access closed", () => {
    expect(migration).toMatch(
      /report\.match_id = persisted_match\.id and report\.round_id = round_row\.id and report\.reporter_id = me/i,
    );
    expect(migration).not.toMatch(
      /(?:grant select|create policy).*public\.submissions/i,
    );
    expect(migration).not.toMatch(/\bcreate\s+(?:table|index)\b/i);
  });

  it("exposes only an authenticated invoker wrapper with explicit grants", () => {
    expect(migration).toMatch(
      /create or replace function public\.competition_match_summary\( p_match_id uuid \) returns jsonb language sql stable security invoker set search_path = ''/i,
    );
    expect(migration).toMatch(
      /revoke all on function private\.competition_match_summary_impl\(uuid\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.competition_match_summary\(uuid\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function private\.competition_match_summary_impl\(uuid\) to authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.competition_match_summary\(uuid\) to authenticated/i,
    );
  });

  it("builds report evidence from server records and authoritative answer validation", () => {
    expect(adminContext).toMatch(
      /create or replace function public\.admin_result_report_context\( p_limit integer default 50 \) returns table/i,
    );
    expect(adminContext).toMatch(
      /language sql stable security invoker set search_path = ''/i,
    );
    expect(adminContext).toMatch(
      /left join public\.rounds round_row on round_row\.id = report\.round_id and round_row\.match_id = report\.match_id/i,
    );
    expect(adminContext).toMatch(
      /left join public\.submissions reporter_submission on reporter_submission\.round_id = round_row\.id and reporter_submission\.player_id = report\.reporter_id/i,
    );
    expect(adminContext).toMatch(
      /join public\.player_aliases matched_alias on matched_alias\.player_id = matched_player\.id/i,
    );
    expect(adminContext).toMatch(
      /pair_player\.football_data_version_id = persisted_match\.football_data_version_id and pair_player\.club_low_id = round_row\.club_low_id and pair_player\.club_high_id = round_row\.club_high_id and pair_player\.is_active and matched_alias\.is_accepted_answer and matched_alias\.normalized_alias = reporter_submission\.normalized_answer/i,
    );
    expect(adminContext).toMatch(
      /\(array_agg\(answer_match\.game_name order by answer_match\.game_name\)\)\[1:3\].*limit 4/i,
    );
    expect(adminContext).toMatch(
      /limit least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/i,
    );
    expect(adminReturnContract).not.toMatch(
      /\b(alias|aliases|normalized_alias|valid_answers|accepted_answers)\b/i,
    );
  });

  it("keeps moderation evidence service-role only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.admin_result_report_context\(integer\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.admin_result_report_context\(integer\) to service_role/i,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.admin_result_report_context\(integer\) to (?:public|anon|authenticated)/i,
    );
  });

  it("renders server evidence separately from the unverified player note", () => {
    expect(adminSource).toContain(
      'adminDb.rpc("admin_result_report_context", { p_limit: 50 })',
    );
    expect(adminSource).not.toMatch(
      /from\("result_reports"\)\.select\(/,
    );
    expect(adminSource).toContain("OYUNCU NOTU · DOĞRULANMAMIŞ GİRDİ");
    expect(adminSource).toContain("DOĞRULAMA UYUŞMAZLIĞI");
    expect(adminSource).toContain("KATILIMCI DOĞRULAMASI BAŞARISIZ");
    expect(adminSource).toContain("v.matched_player_names");
    expect(adminSource).toContain("esc(v.raw_answer)");
    expect(adminSource).toContain("esc(v.normalized_answer)");
  });
});
