import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL, anonKey = process.env.SUPABASE_ANON_KEY, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const adminDb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const port = Number(process.env.ADMIN_PORT ?? 4173);

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
const cookies = (req: IncomingMessage) => Object.fromEntries((req.headers.cookie ?? "").split(";").filter(Boolean).map(value => {
  const [key, ...rest] = value.trim().split("=");
  return [key, decodeURIComponent(rest.join("="))];
}));
const json = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};
async function requireAdmin(req: IncomingMessage) {
  const token = cookies(req).fl_admin;
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  return !error && data.user?.app_metadata?.role === "admin" ? data.user : null;
}

async function dashboard() {
  const [profiles, matches, reports, versions, imports, contracts, settings, clubs, events, leagues] = await Promise.all([
    adminDb.from("profiles").select("id", { count: "exact", head: true }),
    adminDb.from("matches").select("id", { count: "exact", head: true }),
    adminDb.from("result_reports").select("id,match_id,round_id,reporter_id,reason_code,detail,status,created_at").order("created_at", { ascending: false }).limit(50),
    adminDb.from("football_data_versions").select("id,version_number,status,schema_version,source_export_hash,published_at,created_at").order("created_at", { ascending: false }).limit(12),
    adminDb.from("football_data_import_runs").select("id,source,status,started_at,finished_at,clubs_inserted,players_inserted,memberships_inserted,aliases_inserted,pairs_generated,errors,export_hash").order("started_at", { ascending: false }).limit(12),
    adminDb.from("player_club_contracts").select("id", { count: "exact", head: true }),
    adminDb.from("game_settings").select("key,value,minimum,maximum,description,updated_at").order("key"),
    adminDb.from("clubs").select("id,external_id,name,active,league").order("name").limit(200),
    adminDb.rpc("admin_event_list"),
    adminDb.rpc("event_leagues"),
  ]);
  const error = [profiles, matches, reports, versions, imports, contracts, settings, clubs, events, leagues].find(result => result.error)?.error;
  if (error) throw error;
  return {
    metrics: {
      players: profiles.count ?? 0,
      matches: matches.count ?? 0,
      openReports: (reports.data ?? []).filter(item => item.status === "OPEN").length,
      memberships: contracts.count ?? 0,
    },
    reports: reports.data ?? [],
    versions: versions.data ?? [],
    imports: imports.data ?? [],
    settings: settings.data ?? [],
    clubs: clubs.data ?? [],
    events: events.data ?? [],
    leagues: leagues.data ?? [],
  };
}

createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(page);
      return;
    }
    if (req.method === "POST" && path === "/api/login") {
      const body = await json(req);
      const email = String(body.email ?? "").trim();
      const password = String(body.password ?? "");
      if (!email || !password) {
        send(res, 400, { error: "E-posta ve şifre gerekli." });
        return;
      }
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) {
        console.error("admin login auth failed", error?.message ?? "no session");
        send(res, 401, { error: "E-posta veya şifre hatalı." });
        return;
      }
      if (data.user.app_metadata?.role !== "admin") {
        console.error("admin login role missing", email, data.user.app_metadata);
        send(res, 403, { error: "Bu hesap admin değil. app_metadata.role=admin olmalı." });
        return;
      }
      res.setHeader(
        "Set-Cookie",
        `fl_admin=${encodeURIComponent(data.session.access_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && path === "/api/logout") {
      res.setHeader("Set-Cookie", "fl_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      send(res, 200, { ok: true });
      return;
    }
    if (!await requireAdmin(req)) {
      send(res, 401, { error: "AUTH_REQUIRED" });
      return;
    }
    if (req.method === "GET" && path === "/api/dashboard") {
      send(res, 200, await dashboard());
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/reports/")) {
      const id = path.split("/").at(-1);
      const body = await json(req);
      const status = String(body.status ?? "");
      if (!id || !["OPEN", "REVIEWING", "RESOLVED", "REJECTED"].includes(status)) {
        send(res, 400, { error: "Geçersiz bildirim durumu." });
        return;
      }
      const { error } = await adminDb.from("result_reports").update({ status }).eq("id", id);
      if (error) throw error;
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/settings/")) {
      const key = decodeURIComponent(path.split("/").at(-1) ?? "");
      const body = await json(req);
      const value = Number(body.value);
      const { data: setting, error: readError } = await adminDb.from("game_settings").select("minimum,maximum").eq("key", key).maybeSingle();
      if (readError) throw readError;
      if (!setting || !Number.isInteger(value) || value < setting.minimum || value > setting.maximum) {
        send(res, 400, { error: "Ayar izin verilen aralığın dışında." });
        return;
      }
      const { error } = await adminDb.from("game_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) throw error;
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/clubs/")) {
      const id = decodeURIComponent(path.split("/").at(-1) ?? "");
      const body = await json(req);
      if (typeof body.active !== "boolean") {
        send(res, 400, { error: "Geçersiz kulüp durumu." });
        return;
      }
      const { error } = await adminDb.from("clubs").update({ active: body.active }).eq("id", id);
      if (error) throw error;
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/versions/") && path.endsWith("/activate")) {
      const id = path.split("/")[3];
      if (!id) {
        send(res, 400, { error: "Sürüm bulunamadı." });
        return;
      }
      const { error } = await adminDb.rpc("admin_activate_football_version", { p_version_id: id });
      if (error) throw error;
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && path === "/api/events") {
      const body = await json(req);
      const { data, error } = await adminDb.rpc("admin_event_upsert", {
        p_id: body.id ?? null,
        p_title_tr: body.title_tr ?? null,
        p_title_en: body.title_en ?? null,
        p_league: body.league ?? null,
        p_accent: body.accent ?? "#F4C95D",
      });
      if (error) throw error;
      send(res, 200, { ok: true, id: data });
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/events/") && path.endsWith("/live")) {
      const id = path.split("/")[3];
      if (!id) {
        send(res, 400, { error: "Event bulunamadı." });
        return;
      }
      const { error } = await adminDb.rpc("admin_event_go_live", { p_id: id });
      if (error) throw error;
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/events/") && path.endsWith("/end")) {
      const id = path.split("/")[3];
      if (!id) {
        send(res, 400, { error: "Event bulunamadı." });
        return;
      }
      const { error } = await adminDb.rpc("admin_event_end", { p_id: id });
      if (error) throw error;
      send(res, 200, { ok: true });
      return;
    }
    send(res, 404, { error: "NOT_FOUND" });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "İşlem tamamlanamadı." });
  }
}).listen(port, "127.0.0.1", () => console.log(`Football Link Control Room: http://127.0.0.1:${port}`));

const page = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Football Link · Control Room</title>
<style>
:root{color-scheme:dark;--ink:#07121c;--panel:#10222e;--line:#284452;--text:#f6f1e7;--muted:#9bb0b9;--turf:#59d5a6;--signal:#ff6b3d;--light:#fff3cf}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
button,input,select{font:inherit}
.shell{max-width:1440px;margin:auto;padding:28px}
.mast{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:18px}
.brand{font-weight:900;letter-spacing:-.04em;font-size:25px}
.brand i{color:var(--signal);font-style:normal}
.live{font:800 10px ui-monospace,monospace;color:var(--turf);letter-spacing:.15em}
.hero{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin:24px 0}
.headline{background:var(--light);color:var(--ink);padding:26px;border-radius:18px}
.headline small{color:var(--signal);font-weight:900;letter-spacing:.15em}
.headline h1{font-size:42px;line-height:.95;margin:44px 0 0;letter-spacing:-.055em}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:18px}
.metric b{display:block;font:900 30px ui-monospace,monospace}
.metric span,.muted{color:var(--muted);font-size:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.panel h2{font-size:14px;letter-spacing:.05em;margin:0;padding:18px;border-bottom:1px solid var(--line)}
.row{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:14px;align-items:center}
.row:last-child{border:0}
.tag{border:1px solid var(--line);border-radius:99px;padding:5px 8px;font:800 9px ui-monospace,monospace}
.ACTIVE,.SUCCEEDED,.RESOLVED,.LIVE{color:var(--turf)}
.OPEN,.FAILED,.ENDED{color:var(--signal)}
.DRAFT{color:var(--muted)}
select{background:var(--ink);color:var(--text);border:1px solid var(--line);padding:7px;border-radius:8px}
#loginPanel{max-width:420px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px}
input{width:100%;background:var(--ink);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:13px;margin:6px 0}
button{border:0;border-radius:10px;padding:12px 16px;background:var(--turf);color:var(--ink);font-weight:900;cursor:pointer}
.btn-dim{background:var(--line);color:var(--text)}
.error{color:#ff716c;font-size:12px}
.form-row{display:grid;grid-template-columns:1.2fr 1.2fr 1fr auto;gap:8px;padding:14px 18px;border-bottom:1px solid var(--line);align-items:center}
@media(max-width:800px){.hero,.grid,.form-row{grid-template-columns:1fr}.headline h1{font-size:34px}.shell{padding:16px}}
</style>
</head>
<body>
<div id="loginPanel">
  <div class="brand">FL<i>/</i>CONTROL</div>
  <p class="muted">Yetkili operasyon hesabınla giriş yap.</p>
  <input id="emailField" type="email" placeholder="E-posta" autocomplete="username">
  <input id="passwordField" type="password" placeholder="Parola" autocomplete="current-password">
  <button type="button" id="loginBtn">Kontrol odasını aç</button>
  <p id="loginError" class="error"></p>
</div>
<main id="appShell" class="shell" hidden></main>
<script>
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const loginPanel = document.getElementById("loginPanel");
const appShell = document.getElementById("appShell");
const loginError = document.getElementById("loginError");
const emailField = document.getElementById("emailField");
const passwordField = document.getElementById("passwordField");

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error(body.error || "AUTH");
  if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
  return body;
}

async function submitLogin() {
  loginError.textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: emailField.value.trim(), password: passwordField.value }),
    });
    await loadDashboard();
  } catch (error) {
    loginError.textContent = String(error.message || error);
  }
}

document.getElementById("loginBtn").addEventListener("click", () => { void submitLogin(); });
passwordField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void submitLogin();
});

async function mutate(path, body) {
  await api(path, { method: "POST", body: JSON.stringify(body || {}) });
  await loadDashboard();
}

window.setReport = (id, status) => { void mutate("/api/reports/" + encodeURIComponent(id), { status }); };
window.saveSetting = (key, input) => { void mutate("/api/settings/" + encodeURIComponent(key), { value: Number(input.value) }); };
window.toggleClub = (id, active) => { void mutate("/api/clubs/" + encodeURIComponent(id), { active }); };
window.activateVersion = (id) => {
  if (confirm("Bu veri sürümü canlı maçlar için aktif edilsin mi?")) void mutate("/api/versions/" + encodeURIComponent(id) + "/activate", {});
};
window.createLeagueEvent = () => {
  const league = document.getElementById("evLeague").value;
  const title_tr = document.getElementById("evTitleTr").value;
  const title_en = document.getElementById("evTitleEn").value;
  if (!league) return alert("Lig seç");
  void mutate("/api/events", { league, title_tr, title_en });
};
window.goLiveEvent = (id) => {
  if (confirm("Bu event canlıya alınsın mı? Diğer canlı event biter.")) void mutate("/api/events/" + encodeURIComponent(id) + "/live", {});
};
window.endEvent = (id) => {
  if (confirm("Canlı event bitsin mi?")) void mutate("/api/events/" + encodeURIComponent(id) + "/end", {});
};

async function loadDashboard() {
  try {
    const d = await api("/api/dashboard");
    loginPanel.hidden = true;
    appShell.hidden = false;
    const versions = d.versions.map((v) =>
      '<div class="row"><div><b>' + esc(v.version_number) + '</b><div class="muted">schema v' + esc(v.schema_version) + " · " + esc((v.source_export_hash || "").slice(0, 10)) + "</div></div>" +
      (v.status === "ACTIVE" ? '<span class="tag ACTIVE">ACTIVE</span>' : '<button onclick="activateVersion(\\'' + esc(v.id) + '\\')">Aktif et</button>') + "</div>"
    ).join("");
    const settings = d.settings.map((v) =>
      '<div class="row"><div><b>' + esc(v.description) + '</b><div class="muted">' + esc(v.key) + " · " + v.minimum + "–" + v.maximum + '</div></div><input style="width:90px" type="number" min="' + v.minimum + '" max="' + v.maximum + '" value="' + v.value + '" onchange="saveSetting(\\'' + esc(v.key) + '\\',this)"></div>'
    ).join("");
    const clubs = d.clubs.map((v) =>
      '<div class="row"><div><b>' + esc(v.name) + '</b><div class="muted">' + esc(v.external_id) + (v.league ? " · " + esc(v.league) : "") + '</div></div><button style="background:' + (v.active ? "var(--turf)" : "var(--line)") + '" onclick="toggleClub(\\'' + esc(v.id) + "\\'," + (!v.active) + ')">' + (v.active ? "Aktif" : "Kapalı") + "</button></div>"
    ).join("");
    const leagueOpts = (d.leagues || []).map((l) =>
      '<option value="' + esc(l.league) + '">' + esc(l.league) + " (" + esc(l.active_club_count) + ")</option>"
    ).join("");
    const events = (d.events || []).map((e) =>
      '<div class="row"><div><b>' + esc(e.title_tr) + '</b><div class="muted">' + esc(e.league) + " · " + esc(e.club_count) + " kulüp · " + esc(e.title_en) + '</div></div><div style="display:flex;gap:8px;align-items:center"><span class="tag ' + esc(e.status) + '">' + esc(e.status) + "</span>" +
      (e.status === "LIVE"
        ? '<button class="btn-dim" onclick="endEvent(\\'' + esc(e.id) + '\\')">Bitir</button>'
        : (e.status !== "ENDED" ? '<button onclick="goLiveEvent(\\'' + esc(e.id) + '\\')">Canlıya al</button>' : "")) +
      "</div></div>"
    ).join("") || '<div class="row muted">Henüz event yok.</div>';
    const metrics = Object.entries({
      Oyuncu: d.metrics.players,
      Maç: d.metrics.matches,
      "Açık bildirim": d.metrics.openReports,
      Üyelik: d.metrics.memberships,
    }).map(([k, v]) => '<div class="metric"><b>' + v + "</b><span>" + k + "</span></div>").join("");
    const reports = d.reports.length
      ? d.reports.map((v) =>
          '<div class="row"><div><b>' + esc(v.reason_code) + '</b><div class="muted">' + esc(v.detail || "Detay yok") + " · " + esc(new Date(v.created_at).toLocaleString("tr-TR")) + '</div></div><select onchange="setReport(\\'' + esc(v.id) + '\\',this.value)">' +
          ["OPEN", "REVIEWING", "RESOLVED", "REJECTED"].map((s) => '<option ' + (s === v.status ? "selected" : "") + ">" + s + "</option>").join("") +
          "</select></div>"
        ).join("")
      : '<div class="row muted">Bildirim bulunmuyor.</div>';
    appShell.innerHTML =
      '<header class="mast"><div class="brand">FL<i>/</i>CONTROL ROOM</div><div class="live">● PRODUCTION LIVE</div></header>' +
      '<section class="hero"><div class="headline"><small>OPERASYON ÖZETİ</small><h1>Oyunun nabzı,<br>tek sahada.</h1></div><div class="metrics">' + metrics + "</div></section>" +
      '<section class="grid">' +
      '<div class="panel" style="grid-column:1/-1"><h2>EVENT WEEK · LİG HAFTASI</h2><div class="form-row"><input id="evTitleTr" placeholder="Başlık TR (opsiyonel)"><input id="evTitleEn" placeholder="Title EN (optional)"><select id="evLeague"><option value="">Lig seç…</option>' + leagueOpts + '</select><button onclick="createLeagueEvent()">Draft oluştur</button></div>' + events + "</div>" +
      '<div class="panel"><h2>FUTBOL VERİ SÜRÜMLERİ</h2>' + versions + "</div>" +
      '<div class="panel"><h2>SON IMPORTLAR</h2>' + d.imports.map((v) => '<div class="row"><div><b>' + esc(v.source) + '</b><div class="muted">' + esc(v.players_inserted) + " oyuncu · " + esc(v.pairs_generated) + ' pair</div></div><span class="tag ' + esc(v.status) + '">' + esc(v.status) + "</span></div>").join("") + "</div>" +
      '<div class="panel"><h2>OYUN AYARLARI</h2>' + settings + "</div>" +
      '<div class="panel"><h2>AKTİF KULÜPLER</h2><div style="max-height:560px;overflow:auto">' + clubs + "</div></div>" +
      '<div class="panel" style="grid-column:1/-1"><h2>SONUÇ BİLDİRİMLERİ</h2>' + reports + "</div>" +
      "</section>";
  } catch (error) {
    const message = String(error.message || error);
    if (message === "AUTH" || message.includes("AUTH")) {
      loginPanel.hidden = false;
      appShell.hidden = true;
    } else {
      appShell.hidden = false;
      appShell.innerHTML = '<p class="error">' + esc(message) + "</p>";
    }
  }
}

void loadDashboard();
</script>
</body>
</html>`;
