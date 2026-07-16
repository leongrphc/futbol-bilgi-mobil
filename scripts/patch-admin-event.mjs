import fs from "node:fs";

const path = "apps/admin/src/index.ts";
let src = fs.readFileSync(path, "utf8");

const oldCss = ".ACTIVE,.SUCCEEDED,.RESOLVED{color:var(--turf)}.OPEN,.FAILED{color:var(--signal)}select{background:var(--ink);color:var(--text);border:1px solid var(--line);padding:7px;border-radius:8px}#login{max-width:420px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px}input{width:100%;background:var(--ink);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:13px;margin:6px 0}button{border:0;border-radius:10px;padding:12px 16px;background:var(--turf);color:var(--ink);font-weight:900;cursor:pointer}.error{color:#ff716c;font-size:12px}@media(max-width:800px){.hero,.grid{grid-template-columns:1fr}.headline h1{font-size:34px}.shell{padding:16px}}";
const newCss = ".ACTIVE,.SUCCEEDED,.RESOLVED,.LIVE{color:var(--turf)}.OPEN,.FAILED,.ENDED{color:var(--signal)}.DRAFT{color:var(--muted)}select{background:var(--ink);color:var(--text);border:1px solid var(--line);padding:7px;border-radius:8px}#login{max-width:420px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px}input{width:100%;background:var(--ink);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:13px;margin:6px 0}button{border:0;border-radius:10px;padding:12px 16px;background:var(--turf);color:var(--ink);font-weight:900;cursor:pointer}.btn-dim{background:var(--line);color:var(--text)}.error{color:#ff716c;font-size:12px}.form-row{display:grid;grid-template-columns:1.2fr 1.2fr 1fr auto;gap:8px;padding:14px 18px;border-bottom:1px solid var(--line);align-items:center}@media(max-width:800px){.hero,.grid,.form-row{grid-template-columns:1fr}.headline h1{font-size:34px}.shell{padding:16px}}";

if (!src.includes(oldCss)) {
  console.error("css block not found");
  process.exit(1);
}
src = src.replace(oldCss, newCss);

const oldFns = "async function toggleClub(id,active){mutate('/api/clubs/'+encodeURIComponent(id),{active})}async function activateVersion(id){if(confirm('Bu veri sürümü canlı maçlar için aktif edilsin mi?'))mutate('/api/versions/'+encodeURIComponent(id)+'/activate',{})}";
const newFns = "async function toggleClub(id,active){mutate('/api/clubs/'+encodeURIComponent(id),{active})}async function activateVersion(id){if(confirm('Bu veri sürümü canlı maçlar için aktif edilsin mi?'))mutate('/api/versions/'+encodeURIComponent(id)+'/activate',{})}async function createEvent(){const league=document.getElementById('evLeague').value;const title_tr=document.getElementById('evTitleTr').value;const title_en=document.getElementById('evTitleEn').value;if(!league)return alert('Lig seç');await mutate('/api/events',{league,title_tr,title_en})}async function goLiveEvent(id){if(confirm('Bu event canlıya alınsın mı? Diğer canlı event biter.'))mutate('/api/events/'+encodeURIComponent(id)+'/live',{})}async function endEvent(id){if(confirm('Canlı event bitsin mi?'))mutate('/api/events/'+encodeURIComponent(id)+'/end',{})}";
if (!src.includes(oldFns)) {
  console.error("fn block not found");
  process.exit(1);
}
src = src.replace(oldFns, newFns);

const oldLoadStart = "const clubs=d.clubs.map(v=>'<div class=\"row\"><div><b>'+esc(v.name)+'</b><div class=\"muted\">'+esc(v.external_id)+'</div></div><button style=\"background:'+(v.active?'var(--turf)':'var(--line)')+'\" onclick=\"toggleClub(\\''+esc(v.id)+'\\','+(!v.active)+')\">'+(v.active?'Aktif':'Kapalı')+'</button></div>').join('');app.innerHTML=";
const newLoadStart = "const clubs=d.clubs.map(v=>'<div class=\"row\"><div><b>'+esc(v.name)+'</b><div class=\"muted\">'+esc(v.external_id)+(v.league?' · '+esc(v.league):'')+'</div></div><button style=\"background:'+(v.active?'var(--turf)':'var(--line)')+'\" onclick=\"toggleClub(\\''+esc(v.id)+'\\','+(!v.active)+')\">'+(v.active?'Aktif':'Kapalı')+'</button></div>').join('');const leagueOpts=(d.leagues||[]).map(l=>'<option value=\"'+esc(l.league)+'\">'+esc(l.league)+' ('+esc(l.active_club_count)+')</option>').join('');const events=(d.events||[]).map(e=>'<div class=\"row\"><div><b>'+esc(e.title_tr)+'</b><div class=\"muted\">'+esc(e.league)+' · '+esc(e.club_count)+' kulüp · '+esc(e.title_en)+'</div></div><div style=\"display:flex;gap:8px;align-items:center\"><span class=\"tag '+esc(e.status)+'\">'+esc(e.status)+'</span>'+(e.status==='LIVE'?'<button class=\"btn-dim\" onclick=\"endEvent(\\''+esc(e.id)+'\\')\">Bitir</button>':(e.status!=='ENDED'?'<button onclick=\"goLiveEvent(\\''+esc(e.id)+'\\')\">Canlıya al</button>':''))+'</div></div>').join('')||'<div class=\"row muted\">Henüz event yok.</div>';app.innerHTML=";
if (!src.includes(oldLoadStart)) {
  console.error("load start not found");
  process.exit(1);
}
src = src.replace(oldLoadStart, newLoadStart);

const oldGrid = "<section class=\"grid\"><div class=\"panel\"><h2>FUTBOL VERİ SÜRÜMLERİ</h2>'+versions+'</div>";
const newGrid = "<section class=\"grid\"><div class=\"panel\" style=\"grid-column:1/-1\"><h2>EVENT WEEK · LİG HAFTASI</h2><div class=\"form-row\"><input id=\"evTitleTr\" placeholder=\"Başlık TR (opsiyonel)\"><input id=\"evTitleEn\" placeholder=\"Title EN (optional)\"><select id=\"evLeague\"><option value=\"\">Lig seç…</option>'+leagueOpts+'</select><button onclick=\"createEvent()\">Draft oluştur</button></div>'+events+'</div><div class=\"panel\"><h2>FUTBOL VERİ SÜRÜMLERİ</h2>'+versions+'</div>";
if (!src.includes(oldGrid)) {
  console.error("grid start not found");
  process.exit(1);
}
src = src.replace(oldGrid, newGrid);

fs.writeFileSync(path, src);
console.log("admin patched");
