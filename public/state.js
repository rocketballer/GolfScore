// The app's single source of truth: server data, who this viewer is, and
// screen preferences. Views read from here and never fetch on their own.
import { leaderboard, teamHandicap } from './scoring.js';
import { local, session } from './lib/util.js';

export const app = {
  data: null,      // last /api/state response
  online: true,
  me: local.get('me'),             // {role:'player', playerId} | {role:'spectator'} | null
  adminPin: session.get('pin'),    // set once the organizer PIN is verified
  ui: {
    lbSection: 'scramble',
    lbMode: local.get('lbMode', 'overall'),
    net: local.get('net', false),
    open: new Set(local.get('open', [])),
    playerSort: 'name', playerDir: 1, playerQuery: '',
    recapPick: {}, recapMore: {},
    chatDraft: '', chatNameDraft: '',
  },
};

// ----- re-rendering (app.js registers the real function) -----
let renderFn = () => {};
export const onRender = (fn) => { renderFn = fn; };
export const rerender = () => renderFn();

// ----- tournament facts -----
export const tournament = () => app.data.tournament;
export const holes = () => app.data.tournament.course.holes;
export const settings = () => app.data.settings;
export const allPlayers = () => app.data.teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t })));
export const findPlayer = (id) => allPlayers().find((p) => p.id === id) || null;
export const findTeam = (id) => app.data.teams.find((t) => t.id === id) || null;

// ----- who is viewing -----
export const myPlayer = () => (app.me?.playerId ? findPlayer(app.me.playerId) : null);
export const myTeam = () => myPlayer()?.team || null;
export const isOrganizer = () => !!app.adminPin;
export function setMe(me) { app.me = me; local.set('me', me); }
export function setOrganizerPin(pin) { app.adminPin = pin; session.set('pin', pin); }

/** Scoring is open to players unless the organizer closed it. */
export const scoringOpen = () => isOrganizer() || !settings().locked;
/** The one rule for "may this viewer enter a score for this team right now". */
export const canScore = (teamId) => scoringOpen() && (isOrganizer() || myTeam()?.id === teamId);

// ----- derived numbers, computed once per data update -----
let cache = { data: null };
function derived() {
  if (cache.data !== app.data) {
    const hasHandicaps = app.data.teams.some((t) => teamHandicap(t, app.data.settings) !== null);
    cache = { data: app.data, hasHandicaps, boards: {} };
  }
  return cache;
}
export const hasHandicaps = () => derived().hasHandicaps;
/** True when the viewer chose net and net scores exist. */
export const useNet = () => app.ui.net && hasHandicaps();
/** Sorted team rounds with positions; `net` defaults to the viewer's choice. */
export function standings(net = useNet()) {
  const boards = derived().boards;
  return (boards[net] ||= leaderboard(app.data, net));
}

// ----- server -----
export async function api(path, body) {
  const headers = { 'content-type': 'application/json' };
  if (app.adminPin) headers['x-admin-pin'] = app.adminPin;
  const init = body === undefined ? { cache: 'no-store', headers } : { method: 'POST', headers, body: JSON.stringify(body) };
  let res;
  try { res = await fetch('/api/' + path, init); }
  catch { throw new Error(body === undefined ? 'No connection.' : 'No connection, so nothing was saved. Try again when you have signal.'); }
  let out = {};
  try { out = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    // A PIN the server no longer accepts: drop back to a regular viewer.
    if (app.adminPin && (res.status === 401 || res.status === 429)) { setOrganizerPin(null); rerender(); }
    throw new Error(out.error || `Request failed (${res.status})`);
  }
  return out;
}

let lastSignature = '';
/** Fetches fresh data; re-renders only when something changed. */
export async function refresh() {
  try {
    const next = await api('state');
    const wasOffline = !app.online;
    app.online = true;
    const signature = JSON.stringify(next);
    if (signature !== lastSignature || wasOffline) {
      lastSignature = signature;
      app.data = next;
      rerender();
    }
  } catch {
    if (app.online || !app.data) { app.online = false; rerender(); }
  }
}

/** Applies a server response locally without waiting for the next poll. */
export function patchData(changes) {
  app.data = { ...app.data, ...changes };
  rerender();
}
