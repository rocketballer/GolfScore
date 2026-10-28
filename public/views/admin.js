// Organizer tools. Edits go into a local draft and are sent together on "Save changes".
import { html } from '../lib/html.js';
import { $, confirmTap, setPath, toast } from '../lib/util.js';
import { HCP_METHODS } from '../shared/rules.js';
import { api, app, isOrganizer, refresh, rerender, setOrganizerPin, tournament } from '../state.js';

let draft = null; // { teams, teeTimes, settings }: what the organizer is editing

const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// An input bound to a draft field: data-path says where its value goes.
const field = (path, value, label) =>
  html`<input class="input grow" data-action="admin-set" data-path="${path}" value="${value ?? ''}" aria-label="${label}">`;
const numField = (path, value, placeholder, label) =>
  html`<input class="input" type="number" step="0.1" data-action="admin-set" data-type="number" data-path="${path}" value="${value ?? ''}" placeholder="${placeholder}" aria-label="${label}">`;

function lockedView() {
  return html`<div class="card card-plain stack"><h2 class="flush">Organizer tools</h2>
    <p class="muted flush">Enter the organizer PIN to manage teams, handicaps, tee times and scoring.</p>
    <form class="row" data-action="admin-unlock"><input class="input grow" name="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Organizer PIN" aria-label="Organizer PIN"><button class="btn btn-primary">Unlock</button></form></div>`;
}

function teamEditor(t, ti) {
  const others = draft.teams.map((o, oi) => [o, oi]).filter(([, oi]) => oi !== ti);
  return html`<div class="admin-team">
    <div class="row">${field(`teams.${ti}.name`, t.name, 'Team name')}
      ${numField(`teams.${ti}.hcpOverride`, t.hcpOverride, 'Team hcp', 'Team handicap override')}
      <button class="x-btn" data-action="admin-del-team" data-team="${ti}" title="Remove team">×</button></div>
    ${t.players.map((p, pi) => html`<div class="admin-player">
      ${field(`teams.${ti}.players.${pi}.name`, p.name, 'Player name')}
      ${numField(`teams.${ti}.players.${pi}.hcp`, p.hcp, 'Hcp', 'Handicap')}
      <button class="x-btn" data-action="admin-del-player" data-team="${ti}" data-player="${pi}" title="Remove player">×</button></div>`)}
    <div class="row"><button class="link-btn" data-action="admin-add-player" data-team="${ti}">+ Add player</button>
      ${others.length > 0 && t.players.length > 0 && html`<select class="input push-right" data-action="admin-move-player" data-team="${ti}" aria-label="Move a player">
        <option value="">Move player to…</option>
        ${t.players.map((p, pi) => others.map(([o, oi]) => html`<option value="${pi}:${oi}">${p.name} → ${o.name}</option>`))}</select>`}</div>
  </div>`;
}

function teeTimeEditor(g, gi) {
  return html`<div class="admin-team">
    <div class="row"><input class="input time-input" type="time" data-action="admin-set" data-path="teeTimes.${gi}.time" value="${g.time}" aria-label="Tee time">
      <label class="small">Hole <input class="input hole-input" type="number" min="1" max="18" data-action="admin-set" data-type="number" data-path="teeTimes.${gi}.startHole" value="${g.startHole}"></label>
      <button class="x-btn push-right" data-action="admin-del-group" data-group="${gi}" title="Remove tee time">×</button></div>
    <div class="team-checks">${draft.teams.map((t) => html`<label><input type="checkbox" data-action="admin-group-team" data-group="${gi}" data-team="${t.id}" ${g.teamIds.includes(t.id) && 'checked'}>${t.name}</label>`)}</div>
  </div>`;
}

function render() {
  if (!isOrganizer()) return lockedView();
  draft ||= structuredClone({ teams: app.data.teams, teeTimes: app.data.teeTimes, settings: app.data.settings });
  const s = draft.settings;
  return html`
    <div class="row spread"><h2 class="flush">Organizer tools</h2><button class="link-btn" data-action="admin-sign-out">Sign out</button></div>
    <div class="card"><div class="card-head">Event settings</div><div class="card-body stack">
      <div class="field"><label for="a-tee">Tees</label><select class="input" id="a-tee" data-action="admin-set" data-path="settings.tee">
        ${tournament().course.tees.map((t) => html`<option ${t.id === s.tee && 'selected'}>${t.id}</option>`)}</select></div>
      <div class="field"><label for="a-method">Team handicap (used only when players have handicaps)</label>
        <select class="input" id="a-method" data-action="admin-set" data-path="settings.teamHcpMethod" data-redraw="1">
          ${Object.entries(HCP_METHODS).map(([k, label]) => html`<option value="${k}" ${s.teamHcpMethod === k && 'selected'}>${label}</option>`)}</select></div>
      ${s.teamHcpMethod === 'pct' && html`<div class="field"><label for="a-pct">Percent of combined handicaps</label>
        <input class="input" id="a-pct" type="number" min="0" max="100" data-action="admin-set" data-type="number" data-path="settings.teamHcpPct" value="${s.teamHcpPct}"></div>`}
      <label class="check"><input type="checkbox" data-action="admin-set" data-type="bool" data-path="settings.locked" ${s.locked && 'checked'}> Close scoring (players can no longer change scores)</label>
      <div class="field"><label for="a-ann">Announcement on the Home tab</label>
        <input class="input" id="a-ann" maxlength="300" data-action="admin-set" data-path="settings.announcement" value="${s.announcement}" placeholder="e.g. Shotgun start at noon, be there by 11:30"></div>
    </div></div>

    <div class="card"><div class="card-head">Teams & players</div><div class="card-body stack">
      ${draft.teams.map(teamEditor)}
      <button class="btn" data-action="admin-add-team">+ Add team</button>
      <p class="small muted flush">Team hcp overrides the calculated team handicap. Leave blank to calculate it from player handicaps.</p>
    </div></div>

    <div class="card"><div class="card-head">Tee times</div><div class="card-body stack">
      ${draft.teeTimes.length ? draft.teeTimes.map(teeTimeEditor) : html`<p class="muted small flush">No tee times yet.</p>`}
      <div class="row"><button class="btn" data-action="admin-add-group">+ Add tee time</button><button class="btn" data-action="admin-shotgun">Shotgun start (one team per hole)</button></div>
    </div></div>

    <div class="row save-bar"><button class="btn btn-primary btn-block" data-action="admin-save">Save changes</button></div>

    <div class="card"><div class="card-head">Danger zone</div><div class="card-body stack">
      <div class="row"><select class="input grow" id="clear-team" aria-label="Team to clear"><option value="">All teams</option>${app.data.teams.map((t) => html`<option value="${t.id}">${t.name}</option>`)}</select>
        <button class="btn btn-danger" data-action="admin-clear-scores">Clear scores…</button></div>
      <button class="btn btn-danger" data-action="admin-clear-games">Clear hole competition results…</button>
      <button class="btn btn-danger" data-action="admin-reset">Restore original teams from Squabbit…</button>
    </div></div>`;
}

/** Changes the draft, then redraws the form from it. */
const edit = (change) => { change(draft); rerender(); };

/** Runs a server action, reporting success or the error. */
async function run(path, body, done) {
  try { await api(path, body); toast(done); return true; } catch (e) { toast(e.message); return false; }
}

export default {
  render,
  whileTyping: () => {}, // never redraw under the organizer's cursor
  leave: () => { draft = null; },
  actions: {
    'admin-unlock': async (_, form) => {
      setOrganizerPin(form.elements.pin.value.trim());
      try { await api('admin/verify', {}); toast('Organizer tools unlocked'); rerender(); }
      catch (e) { setOrganizerPin(null); toast(e.message); }
    },
    'admin-sign-out': () => { setOrganizerPin(null); draft = null; rerender(); },

    // Field edits: data-path names the draft field, data-type how to read the value.
    'admin-set': ({ path, type, redraw }, el) => {
      const value = type === 'bool' ? el.checked : type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
      setPath(draft, path, value);
      if (redraw) rerender();
    },
    'admin-group-team': ({ group, team }, el) => {
      const ids = draft.teeTimes[group].teamIds.filter((id) => id !== team);
      draft.teeTimes[group].teamIds = el.checked ? [...ids, team] : ids;
    },

    'admin-add-team': () => edit((d) => d.teams.push({ id: newId('t'), name: `Team ${d.teams.length + 1}`, hcpOverride: null, players: [] })),
    'admin-del-team': ({ team }, el) => confirmTap(el, () => edit((d) => d.teams.splice(Number(team), 1))),
    'admin-add-player': ({ team }) => edit((d) => d.teams[team].players.push({ id: newId('p'), name: '', hcp: null })),
    'admin-del-player': ({ team, player }) => edit((d) => d.teams[team].players.splice(Number(player), 1)),
    'admin-move-player': ({ team }, el) => {
      if (!el.value) return;
      const [pi, to] = el.value.split(':').map(Number);
      edit((d) => d.teams[to].players.push(...d.teams[team].players.splice(pi, 1)));
    },
    'admin-add-group': () => edit((d) => {
      const last = d.teeTimes.at(-1);
      d.teeTimes.push({ id: newId('g'), time: last ? addMinutes(last.time, 10) : tournament().startTime, startHole: 1, teamIds: [] });
    }),
    'admin-del-group': ({ group }) => edit((d) => d.teeTimes.splice(Number(group), 1)),
    'admin-shotgun': () => {
      edit((d) => { d.teeTimes = d.teams.map((t, i) => ({ id: newId('g'), time: tournament().startTime, startHole: (i % 18) + 1, teamIds: [t.id] })); });
      toast('Shotgun groups added. Adjust holes if needed, then save.');
    },

    'admin-save': async (_, el) => {
      el.disabled = true;
      if (await run('admin/config', draft, 'Saved')) { draft = null; await refresh(); rerender(); }
      el.disabled = false;
    },
    'admin-clear-scores': (_, el) => confirmTap(el, async () => {
      if (await run('admin/clear-scores', { teamId: $('#clear-team').value || undefined }, 'Scores cleared')) refresh();
    }),
    'admin-clear-games': (_, el) => confirmTap(el, async () => {
      if (await run('admin/clear-games', {}, 'Hole competitions cleared')) refresh();
    }),
    'admin-reset': (_, el) => confirmTap(el, async () => {
      if (await run('admin/reset-config', {}, 'Teams restored')) { draft = null; await refresh(); rerender(); }
    }),
  },
};
