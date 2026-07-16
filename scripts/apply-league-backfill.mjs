import fs from "node:fs";

const clubs = JSON.parse(fs.readFileSync("football-data-builder-v4/config/clubs.json", "utf8"));
const esc = (value) => String(value ?? "").replace(/'/g, "''");
const values = clubs
  .filter((club) => club.slug && club.league)
  .map((club) => `('${esc(club.slug)}','${esc(club.league)}','${esc(club.country)}')`)
  .join(",\n");

const sql = `update public.clubs c
set league = v.league, country = v.country
from (values
${values}
) as v(external_id, league, country)
where c.external_id = v.external_id;
`;

fs.writeFileSync("scripts/_league_backfill_exec.sql", sql);
console.log("sql_bytes", Buffer.byteLength(sql));
console.log("rows", clubs.filter((c) => c.slug && c.league).length);
