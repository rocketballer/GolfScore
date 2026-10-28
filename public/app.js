import { teamRound, leaderboard, fmtToPar, recap, gameStandings } from './scoring.js';

// ---------- small helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('fi:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fi:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const session = {
  get(k) { try { return sessionStorage.getItem('fi:' + k); } catch { return null; } },
  set(k, v) { try { v === null ? sessionStorage.removeItem('fi:' + k) : sessionStorage.setItem('fi:' + k, v); } catch { /* ignore */ } },
};
const COLORS = ['#e0457b', '#1e9e5a', '#e8590c', '#7048e8', '#1c7ed6', '#0c8599', '#d6336c', '#f08c00', '#5f3dc4', '#c92a2a', '#2b8a3e', '#364fc7', '#212529', '#a61e4d', '#087f5b', '#9c36b5'];
const TEAM_COLORS = ['#1c64d6', '#e8590c', '#2b9348', '#15aabf', '#be4bdb', '#74b816', '#1d3fa8', '#e03131', '#5c3d2e', '#f59f00', '#495057', '#0b7285'];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 1)).toUpperCase();
}
function avatar(name, cls = '') {
  return `<span class="avatar ${cls}" style="background:${COLORS[hash(name) % COLORS.length]}" aria-hidden="true">${esc(initials(name))}</span>`;
}
const chevron = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/></svg>';
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- app state ----------
let data = null;
let online = true;
const ui = {
  homeTab: 'about',
  lbSection: 'scramble',
  lbMode: store.get('lbMode', 'overall'),
  net: store.get('net', false),
  open: new Set(store.get('open', [])),
  pSort: 'name', pDir: 1, pQuery: '',
  recapSel: {},
  recapMore: {},
};
let me = store.get('me', null); // {role:'player'|'spectator', playerId?}
let adminPin = session.get('pin');

const T = () => data.tournament;
const holes = () => data.tournament.course.holes;
const allPlayers = () => data.teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t })));
const findPlayer = (id) => allPlayers().find((p) => p.id === id) || null;
const myPlayer = () => (me?.playerId ? findPlayer(me.playerId) : null);
const myTeam = () => myPlayer()?.team || null;
const isAdmin = () => !!adminPin;
const canScore = (teamId) => isAdmin() || myTeam()?.id === teamId;

// ---------- network ----------
async function api(path, body) {
  const headers = { 'content-type': 'application/json' };
  if (adminPin) headers['x-admin-pin'] = adminPin;
  const res = await fetch('/api/' + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers, body: JSON.stringify(body) });
  let out = {};
  try { out = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(out.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return out;
}

let lastSig = '';
async function refresh() {
  try {
    const next = await api('state');
    online = true;
    document.body.classList.remove('offline');
    const sig = JSON.stringify([next.teams, next.teeTimes, next.settings, next.scores, next.games, next.chat]);
    const first = !data;
    data = next;
    if (first || sig !== lastSig) { lastSig = sig; render(); }
  } catch (e) {
    online = false;
    document.body.classList.add('offline');
    if (!data) $('#view').innerHTML = `<p class="empty">Can't reach the scoring server. Check your connection and pull to refresh.</p>`;
  }
}
function startPolling() {
  refresh();
  setInterval(() => { if (!document.hidden && !sheetOpen()) refresh(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

// ---------- routing ----------
const ROUTES = ['home', 'players', 'leaderboard', 'schedule', 'activity', 'admin'];
function route() {
  const h = location.hash.slice(1) || 'home';
  if (h.startsWith('team-')) return { name: 'team', id: h.slice(5) };
  return { name: ROUTES.includes(h) ? h : 'home' };
}
function tabFor(r) { return r.name === 'players' ? 'home' : r.name === 'team' ? 'leaderboard' : r.name; }

function render() {
  if (!data) return;
  const r = route();
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tabFor(r)));
  const compact = r.name !== 'home' && r.name !== 'players';
  document.body.classList.toggle('compact', compact);
  $('#topbar').classList.toggle('solid', compact);
  $('#btn-back').hidden = r.name !== 'team' && r.name !== 'admin';
  $('#btn-me').textContent = myPlayer() ? myPlayer().name : me?.role === 'spectator' ? 'Spectating' : 'Who are you?';
  $('#bottom-bar').hidden = r.name === 'activity' || r.name === 'admin';
  document.body.classList.toggle('no-bar', $('#bottom-bar').hidden);
  const enter = $('#btn-enter');
  if (data.settings.locked && !isAdmin()) { enter.textContent = 'Scoring closed'; enter.disabled = true; }
  else { enter.textContent = myTeam() ? `Enter scores · ${myTeam().name}` : 'Enter scores'; enter.disabled = false; }

  const v = $('#view');
  const keepScroll = v.dataset.route === location.hash;
  const y = window.scrollY;
  if (r.name === 'admin' && draft && v.dataset.route === location.hash) syncDraftFromInputs();
  const html = { home: viewHome, players: viewHome, leaderboard: viewLeaderboard, team: viewTeam, schedule: viewSchedule, activity: viewActivity, admin: viewAdmin }[r.name](r);
  // Don't wipe a half-typed chat message or admin form on a background refresh.
  const active = document.activeElement;
  const typing = keepScroll && active && v.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName);
  if (typing && (r.name === 'activity' || r.name === 'admin' || r.name === 'players')) { afterRender[r.name]?.(true); return; }
  v.innerHTML = html;
  v.dataset.route = location.hash;
  if (keepScroll) window.scrollTo(0, y);
  afterRender[r.name]?.(false);
}
const afterRender = {};

// ---------- Home ----------
let weather = store.get('weather', null);
async function loadWeather() {
  if (weather && Date.now() - weather.at < 3 * 3600e3) return;
  try {
    const { lat, lng } = T().course;
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&start_date=${T().date}&end_date=${T().date}`;
    const res = await fetch(u);
    if (!res.ok) return;
    const d = (await res.json()).daily;
    weather = { at: Date.now(), hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), code: d.weather_code[0], rain: d.precipitation_probability_max?.[0], wind: Math.round(d.wind_speed_10m_max?.[0] ?? 0) };
    store.set('weather', weather);
    if (route().name === 'home') render();
  } catch { /* forecast is optional */ }
}
function wIcon(code) {
  if (code === 0) return '☀️'; if (code <= 2) return '🌤️'; if (code === 3) return '☁️';
  if (code <= 48) return '🌫️'; if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️'; return '⛈️';
}

function viewHome(r) {
  const tab = r.name === 'players' ? 'players' : 'about';
  const chips = `<div class="chips"><a class="chip ${tab === 'about' ? 'on' : ''}" href="#home">About</a><a class="chip ${tab === 'players' ? 'on' : ''}" href="#players">Players</a></div>`;
  if (tab === 'players') return chips + viewPlayers();
  const t = T(), c = t.course;
  const tee = data.settings.tee;
  const teeInfo = c.tees.find((x) => x.id === tee);
  const yards = c.holes.reduce((s, h) => s + h.yards[tee], 0);
  const par = c.holes.reduce((s, h) => s + h.par, 0);
  const w = weather ? `<div class="weather" title="Forecast for Oct 31"><span class="w-icon">${wIcon(weather.code)}</span>${weather.hi}°/${weather.lo}°${weather.rain != null ? `<br>${weather.rain}% rain` : ''}</div>` : '';
  const lb = leaderboard(data, false).filter((x) => x.thru);
  const leaders = lb.length ? `
    <div class="card"><div class="card-head"><span><span class="live-dot"></span>Live leaders</span><a class="link-btn" style="color:#fff" href="#leaderboard">Full board</a></div>
    <div class="card-body">${lb.slice(0, 3).map((x) => `<div class="standing"><span class="rank r${x.posNum}">${esc(x.pos)}</span><span class="grow"><b>${esc(x.team.name)}</b> <span class="muted small">thru ${x.complete ? 'F' : x.thru}</span></span><span class="val num ${x.toPar < 0 ? 'under' : ''}">${fmtToPar(x.toPar)}</span></div>`).join('')}</div></div>` : '';
  const mapsQ = encodeURIComponent('Victoria Park East Golf Club, Puslinch, ON');
  const d = 0.008;
  return `${chips}
    ${data.settings.announcement ? `<div class="banner">${esc(data.settings.announcement)}</div>` : ''}
    ${leaders}
    <div class="card"><div class="card-head">Schedule</div><div class="card-body">
      <div class="round-row"><span class="round-badge">R1</span><div class="grow">
        <div class="title">Sat, Oct 31, 2026 · ${timeLabel(t.startTime)}</div>
        <div class="small">${esc(c.name)}</div>
        <div class="small muted">18 holes · Scramble · ${esc(tee)} tees</div>
      </div>${w}</div>
    </div></div>
    <div class="card"><div class="card-head">Format</div><div class="card-body stack small">
      <div><b>4-person scramble.</b> Everyone hits, the team picks the best shot, and everyone plays from there. One team score per hole.</div>
      <div><b>Hole competitions:</b> closest to the pin on hole 6 (par 3) and longest drive on hole 10 (par 5).</div>
      <div class="muted">Par ${par} · ${yards.toLocaleString()} yards from the ${esc(tee)} tees${teeInfo ? ` · Rating ${teeInfo.rating} / Slope ${teeInfo.slope}` : ''}</div>
    </div></div>
    <div class="card"><div class="card-head">Location</div>
      <iframe class="map" title="Map of Victoria Park East Golf Club" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${c.lng - d},${c.lat - d * 0.6},${c.lng + d},${c.lat + d * 0.6}&layer=mapnik&marker=${c.lat},${c.lng}"></iframe>
      <div class="addr"><div><b>${esc(c.name)}</b><div class="small muted">${esc(c.address)}</div></div>
      <a class="btn-outline btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${mapsQ}">Directions</a></div>
    </div>
    <div class="card"><div class="card-head">Contact</div><div class="card-body">
      <div class="contact">${avatar(t.owner, 'lg')}<div class="grow"><div>${esc(t.owner)}</div><div class="small muted">Owner</div></div>
      <a class="btn btn-outline" href="#activity">Message</a></div>
    </div></div>
    <div class="footer-links"><a class="link-btn" href="#admin">Organizer tools</a></div>`;
}
afterRender.home = () => loadWeather();

function viewPlayers() {
  const q = ui.pQuery.toLowerCase();
  let list = allPlayers().filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.name.toLowerCase().includes(q));
  const k = ui.pSort, dir = ui.pDir;
  list.sort((a, b) => {
    if (k === 'hcp') return ((a.hcp ?? 999) - (b.hcp ?? 999)) * dir || a.name.localeCompare(b.name);
    if (k === 'team') return a.team.name.localeCompare(b.team.name, undefined, { numeric: true }) * dir || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) * dir;
  });
  const arrow = (key) => (ui.pSort === key ? (ui.pDir > 0 ? ' ▾' : ' ▴') : '');
  return `
    <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 9.5 16a6.5 6.5 0 0 0 4.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
      <input id="p-search" type="search" placeholder="Search players" value="${esc(ui.pQuery)}" autocomplete="off"></label>
    <div><b>Total players: ${allPlayers().length}</b></div>
    <div class="plist">
      <div class="plist-head"><button class="sort-btn" data-sort="name">Name${arrow('name')}</button><button class="sort-btn" data-sort="team">Team${arrow('team')}</button><button class="sort-btn" data-sort="hcp">Handicap${arrow('hcp')}</button></div>
      ${list.map((p) => `<div class="prow"><span class="who">${avatar(p.name)}<span>${esc(p.name)}</span></span><span class="small">${esc(p.team.name)}</span><span class="small ${p.hcp == null ? 'muted' : ''}">${p.hcp == null ? 'Not set' : p.hcp}</span></div>`).join('') || '<p class="empty">No players match that search.</p>'}
    </div>`;
}
afterRender.players = (typing) => { if (typing) { /* list redraw happens on input */ } };

// ---------- Leaderboard ----------
function anyHcp() { return data.teams.some((t) => teamRound(t, null, holes(), data.settings).hcp !== null); }

function viewLeaderboard() {
  const s = ui.lbSection;
  const sections = `<div class="chips">${[['scramble', 'Scramble'], ['games', 'Games'], ['recap', 'Recap']].map(([k, l]) => `<button class="chip ${s === k ? 'on' : ''}" data-section="${k}">${l}</button>`).join('')}</div>`;
  if (s === 'games') return sections + viewGames();
  if (s === 'recap') return sections + viewRecap();
  const net = ui.net && anyHcp();
  const modes = `<div class="row" style="justify-content:space-between"><div class="chips">
      <button class="chip ${ui.lbMode === 'overall' ? 'on' : ''}" data-mode="overall">Overall</button>
      <button class="chip ${ui.lbMode === 'round' ? 'on' : ''}" data-mode="round">Round 1</button></div>
      ${anyHcp() ? `<div class="chips"><button class="chip ${!net ? 'on' : ''}" data-net="0">Gross</button><button class="chip ${net ? 'on' : ''}" data-net="1">Net</button></div>` : ''}
    </div>`;
  const rows = leaderboard(data, net);
  const status = `<div class="small muted"><span class="live-dot"></span>${online ? 'Live · updates every few seconds' : 'Offline · showing last scores'}${data.settings.locked ? ' · Scoring closed' : ''}</div>`;
  return sections + modes + status + (ui.lbMode === 'round' ? roundGrid(rows, net) : overall(rows, net));
}

function scoreCls(rel) { return rel <= -2 ? 'eagle' : rel === -1 ? 'birdie' : rel === 1 ? 'bogey' : rel >= 2 ? 'double' : ''; }

function overall(rows, net) {
  const leaderPos = rows[0]?.posNum;
  return `<div class="lb-head"><span>Po</span><span>Teams</span><span>R1</span><span>Tot</span></div>
  <div class="stack" style="gap:10px">${rows.map((r) => {
    const open = ui.open.has(r.team.id);
    const tp = net ? r.netToPar : r.toPar;
    const thru = !r.thru ? '' : r.complete ? 'F' : `thru ${r.thru}`;
    return `<div class="lb-team ${open ? 'open' : ''} ${r.posNum === leaderPos && r.thru ? 'leader' : ''}">
      <button class="lb-row" data-toggle="${r.team.id}" aria-expanded="${open}">
        <span class="pos num">${esc(r.pos)}</span>
        <span class="name"><span>${esc(r.team.name)}</span>${chevron}${thru ? `<span class="sub">${thru}</span>` : ''}</span>
        <span class="num">${r.thru ? (net ? r.net : r.gross) : '-'}</span>
        <span class="score num ${tp < 0 && r.thru ? 'under' : ''}">${r.thru ? fmtToPar(tp) : '-'}</span>
      </button>
      ${open ? `<div class="lb-players">${r.team.players.map((p) => `<div class="lb-player">${avatar(p.name)}<span>${esc(p.name)}${p.hcp != null ? ` <span class="muted small">(${p.hcp})</span>` : ''}</span></div>`).join('')}</div>
      <div class="lb-actions"><a class="btn btn-outline" href="#team-${r.team.id}">Scorecard</a>${r.hcp !== null ? `<span class="small muted" style="align-self:center">Team handicap ${r.hcp}</span>` : ''}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function roundGrid(rows, net) {
  const hs = holes();
  const head = `<tr><th class="sticky">Po · Teams</th><th>Tot</th>${hs.map((h) => `<th>${h.n}</th>`).join('')}</tr>
    <tr class="par"><th class="sticky muted">Par</th><th class="muted">${hs.reduce((s, h) => s + h.par, 0)}</th>${hs.map((h) => `<th class="muted">${h.par}</th>`).join('')}</tr>`;
  const body = rows.map((r) => {
    const tp = net ? r.netToPar : r.toPar;
    return `<tr><td class="sticky"><a href="#team-${r.team.id}" style="color:inherit;text-decoration:none"><span class="muted small">${esc(r.pos)}</span> <b>${esc(r.team.name)}</b></a></td>
      <td class="tot ${tp < 0 && r.thru ? 'under' : ''}">${r.thru ? fmtToPar(tp) : '-'}</td>
      ${r.rows.map((x) => {
        const can = canScore(r.team.id) && !(data.settings.locked && !isAdmin());
        const inner = x.gross === null ? (can ? '<span class="plus">+</span>' : '<span class="muted">·</span>') : `<span class="mark ${scoreCls(x.gross - x.par)}">${x.gross}</span>`;
        return `<td><button class="cell" data-score="${r.team.id}:${x.n}" aria-label="${esc(r.team.name)} hole ${x.n}${x.gross === null ? ', no score' : `, ${x.gross}`}">${inner}</button></td>`;
      }).join('')}</tr>`;
  }).join('');
  return `<div class="grid-wrap"><table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="small muted">Tap a <span style="color:var(--green)">+</span> on your team's row to enter a score. Swipe sideways for the back nine.</p>`;
}

// ---------- Team scorecard ----------
function viewTeam(r) {
  const team = data.teams.find((t) => t.id === r.id);
  if (!team) return '<p class="empty">That team no longer exists. <a href="#leaderboard">Back to the leaderboard</a></p>';
  const tr = teamRound(team, data.scores[team.id], holes(), data.settings);
  const lb = leaderboard(data, ui.net && anyHcp());
  const pos = lb.find((x) => x.team.id === team.id)?.pos || '-';
  const tee = data.settings.tee;
  const can = canScore(team.id) && !(data.settings.locked && !isAdmin());
  const half = (from, to, label) => {
    const hs = tr.rows.slice(from, to);
    const sum = (f) => hs.reduce((s, x) => s + (f(x) ?? 0), 0);
    const playedAll = hs.every((x) => x.gross !== null);
    const meta = holes().slice(from, to);
    return `<div class="sc-table"><table>
      <tr class="hole"><th>Hole</th>${hs.map((x) => `<th>${x.n}</th>`).join('')}<th>${label}</th></tr>
      <tr><td>Yds</td>${meta.map((h) => `<td>${h.yards[tee]}</td>`).join('')}<td class="out">${meta.reduce((s, h) => s + h.yards[tee], 0)}</td></tr>
      <tr><td>Hcp</td>${hs.map((x) => `<td>${x.si}</td>`).join('')}<td class="out"></td></tr>
      <tr><td>Par</td>${hs.map((x) => `<td>${x.par}</td>`).join('')}<td class="out">${sum((x) => x.par)}</td></tr>
      <tr class="scores"><td>Score</td>${hs.map((x) => `<td><button class="cell" style="margin:auto" data-score="${team.id}:${x.n}" ${can || x.gross !== null ? '' : 'disabled'}>${x.gross === null ? (can ? '<span class="plus">+</span>' : '') : `<span class="mark ${scoreCls(x.gross - x.par)}">${x.gross}</span>`}</button></td>`).join('')}<td class="out">${hs.some((x) => x.gross !== null) ? sum((x) => x.gross) : ''}${!playedAll && hs.some((x) => x.gross !== null) ? '*' : ''}</td></tr>
      ${tr.hcp !== null ? `<tr><td>Net</td>${hs.map((x) => `<td>${x.net ?? ''}</td>`).join('')}<td class="out">${hs.some((x) => x.net !== null) ? sum((x) => x.net) : ''}</td></tr>` : ''}
      ${hs.some((x) => x.putts !== null) ? `<tr><td>Putts</td>${hs.map((x) => `<td>${x.putts ?? ''}</td>`).join('')}<td class="out">${sum((x) => x.putts)}</td></tr>` : ''}
    </table></div>`;
  };
  return `
    <div class="card card-plain stack">
      <div class="row" style="justify-content:space-between"><div><div class="eyebrow">Round 1 · ${esc(tee)} tees</div><div style="font-size:22px;font-weight:700">${esc(team.name)}</div></div>
      ${can ? `<button class="btn btn-primary" data-enter="${team.id}">${tr.thru ? 'Continue scoring' : 'Start scoring'}</button>` : ''}</div>
      <div class="sc-summary">
        <div><div class="v num">${esc(pos)}</div><div class="k">Pos</div></div>
        <div><div class="v num ${tr.toPar < 0 && tr.thru ? 'under' : ''}">${tr.thru ? fmtToPar(tr.toPar) : '-'}</div><div class="k">To par</div></div>
        <div><div class="v num">${tr.thru ? tr.gross : '-'}</div><div class="k">Gross</div></div>
        <div><div class="v num">${tr.complete ? 'F' : tr.thru}</div><div class="k">Thru</div></div>
      </div>
      <div class="row small muted">${team.players.map((p) => `<span class="row" style="gap:6px">${avatar(p.name)}<i>${esc(p.name)}</i></span>`).join('')}</div>
      ${tr.hcp !== null ? `<div class="small muted">Team handicap ${tr.hcp} · Net ${tr.thru ? fmtToPar(tr.netToPar) : '-'}</div>` : ''}
      ${tr.lastUpdate ? `<div class="small muted">Last update ${ago(tr.lastUpdate)}${data.scores[team.id]?.updatedBy ? ` by ${esc(data.scores[team.id].updatedBy)}` : ''}</div>` : ''}
    </div>
    <div class="card">${half(0, 9, 'Out')}</div>
    <div class="card">${half(9, 18, 'In')}</div>
    ${tr.complete ? `<div class="card card-plain row" style="justify-content:space-between"><b>Total</b><span class="num"><b>${tr.gross}</b> (${fmtToPar(tr.toPar)})${tr.putts !== null ? ` · ${tr.putts} putts` : ''}</span></div>` : ''}
    ${!can && !isAdmin() ? `<p class="small muted center-head">Only ${esc(team.name)} players and the organizer can enter scores for this team. <button class="link-btn" data-action="who">Change who you are</button></p>` : ''}`;
}

// ---------- Games ----------
function viewGames() {
  const unit = (g) => (g.type === 'ctp' ? 'ft' : 'yds');
  const fmt = (g, v) => (g.type === 'ctp' ? `${Math.floor(v / 12)}' ${Math.round(v % 12)}"` : `${v} yds`);
  const mine = myPlayer();
  return `<div class="chips"><span class="chip on">Hole competitions</span></div>` + T().games.map((g) => {
    const list = gameStandings(g, data.games[g.id]);
    const h = holes()[g.hole - 1];
    const myEntry = mine && (data.games[g.id] || []).find((e) => e.playerId === mine.id);
    return `<div class="card card-plain stack">
      <div style="font-size:19px;font-weight:600;text-align:center">${esc(g.label)}</div>
      <div class="small muted" style="text-align:center">Par ${h.par} · ${h.yards[data.settings.tee]} yds · ${g.type === 'ctp' ? 'Shortest distance from the pin wins (must be on the green)' : 'Longest drive in the fairway wins'}</div>
      ${list.length ? `<div>${list.map((e, i) => { const p = findPlayer(e.playerId); return `<div class="standing"><span class="rank r${i + 1}">${i + 1}</span>${avatar(p?.name || '?')}<span class="grow"><i>${esc(p?.name || 'Removed player')}</i> <span class="small muted">${esc(p?.team.name || '')}</span></span><span class="val num">${fmt(g, e.value)}</span>${isAdmin() ? `<button class="x-btn" title="Remove" data-game-del="${g.id}:${e.playerId}">×</button>` : ''}</div>`; }).join('')}</div>`
        : '<p class="stat-empty">Results will be displayed when users enter their distances</p>'}
      ${mine || isAdmin() ? `<form class="game-entry" data-game="${g.id}">
        ${isAdmin() ? `<select class="input" name="player" id="g-player-${g.id}">${allPlayers().map((p) => `<option value="${p.id}" ${mine?.id === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(p.team.name)}</option>`).join('')}</select>` : `<div class="small">Entering for <b>${esc(mine.name)}</b>${myEntry ? ` · current: ${fmt(g, myEntry.value)}` : ''}</div>`}
        <div class="row">${g.type === 'ctp'
          ? `<input class="input grow" id="g-ft-${g.id}" name="ft" type="number" inputmode="numeric" min="0" max="250" placeholder="Feet"><input class="input grow" id="g-in-${g.id}" name="in" type="number" inputmode="numeric" min="0" max="11" placeholder="Inches">`
          : `<input class="input grow" id="g-yd-${g.id}" name="yd" type="number" inputmode="numeric" min="0" max="500" placeholder="Yards">`}
          <button class="btn btn-primary" type="submit">Save</button></div>
        ${myEntry && !isAdmin() ? `<button class="link-btn" type="button" data-game-del="${g.id}:${mine.id}">Remove my distance</button>` : ''}
      </form>` : `<button class="btn btn-outline" data-action="who" style="justify-self:center">Pick your name to enter a distance (${unit(g)})</button>`}
    </div>`;
  }).join('');
}

// ---------- Recap ----------
const STAT_GROUPS = [
  { key: 'holes', eyebrow: 'Hole scores', opts: [['blowup', 'Blowup', 'Biggest Blowup Hole', 'hole'], ['lowest', 'Lowest', 'Lowest Hole Score', 'hole']] },
  { key: 'gross', eyebrow: 'Gross rounds', opts: [['bestGross', 'Best', 'Best Gross Round', 'round'], ['worstGross', 'Worst', 'Worst Gross Round', 'round']] },
  { key: 'net', eyebrow: 'Net rounds', opts: [['bestNet', 'Best', 'Best Net Round', 'round'], ['worstNet', 'Worst', 'Worst Net Round', 'round']] },
  { key: 'putts', eyebrow: 'Putting', opts: [['fewestPutts', 'Fewest', 'Fewest Putts', 'n'], ['mostPutts', 'Most', 'Most Putts', 'n'], ['puttAvgLow', 'Low Avg', 'Lowest Putts Per Hole', 'avg'], ['puttAvgHigh', 'High Avg', 'Highest Putts Per Hole', 'avg']] },
  { key: 'birdies', eyebrow: 'Birdies', opts: [['birdies', 'Birdies', 'Most Birdies', 'n'], ['eagles', 'Eagles', 'Most Eagles', 'n'], ['netBirdies', 'Net', 'Most Net Birdies', 'n']] },
  { key: 'doubles', eyebrow: 'Double bogeys', opts: [['doubles', 'Total', 'Most Double Bogeys or Worse', 'n']] },
  { key: 'streaks', eyebrow: 'Streaks', opts: [['parStreak', 'Par+', 'Longest Par Or Better Streak', 'n'], ['bogeyStreak', 'Bogey+', 'Longest Bogey Or Worse Streak', 'n']] },
  { key: 'fb', eyebrow: 'Gross front & back scores', opts: [['bestFront', 'Best Front', 'Best Gross Front', 'n'], ['worstFront', 'Worst Front', 'Worst Gross Front', 'n'], ['bestBack', 'Best Back', 'Best Gross Back', 'n'], ['worstBack', 'Worst Back', 'Worst Gross Back', 'n']] },
  { key: 'bypar', eyebrow: 'Scoring by par', opts: [['par3', 'Best 3s', 'Best Score On Par 3s', 'tp'], ['par3w', 'Worst 3s', 'Worst Score On Par 3s', 'tp'], ['par4', 'Best 4s', 'Best Score On Par 4s', 'tp'], ['par4w', 'Worst 4s', 'Worst Score On Par 4s', 'tp'], ['par5', 'Best 5s', 'Best Score On Par 5s', 'tp'], ['par5w', 'Worst 5s', 'Worst Score On Par 5s', 'tp']] },
  { key: 'diff', eyebrow: 'Hole difficulty', opts: [['hard', 'Best Hard', 'Best On Hardest Holes (Hcp 1–6)', 'tp'], ['hardw', 'Worst Hard', 'Worst On Hardest Holes (Hcp 1–6)', 'tp'], ['easy', 'Best Easy', 'Best On Easiest Holes (Hcp 13–18)', 'tp'], ['easyw', 'Worst Easy', 'Worst On Easiest Holes (Hcp 13–18)', 'tp']] },
];

function storyText(rc, lb) {
  const done = lb.filter((r) => r.complete);
  if (!done.length) return null;
  const all = lb.filter((r) => r.thru);
  const lead = all[0];
  const finished = done.length === data.teams.length;
  const tied = all.filter((r) => r.posNum === lead.posNum);
  let s = finished
    ? (tied.length > 1 ? `${tied.map((r) => r.team.name).join(' and ')} finished tied for the Fighter Invitational title at ${fmtToPar(lead.toPar)} (${lead.gross}).` : `${lead.team.name} won the Fighter Invitational at ${fmtToPar(lead.toPar)}, a ${lead.gross} at Victoria Park East.`)
    : `${done.length} of ${data.teams.length} teams are in the clubhouse. ${lead.team.name} leads at ${fmtToPar(lead.toPar)}${lead.complete ? '' : ` through ${lead.thru}`}.`;
  if (finished && all[1] && all[1].posNum !== lead.posNum) s += ` ${all[1].team.name} took second at ${fmtToPar(all[1].toPar)}.`;
  if (rc.birdies[0]) s += ` ${rc.birdies[0].team.name} made the most birdies (${rc.birdies[0].value}).`;
  if (rc.eagles[0]) s += ` ${rc.eagles[0].team.name} carded ${rc.eagles[0].value === 1 ? 'an eagle' : `${rc.eagles[0].value} eagles`}.`;
  const hard = rc.holeAvg.filter((h) => h.n).sort((a, b) => b.value - a.value)[0];
  if (hard) s += ` Hole ${hard.hole} played toughest, averaging ${fmtToPar(+hard.value.toFixed(2))} to par.`;
  if (rc.blowup[0]) s += ` The biggest blowup was ${rc.blowup[0].team.name}'s ${fmtToPar(rc.blowup[0].value)} on hole ${rc.blowup[0].hole}.`;
  for (const g of T().games) {
    const w = gameStandings(g, data.games[g.id])[0];
    const p = w && findPlayer(w.playerId);
    if (p) s += g.type === 'ctp' ? ` ${p.name} won closest to the pin on 6.` : ` ${p.name} won the long drive on 10 (${w.value} yds).`;
  }
  return s;
}

function chartSvg(rc) {
  const W = 360, H = 230, L = 32, R = 8, Tp = 10, B = 26;
  const pts = rc.progression;
  const vals = pts.flatMap((p) => p.points.filter((v) => v !== null));
  const lim = Math.max(10, Math.ceil(Math.max(5, ...vals.map(Math.abs)) / 5) * 5);
  const x = (i) => L + (i * (W - L - R)) / 17;
  const y = (v) => Tp + ((v + lim) * (H - Tp - B)) / (2 * lim); // under par plots higher
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score to par after each hole, by team">`;
  ticks.forEach((t) => { svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e3e7e4" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" font-size="10" text-anchor="end" fill="#7b847e">${t === 0 ? 'E' : t > 0 ? '+' + t : t}</text>`; });
  for (let i = 0; i < 18; i++) svg += `<text x="${x(i)}" y="${H - 8}" font-size="9.5" text-anchor="middle" fill="#7b847e">${i + 1}</text>`;
  data.teams.forEach((team, ti) => {
    const p = pts.find((q) => q.team.id === team.id);
    if (!p) return;
    const c = TEAM_COLORS[ti % TEAM_COLORS.length];
    let d = '', pen = false, last = null;
    p.points.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; last = [x(i), y(v)]; });
    if (d) svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (last) svg += `<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${c}"/>`;
  });
  return svg + '</svg>';
}

function viewRecap() {
  const rc = recap(data);
  const lb = leaderboard(data, false);
  const story = storyText(rc, lb);
  const legend = data.teams.map((t, i) => `<span><i style="background:${TEAM_COLORS[i % TEAM_COLORS.length]}"></i>${esc(t.name)}</span>`).join('');
  const fmtVal = (type, e) => (type === 'hole' ? `${fmtToPar(e.value)} · #${e.hole}` : type === 'round' ? `${e.value} (${fmtToPar(e.toPar)})` : type === 'tp' ? fmtToPar(e.value) : type === 'avg' ? e.value.toFixed(2) : e.value);
  const cards = STAT_GROUPS.map((g) => {
    const sel = ui.recapSel[g.key] || g.opts[0][0];
    const opt = g.opts.find((o) => o[0] === sel);
    const list = rc[sel] || [];
    const more = ui.recapMore[g.key];
    const shown = more ? list : list.slice(0, 3);
    return `<div class="card card-plain stat-card"><div class="eyebrow">${esc(g.eyebrow)}</div>
      ${g.opts.length > 1 ? `<div class="chips scroll">${g.opts.map((o) => `<button class="chip ${o[0] === sel ? 'on' : ''}" data-recap="${g.key}:${o[0]}">${esc(o[1])}</button>`).join('')}</div>` : ''}
      <div class="stat-title">${esc(opt[2])}</div>
      ${list.length ? shown.map((e, i) => `<div class="standing"><span class="rank r${i + 1}">${i + 1}</span><span class="grow"><b>${esc(e.team.name)}</b></span><span class="val num">${fmtVal(opt[3], e)}</span></div>`).join('')
        + (list.length > 3 ? `<div style="text-align:center"><button class="btn-outline btn" style="padding:4px 14px;font-size:13px" data-more="${g.key}">${more ? 'Show less' : `${list.length - 3} more`}</button></div>` : '')
        : '<p class="stat-empty">Not enough data yet</p>'}
    </div>`;
  }).join('');
  const avg = rc.holeAvg.filter((h) => h.n);
  return `
    <div class="card card-plain"><div class="eyebrow">✦ Tournament recap</div>
      ${story ? `<p class="story">${esc(story)}</p>` : `<p class="stat-empty">Once a team finishes its round, the story of the tournament shows up here: the results, the standouts, and how it played out.<br><span class="small">Waiting for the first completed round</span></p>`}
    </div>
    <div class="card card-plain chart"><div class="eyebrow">Scoring progression</div><div class="stat-title">Scramble</div>${chartSvg(rc)}<div class="legend">${legend}</div></div>
    ${cards}
    <div class="card card-plain"><div class="eyebrow">Hole averages</div>
      ${avg.length ? `<div class="sc-table"><table><tr class="hole"><th>Hole</th><th>Par</th><th>Hcp</th><th>Avg</th><th>Teams</th></tr>${avg.map((h) => `<tr><td>${h.hole}</td><td>${h.par}</td><td>${h.si}</td><td class="${h.value < 0 ? 'under' : ''}">${fmtToPar(+h.value.toFixed(2))}</td><td>${h.n}</td></tr>`).join('')}</table></div>` : '<p class="stat-empty">Not enough data yet</p>'}
    </div>`;
}

// ---------- Schedule ----------
function viewSchedule() {
  const c = T().course;
  const groups = [...data.teeTimes].sort((a, b) => a.time.localeCompare(b.time) || a.startHole - b.startHole);
  const head = `<div class="center-head"><div class="t">${esc(c.name)}</div><div>Oct 31, 2026</div><div class="small muted">Scramble · ${esc(data.settings.tee)} tees</div></div>`;
  if (!groups.length) return head + `<p class="empty">Once an admin creates tee times you will see them here${isAdmin() ? '.<br><a href="#admin">Add tee times</a>' : ''}</p>`;
  return head + `<div class="card"><div class="card-head">Round 1 tee times</div><div class="card-body">${groups.map((g) => `
    <div class="tee-group"><div><div class="tee-time num">${timeLabel(g.time)}</div><div class="small muted">Hole ${g.startHole}</div></div>
      <div class="stack" style="gap:8px;flex:1">${g.teamIds.map((id) => data.teams.find((t) => t.id === id)).filter(Boolean).map((t) => `<div><b>${esc(t.name)}</b><div class="small muted">${t.players.map((p) => esc(p.name)).join(', ')}</div></div>`).join('') || '<span class="muted small">No teams assigned</span>'}</div>
    </div>`).join('')}</div></div>`;
}

// ---------- Activity (group chat) ----------
function chatName() { return myPlayer()?.name || store.get('chatName', ''); }
function viewActivity() {
  const items = data.chat.map((m) => ({ ...m, kind: 'msg' }));
  const name = chatName();
  return `<div class="chat" id="chat">${items.length ? items.map((m) => `<div class="msg ${m.name === name ? 'mine' : ''}"><div class="meta"><b>${esc(m.name)}</b><span>${ago(m.at)}${isAdmin() ? ` · <button class="link-btn" style="color:inherit;padding:0" data-chat-del="${m.id}">delete</button>` : ''}</span></div><div class="text">${esc(m.text)}</div></div>`).join('')
    : '<p class="empty">No messages yet. Say hi to the group, talk trash, or post a rules question for the organizer.</p>'}</div>
    <form class="composer" id="composer">
      ${name ? '' : '<input class="input" id="chat-name" placeholder="Your name" maxlength="40" style="max-width:34%">'}
      <textarea id="chat-text" rows="1" maxlength="500" placeholder="Message the group"></textarea>
      <button class="btn btn-primary" type="submit">Send</button>
    </form>`;
}
afterRender.activity = (typing) => {
  if (typing) {
    // Refresh only the message list while someone is typing.
    const chat = $('#chat'); if (!chat) return;
    const tmp = document.createElement('div'); tmp.innerHTML = viewActivity();
    chat.replaceWith(tmp.querySelector('#chat'));
  }
  if (!afterRender.activity.scrolled) { window.scrollTo(0, document.body.scrollHeight); afterRender.activity.scrolled = true; }
};

// ---------- Admin ----------
let draft = null; // editable copy of config
function viewAdmin() {
  if (!isAdmin()) {
    return `<div class="card card-plain stack"><h2 style="margin:0">Organizer tools</h2>
      <p class="muted" style="margin:0">Enter the organizer PIN to manage teams, handicaps, tee times and scoring.</p>
      <form id="pin-form" class="row"><input class="input grow" id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Organizer PIN"><button class="btn btn-primary">Unlock</button></form></div>`;
  }
  if (!draft) draft = structuredClone({ teams: data.teams, teeTimes: data.teeTimes, settings: data.settings });
  const s = draft.settings;
  return `
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Organizer tools</h2><button class="link-btn" data-action="lock-admin">Sign out</button></div>
    <div class="card"><div class="card-head">Event settings</div><div class="card-body stack">
      <div class="field"><label for="a-tee">Tees</label><select class="input" id="a-tee">${T().course.tees.map((t) => `<option ${t.id === s.tee ? 'selected' : ''}>${t.id}</option>`).join('')}</select></div>
      <div class="field"><label for="a-method">Team handicap (used only when players have handicaps)</label>
        <select class="input" id="a-method">
          <option value="scramble4" ${s.teamHcpMethod === 'scramble4' ? 'selected' : ''}>4-person scramble: 25% / 20% / 15% / 10% (low to high)</option>
          <option value="pct" ${s.teamHcpMethod === 'pct' ? 'selected' : ''}>Percent of combined handicaps</option>
          <option value="none" ${s.teamHcpMethod === 'none' ? 'selected' : ''}>Gross only</option>
        </select></div>
      <div class="field" ${s.teamHcpMethod === 'pct' ? '' : 'hidden'}><label for="a-pct">Percent of combined handicaps</label><input class="input" id="a-pct" type="number" min="0" max="100" value="${s.teamHcpPct}"></div>
      <label class="check"><input type="checkbox" id="a-locked" ${s.locked ? 'checked' : ''}> Close scoring (players can no longer change scores)</label>
      <div class="field"><label for="a-ann">Announcement on the Home tab</label><input class="input" id="a-ann" maxlength="300" value="${esc(s.announcement)}" placeholder="e.g. Shotgun start at noon, be there by 11:30"></div>
    </div></div>

    <div class="card"><div class="card-head">Teams & players</div><div class="card-body stack">
      ${draft.teams.map((t, ti) => `<div class="admin-team">
        <div class="row"><input class="input grow" data-tname="${ti}" value="${esc(t.name)}" aria-label="Team name"><input class="input" style="width:110px" data-thcp="${ti}" type="number" step="0.1" value="${t.hcpOverride ?? ''}" placeholder="Team hcp" aria-label="Team handicap override"><button class="x-btn" data-del-team="${ti}" title="Remove team">×</button></div>
        ${t.players.map((p, pi) => `<div class="admin-player"><input class="input" data-pname="${ti}:${pi}" value="${esc(p.name)}" aria-label="Player name"><input class="input" data-phcp="${ti}:${pi}" type="number" step="0.1" value="${p.hcp ?? ''}" placeholder="Hcp" aria-label="Handicap"><button class="x-btn" data-del-player="${ti}:${pi}" title="Remove player">×</button></div>`).join('')}
        <div class="row"><button class="link-btn" data-add-player="${ti}">+ Add player</button>
          ${draft.teams.length > 1 ? `<select class="input" style="width:auto;margin-left:auto" data-move="${ti}" aria-label="Move a player"><option value="">Move player to…</option>${t.players.map((p, pi) => draft.teams.map((o, oi) => (oi === ti ? '' : `<option value="${pi}:${oi}">${esc(p.name)} → ${esc(o.name)}</option>`)).join('')).join('')}</select>` : ''}</div>
      </div>`).join('')}
      <button class="btn" data-action="add-team">+ Add team</button>
      <p class="small muted" style="margin:0">Team hcp overrides the calculated team handicap. Leave blank to calculate it from player handicaps.</p>
    </div></div>

    <div class="card"><div class="card-head">Tee times</div><div class="card-body stack">
      ${draft.teeTimes.map((g, gi) => `<div class="admin-team">
        <div class="row"><input class="input" style="width:130px" type="time" data-gtime="${gi}" value="${g.time}" aria-label="Tee time"><label class="small">Hole <input class="input" style="width:70px" type="number" min="1" max="18" data-ghole="${gi}" value="${g.startHole}"></label><button class="x-btn" style="margin-left:auto" data-del-group="${gi}" title="Remove tee time">×</button></div>
        <div class="team-checks">${draft.teams.map((t) => `<label><input type="checkbox" data-gteam="${gi}:${t.id}" ${g.teamIds.includes(t.id) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</div>
      </div>`).join('') || '<p class="muted small" style="margin:0">No tee times yet.</p>'}
      <div class="row"><button class="btn" data-action="add-group">+ Add tee time</button><button class="btn" data-action="shotgun">Shotgun start (one team per hole)</button></div>
    </div></div>

    <div class="row" style="position:sticky;bottom:calc(12px + env(safe-area-inset-bottom,0px))"><button class="btn btn-primary btn-block" data-action="save-admin">Save changes</button></div>

    <div class="card"><div class="card-head">Danger zone</div><div class="card-body stack">
      <div class="row"><select class="input grow" id="clear-team"><option value="">All teams</option>${data.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><button class="btn btn-danger" data-action="clear-scores">Clear scores…</button></div>
      <button class="btn btn-danger" data-action="clear-games">Clear hole competition results…</button>
      <button class="btn btn-danger" data-action="reset-config">Restore original teams from Squabbit…</button>
    </div></div>`;
}
afterRender.admin = () => {};

function syncDraftFromInputs() {
  if (!draft) return;
  const v = $('#view');
  const num = (el) => (el.value === '' ? null : Number(el.value));
  v.querySelectorAll('[data-tname]').forEach((el) => { draft.teams[el.dataset.tname].name = el.value; });
  v.querySelectorAll('[data-thcp]').forEach((el) => { draft.teams[el.dataset.thcp].hcpOverride = num(el); });
  v.querySelectorAll('[data-pname]').forEach((el) => { const [t, p] = el.dataset.pname.split(':'); draft.teams[t].players[p].name = el.value; });
  v.querySelectorAll('[data-phcp]').forEach((el) => { const [t, p] = el.dataset.phcp.split(':'); draft.teams[t].players[p].hcp = num(el); });
  v.querySelectorAll('[data-gtime]').forEach((el) => { draft.teeTimes[el.dataset.gtime].time = el.value || '12:00'; });
  v.querySelectorAll('[data-ghole]').forEach((el) => { draft.teeTimes[el.dataset.ghole].startHole = Number(el.value) || 1; });
  draft.teeTimes.forEach((g, gi) => { g.teamIds = [...v.querySelectorAll(`[data-gteam^="${gi}:"]`)].filter((c) => c.checked).map((c) => c.dataset.gteam.split(':')[1]); });
  const tee = $('#a-tee'); if (tee) draft.settings.tee = tee.value;
  const m = $('#a-method'); if (m) draft.settings.teamHcpMethod = m.value;
  const pct = $('#a-pct'); if (pct) draft.settings.teamHcpPct = Number(pct.value) || 0;
  const lk = $('#a-locked'); if (lk) draft.settings.locked = lk.checked;
  const an = $('#a-ann'); if (an) draft.settings.announcement = an.value;
}
// Callers sync the inputs into `draft` before changing it.
function redrawAdmin() { $('#view').innerHTML = viewAdmin(); }

// Two-tap confirm, since dialogs are unreliable on some phones.
function confirmTap(btn, run) {
  if (btn.dataset.armed) { delete btn.dataset.armed; run(); return; }
  btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = 'Tap again to confirm';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = old; } }, 3500);
}

// ---------- Sheets (dialogs) ----------
const sheetOpen = () => !$('#sheet').hidden;
function openSheet(html, center = false) {
  const s = $('#sheet'); s.innerHTML = html; s.classList.toggle('center', center); s.hidden = false; $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; document.body.style.overflow = ''; scoreCtx = null; refresh(); }

function whoSheet() {
  openSheet(`<h2 style="font-size:18px;font-weight:500">Are you playing in Fighter Invitational, or just spectating?</h2>
    <button class="choice" data-action="iam-player"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-3 13.3V17h6v-1.7A7 7 0 0 0 12 2zm-2 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-2 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM9 19h6v2H9z"/></svg><span><div class="t">I'm playing</div><div class="d">I'm a participant in the tournament</div></span></button>
    <button class="choice" data-action="iam-spectator"><svg viewBox="0 0 24 24"><path d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg><span><div class="t">I'm spectating</div><div class="d">Just follow along with the leaderboard</div></span></button>`, true);
}
function pickPlayerSheet() {
  openSheet(`<h2>Who are you?</h2><p class="sheet-sub">Pick your name. You'll be able to enter scores for your team.</p>
    <label class="search" style="margin-bottom:8px"><input id="pick-q" type="search" placeholder="Search players" autocomplete="off"></label>
    <div class="pick-list" id="pick-list">${pickList('')}</div>
    <button class="btn btn-block" style="margin-top:12px" data-action="close">Cancel</button>`);
}
function pickList(q) {
  q = q.toLowerCase();
  return data.teams.map((t) => {
    const ps = t.players.filter((p) => !q || p.name.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
    if (!ps.length) return '';
    return `<div class="pick-team">${esc(t.name)}</div>${ps.map((p) => `<button class="pick ${me?.playerId === p.id ? 'on' : ''}" data-pick="${p.id}">${avatar(p.name)}${esc(p.name)}</button>`).join('')}`;
  }).join('') || '<p class="empty">No players match.</p>';
}
function pickTeamSheet() {
  openSheet(`<h2>Enter scores</h2><p class="sheet-sub">${isAdmin() ? 'Pick a team to score.' : 'Pick your name first so we know which team you score for.'}</p>
    ${isAdmin() ? `<div class="pick-list">${data.teams.map((t) => `<button class="pick" style="font-style:normal" data-enter="${t.id}"><b>${esc(t.name)}</b>&nbsp;<span class="small muted">${t.players.map((p) => esc(p.name)).join(', ')}</span></button>`).join('')}</div>`
      : `<button class="btn btn-primary btn-block" data-action="iam-player">Pick my name</button>`}
    <button class="btn btn-block" style="margin-top:10px" data-action="close">Cancel</button>`);
}

// Score entry
let scoreCtx = null; // {teamId, hole, strokes, putts}
function openScore(teamId, hole) {
  const card = data.scores[teamId] || { holes: {}, putts: {} };
  if (!hole) {
    const order = startOrder(teamId);
    hole = order.find((n) => card.holes[n] == null) || order[0];
  }
  const h = holes()[hole - 1];
  scoreCtx = { teamId, hole, strokes: card.holes[hole] ?? h.par, putts: card.putts?.[hole] ?? null, existing: card.holes[hole] != null };
  drawScore();
}
function startOrder(teamId) {
  const g = data.teeTimes.find((x) => x.teamIds.includes(teamId));
  const s = g?.startHole || 1;
  return Array.from({ length: 18 }, (_, i) => ((s - 1 + i) % 18) + 1);
}
function drawScore() {
  const c = scoreCtx;
  const team = data.teams.find((t) => t.id === c.teamId);
  const h = holes()[c.hole - 1];
  const card = data.scores[c.teamId] || { holes: {} };
  const rel = c.strokes - h.par;
  const names = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };
  const quick = [-2, -1, 0, 1, 2].map((d) => h.par + d).filter((v) => v >= 1);
  const ctp = T().games.find((g) => g.hole === h.n);
  openSheet(`
    <div class="hole-info"><div><div class="eyebrow">${esc(team.name)}</div><div class="h">Hole ${h.n}</div></div>
      <div class="small muted" style="text-align:right">Par ${h.par} · ${h.yards[data.settings.tee]} yds<br>Hcp ${h.si}</div></div>
    <div class="stepper"><button data-step="-1" aria-label="One fewer stroke">−</button>
      <div><div class="big num">${c.strokes}</div><div class="rel">${names[rel] || fmtToPar(rel)}</div></div>
      <button data-step="1" aria-label="One more stroke">+</button></div>
    <div class="quick">${quick.map((v) => `<button class="${v === c.strokes ? 'on' : ''}" data-set="${v}"><b>${v}</b>${names[v - h.par] || ''}</button>`).join('')}</div>
    <div class="putts"><span class="small"><b>Putts</b> <span class="muted">(optional)</span></span><div class="pbtns">${[0, 1, 2, 3].map((p) => `<button class="${c.putts === p ? 'on' : ''}" data-putts="${p}">${p}${p === 3 ? '+' : ''}</button>`).join('')}</div></div>
    ${ctp ? `<div class="banner" style="margin-top:12px">${esc(ctp.label)} is on this hole. <a href="#leaderboard" data-action="to-games">Enter distances in Games</a></div>` : ''}
    <div class="sheet-actions">${c.existing ? '<button class="btn btn-danger" data-action="clear-hole">Clear</button>' : '<button class="btn" data-action="close">Cancel</button>'}<button class="btn btn-primary" data-action="save-hole">Save${c.hole !== startOrder(c.teamId).at(-1) ? ' & next' : ''}</button></div>
    <div class="hole-dots">${holes().map((x) => `<button class="${x.n === c.hole ? 'cur' : card.holes[x.n] != null ? 'done' : ''}" data-goto="${x.n}" aria-label="Hole ${x.n}">${x.n}</button>`).join('')}</div>
    <div style="text-align:center;margin-top:10px"><a class="link-btn" href="#team-${team.id}" data-action="close">View scorecard</a></div>`);
}
async function saveHole(clear = false) {
  const c = scoreCtx;
  const by = myPlayer()?.name || (isAdmin() ? 'Organizer' : '');
  const body = { teamId: c.teamId, hole: c.hole, strokes: clear ? null : c.strokes, putts: clear ? null : c.putts, by };
  // optimistic update
  const card = data.scores[c.teamId] || (data.scores[c.teamId] = { holes: {}, putts: {} });
  card.putts ||= {};
  if (clear) { delete card.holes[c.hole]; delete card.putts[c.hole]; } else { card.holes[c.hole] = c.strokes; if (c.putts === null) delete card.putts[c.hole]; else card.putts[c.hole] = c.putts; }
  render();
  try {
    const out = await api('score', body);
    data.scores[c.teamId] = out.card;
  } catch (e) {
    toast(e.message || 'Score not saved. Check your connection and try again.');
    refresh();
    return false;
  }
  return true;
}

// ---------- events ----------
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('button, a');
  if (!el) return;
  const d = el.dataset;

  if (el.id === 'btn-back') { history.length > 1 ? history.back() : (location.hash = '#leaderboard'); return; }
  if (el.id === 'btn-share') {
    const url = location.origin + '/';
    try { if (navigator.share) { await navigator.share({ title: 'Fighter Invitational', text: 'Live leaderboard for the Fighter Invitational', url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
    return;
  }
  if (el.id === 'btn-me' || d.action === 'who') { whoSheet(); return; }
  if (el.id === 'btn-enter') {
    if (myTeam()) openScore(myTeam().id);
    else pickTeamSheet();
    return;
  }
  if (d.action === 'close') { closeSheet(); return; }
  if (d.action === 'iam-player') { pickPlayerSheet(); return; }
  if (d.action === 'iam-spectator') { me = { role: 'spectator' }; store.set('me', me); closeSheet(); render(); return; }
  if (d.pick) { me = { role: 'player', playerId: d.pick }; store.set('me', me); closeSheet(); toast(`Welcome, ${findPlayer(d.pick)?.name}`); render(); return; }
  if (d.enter) { openScore(d.enter); return; }
  if (d.action === 'to-games') { ui.lbSection = 'games'; closeSheet(); return; }

  // Score sheet
  if (scoreCtx) {
    if (d.step) { scoreCtx.strokes = Math.min(20, Math.max(1, scoreCtx.strokes + Number(d.step))); drawScore(); return; }
    if (d.set) { scoreCtx.strokes = Number(d.set); drawScore(); return; }
    if (d.putts !== undefined) { const p = Number(d.putts); scoreCtx.putts = scoreCtx.putts === p ? null : p; drawScore(); return; }
    if (d.goto) { openScore(scoreCtx.teamId, Number(d.goto)); return; }
    if (d.action === 'save-hole' || d.action === 'clear-hole') {
      const clear = d.action === 'clear-hole';
      el.disabled = true;
      const ok = await saveHole(clear);
      if (!ok) { el.disabled = false; return; }
      if (clear) { openScore(scoreCtx.teamId, scoreCtx.hole); return; }
      const order = startOrder(scoreCtx.teamId);
      const i = order.indexOf(scoreCtx.hole);
      if (i < order.length - 1) { toast(`Hole ${scoreCtx.hole} saved`); openScore(scoreCtx.teamId, order[i + 1]); }
      else { toast('Round saved. Nice playing!'); const id = scoreCtx.teamId; closeSheet(); location.hash = '#team-' + id; }
      return;
    }
  }

  if (d.score) {
    const [teamId, hole] = d.score.split(':');
    if (data.settings.locked && !isAdmin()) { toast('Scoring is closed.'); return; }
    if (canScore(teamId)) openScore(teamId, Number(hole));
    else if (!myPlayer()) pickTeamSheet();
    else location.hash = '#team-' + teamId;
    return;
  }

  // Leaderboard controls
  if (d.section) { ui.lbSection = d.section; render(); return; }
  if (d.mode) { ui.lbMode = d.mode; store.set('lbMode', d.mode); render(); return; }
  if (d.net !== undefined) { ui.net = d.net === '1'; store.set('net', ui.net); render(); return; }
  if (d.toggle) { ui.open.has(d.toggle) ? ui.open.delete(d.toggle) : ui.open.add(d.toggle); store.set('open', [...ui.open]); render(); return; }
  if (d.recap) { const [g, k] = d.recap.split(':'); ui.recapSel[g] = k; render(); return; }
  if (d.more) { ui.recapMore[d.more] = !ui.recapMore[d.more]; render(); return; }
  if (d.sort) { if (ui.pSort === d.sort) ui.pDir *= -1; else { ui.pSort = d.sort; ui.pDir = 1; } render(); return; }
  if (d.gameDel) {
    const [gameId, playerId] = d.gameDel.split(':');
    try { const out = await api('game', { gameId, playerId, value: null }); data.games = out.games; render(); toast('Distance removed'); } catch (e) { toast(e.message); }
    return;
  }
  if (d.chatDel) { try { await api('admin/chat-delete', { id: d.chatDel }); refresh(); } catch (e) { toast(e.message); } return; }

  // Admin editing
  if (route().name === 'admin' && draft) {
    if (d.action === 'add-team') { syncDraftFromInputs(); draft.teams.push({ id: `t${Date.now().toString(36)}`, name: `Team ${draft.teams.length + 1}`, hcpOverride: null, players: [] }); redrawAdmin(); return; }
    if (d.delTeam !== undefined) { confirmTap(el, () => { syncDraftFromInputs(); draft.teams.splice(Number(d.delTeam), 1); redrawAdmin(); }); return; }
    if (d.addPlayer !== undefined) { syncDraftFromInputs(); draft.teams[d.addPlayer].players.push({ id: `p${Date.now().toString(36)}`, name: '', hcp: null }); redrawAdmin(); return; }
    if (d.delPlayer) { const [t, p] = d.delPlayer.split(':'); syncDraftFromInputs(); draft.teams[t].players.splice(Number(p), 1); redrawAdmin(); return; }
    if (d.action === 'add-group') { syncDraftFromInputs(); const last = draft.teeTimes.at(-1); let t = last ? last.time : T().startTime; if (last) { const [hh, mm] = t.split(':').map(Number); const m = hh * 60 + mm + 10; t = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; } draft.teeTimes.push({ id: `g${Date.now().toString(36)}`, time: t, startHole: 1, teamIds: [] }); redrawAdmin(); return; }
    if (d.delGroup !== undefined) { syncDraftFromInputs(); draft.teeTimes.splice(Number(d.delGroup), 1); redrawAdmin(); return; }
    if (d.action === 'shotgun') { syncDraftFromInputs(); draft.teeTimes = draft.teams.map((t, i) => ({ id: `g${Date.now().toString(36)}${i}`, time: T().startTime, startHole: (i % 18) + 1, teamIds: [t.id] })); redrawAdmin(); toast('Shotgun groups added. Adjust holes if needed, then save.'); return; }
    if (d.action === 'save-admin') {
      syncDraftFromInputs();
      el.disabled = true;
      try { await api('admin/config', draft); draft = null; await refresh(); render(); toast('Saved'); }
      catch (e) { toast(e.message); el.disabled = false; }
      return;
    }
    if (d.action === 'lock-admin') { adminPin = null; session.set('pin', null); draft = null; render(); return; }
    if (d.action === 'clear-scores') { confirmTap(el, async () => { const teamId = $('#clear-team').value || undefined; try { await api('admin/clear-scores', { teamId }); toast('Scores cleared'); refresh(); } catch (e) { toast(e.message); } }); return; }
    if (d.action === 'clear-games') { confirmTap(el, async () => { try { await api('admin/clear-games', {}); toast('Hole competitions cleared'); refresh(); } catch (e) { toast(e.message); } }); return; }
    if (d.action === 'reset-config') { confirmTap(el, async () => { try { await api('admin/reset-config', {}); draft = null; await refresh(); render(); toast('Teams restored'); } catch (e) { toast(e.message); } }); return; }
  }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (route().name !== 'admin' || !draft) return;
  if (el.id === 'a-method') { syncDraftFromInputs(); redrawAdmin(); }
  if (el.dataset.move !== undefined && el.value) {
    syncDraftFromInputs();
    const from = Number(el.dataset.move); const [pi, to] = el.value.split(':').map(Number);
    const [p] = draft.teams[from].players.splice(pi, 1); draft.teams[to].players.push(p);
    redrawAdmin();
  }
});

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'p-search') {
    ui.pQuery = el.value;
    const pos = el.selectionStart;
    $('#view').innerHTML = viewHome({ name: 'players' });
    const n = $('#p-search'); n.focus(); n.setSelectionRange(pos, pos);
  }
  if (el.id === 'pick-q') $('#pick-list').innerHTML = pickList(el.value);
  if (el.id === 'chat-text') { el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; }
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target;
  ev.preventDefault();
  if (f.id === 'pin-form') {
    const pin = $('#pin').value.trim();
    adminPin = pin;
    try { await api('admin/verify', {}); session.set('pin', pin); toast('Organizer tools unlocked'); render(); }
    catch (e) { adminPin = null; toast(e.message); }
    return;
  }
  if (f.id === 'composer') {
    const nameEl = $('#chat-name');
    const name = nameEl ? nameEl.value.trim() : chatName();
    const text = $('#chat-text').value.trim();
    if (!name) { toast('Add your name first'); nameEl?.focus(); return; }
    if (!text) return;
    if (nameEl) store.set('chatName', name);
    const btn = f.querySelector('button'); btn.disabled = true;
    try { const out = await api('chat', { name, text }); data.chat = out.chat; $('#chat-text').value = ''; $('#chat-text').blur(); afterRender.activity.scrolled = false; render(); }
    catch (e) { toast(e.message); }
    btn.disabled = false;
    return;
  }
  if (f.dataset.game) {
    const g = T().games.find((x) => x.id === f.dataset.game);
    const playerId = isAdmin() ? f.querySelector('select').value : myPlayer()?.id;
    let value;
    if (g.type === 'ctp') { const ft = Number(f.ft.value || 0), inch = Number(f.in.value || 0); if (!f.ft.value && !f.in.value) { toast('Enter feet and inches'); return; } value = Math.round(ft * 12 + inch); }
    else { if (!f.yd.value) { toast('Enter yards'); return; } value = Number(f.yd.value); }
    try { const out = await api('game', { gameId: g.id, playerId, value }); data.games = out.games; render(); toast('Distance saved'); }
    catch (e) { toast(e.message); }
  }
});

$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });
window.addEventListener('hashchange', () => {
  if (route().name !== 'admin') draft = null;
  afterRender.activity.scrolled = false;
  if (sheetOpen()) { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; document.body.style.overflow = ''; scoreCtx = null; }
  render();
  if (route().name !== 'activity') window.scrollTo(0, 0);
});

// ---------- boot ----------
startPolling();
const firstVisit = setInterval(() => {
  if (!data) return;
  clearInterval(firstVisit);
  if (!me) whoSheet();
}, 200);
