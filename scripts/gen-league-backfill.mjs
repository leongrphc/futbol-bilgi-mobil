import fs from "node:fs";

const clubs = JSON.parse(fs.readFileSync("football-data-builder-v4/config/clubs.json", "utf8"));
const esc = (value) => String(value ?? "").replace(/'/g, "''");
const lines = ["-- backfill club league/country from builder config"];
for (const club of clubs) {
  if (!club.slug || !club.league) continue;
  lines.push(
    `update public.clubs set league='${esc(club.league)}', country='${esc(club.country)}' where external_id='${esc(club.slug)}';`,
  );
}
fs.writeFileSync("supabase/migrations/_tmp_club_league_backfill.sql", `${lines.join("\n")}\n`);
console.log("updates", lines.length - 1);
