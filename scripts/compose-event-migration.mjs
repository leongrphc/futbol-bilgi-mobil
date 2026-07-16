import fs from "node:fs";

const backfill = fs
  .readFileSync("supabase/migrations/_tmp_club_league_backfill.sql", "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith("--"))
  .join("\n");
const rest = fs.readFileSync("scripts/_event_week_rest.sql", "utf8");
const out = `-- Event Week: admin-run league-scoped fun mode (no trophies)
-- Backfill clubs.league/country from builder config (was null in prod)

${backfill}

${rest}
`;
fs.writeFileSync("supabase/migrations/20260713240000_event_week.sql", out);
console.log("bytes", Buffer.byteLength(out));
