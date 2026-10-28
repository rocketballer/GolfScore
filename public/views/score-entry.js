// The hole-by-hole score entry sheet.
import { html } from '../lib/html.js';
import { confirmTap, toast } from '../lib/util.js';
import { fmtToPar, playOrder } from '../scoring.js';
import { SCORE_LIMITS, emptyCard, gameLabel } from '../shared/rules.js';
import { app, api, canScore, findTeam, holes, myPlayer, rerender, scoringOpen, settings, tournament } from '../state.js';
import { closeSheet, isSheetOpen, openSheet } from './sheets.js';

const SCORE_NAMES = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };
const scoreName = (strokes, par) => (strokes === 1 ? 'Hole in one' : SCORE_NAMES[strokes - par] || fmtToPar(strokes - par));

// Taps on Save within this long after the sheet moves to a new hole are ignored,
// so a double-tap can't save the next hole too.
const TAP_GUARD_MS = 600;

let entry = null; // { teamId, hole, strokes, putts, existing, saving, readyAt }

const cardFor = (teamId) => app.data.scores[teamId] || emptyCard();
const orderFor = (teamId) => playOrder(app.data.teeTimes, teamId, holes().length);

/** The first unscored hole after `hole` in play order (wrapping around), or null if every hole is scored. */
function nextOpenHole(teamId, hole) {
  const order = orderFor(teamId);
  const card = cardFor(teamId);
  const i = order.indexOf(hole);
  const rest = [...order.slice(i + 1), ...order.slice(0, i)];
  return rest.find((n) => card.holes[n] == null) ?? null;
}

/** Opens a hole, or the team's next unscored hole when `hole` is omitted. */
export function openScore(teamId, hole) {
  const card = cardFor(teamId);
  const order = orderFor(teamId);
  hole ||= order.find((n) => card.holes[n] == null) || order[0];
  entry = {
    teamId, hole,
    strokes: card.holes[hole] ?? holes()[hole - 1].par,
    putts: card.putts?.[hole] ?? null,
    existing: card.holes[hole] != null,
    saving: false,
    readyAt: Date.now() + TAP_GUARD_MS,
  };
  draw();
}

function draw() {
  const team = findTeam(entry.teamId);
  const h = holes()[entry.hole - 1];
  const card = cardFor(entry.teamId);
  const quick = [-2, -1, 0, 1, 2].map((d) => h.par + d).filter((v) => v >= SCORE_LIMITS.strokes.min);
  const game = tournament().games.find((g) => g.hole === h.n);
  const hasNext = nextOpenHole(entry.teamId, entry.hole) !== null;
  openSheet(html`
    <div class="hole-info"><div><div class="eyebrow">${team.name}</div><div class="h">Hole ${h.n}</div></div>
      <div class="small muted right">Par ${h.par} · ${h.yards[settings().tee]} yds<br>Hcp ${h.si}</div></div>
    ${entry.existing && html`<div class="small muted">Saved score: <b>${card.holes[h.n]}</b>. Change it below, or clear it.</div>`}
    <div class="stepper"><button data-action="score-step" data-by="-1" aria-label="One fewer stroke">−</button>
      <div><div class="big num">${entry.strokes}</div><div class="rel">${scoreName(entry.strokes, h.par)}</div></div>
      <button data-action="score-step" data-by="1" aria-label="One more stroke">+</button></div>
    <div class="quick">${quick.map((v) => html`<button class="${v === entry.strokes && 'on'}" data-action="score-set" data-strokes="${v}"><b>${v}</b>${scoreName(v, h.par)}</button>`)}</div>
    <div class="putts"><span class="small"><b>Putts</b> <span class="muted">(optional)</span></span>
      <div class="pbtns">${[0, 1, 2, 3, 4].map((p) => html`<button class="${entry.putts === p && 'on'}" data-action="score-putts" data-putts="${p}">${p}</button>`)}</div></div>
    ${game && html`<div class="banner banner-gap">${gameLabel(game)} is on this hole. <button class="link-btn" data-action="score-to-games">Save score &amp; enter distances</button></div>`}
    <div class="sheet-actions">
      ${entry.existing ? html`<button class="btn btn-danger" data-action="score-clear">Clear hole</button>` : html`<button class="btn" data-action="sheet-close">Cancel</button>`}
      <button class="btn btn-primary" data-action="score-save" ${entry.saving && 'disabled'}>${entry.saving ? 'Saving…' : hasNext ? 'Save & next' : 'Save'}</button></div>
    <div class="hole-dots">${holes().map((x) => html`<button class="${x.n === entry.hole ? 'cur' : card.holes[x.n] != null && 'done'}" data-action="score-goto" data-hole="${x.n}" aria-label="Hole ${x.n}">${x.n}</button>`)}</div>
    <div class="text-center"><a class="link-btn" href="#team-${team.id}">View scorecard</a></div>`);
}

/**
 * Saves (or clears) the open hole. The scorecard only changes once the server
 * confirms, so a failed save never looks saved. On failure the sheet stays on
 * this hole with the typed score, ready to try again.
 */
async function save(clear) {
  if (entry.saving || Date.now() < entry.readyAt) return false;
  const { teamId, hole, strokes, putts } = entry;
  entry.saving = true;
  draw();
  try {
    const out = await api('score', { teamId, hole, strokes: clear ? null : strokes, putts: clear ? null : putts, me: myPlayer()?.id });
    app.data = { ...app.data, scores: { ...app.data.scores, [teamId]: out.card } };
    entry.saving = false;
    rerender();
    return true;
  } catch (e) {
    entry.saving = false;
    if (isSheetOpen()) draw();
    toast(e.message);
    return false;
  }
}

/** After a save: go to the next unscored hole, or finish on the scorecard. */
function advance() {
  const { teamId, hole } = entry;
  const next = nextOpenHole(teamId, hole);
  if (next) { toast(`Hole ${hole} saved`); openScore(teamId, next); return; }
  toast('Round complete. Nice playing!');
  closeSheet({ goTo: '#team-' + teamId });
}

const clamp = (n) => Math.min(SCORE_LIMITS.strokes.max, Math.max(SCORE_LIMITS.strokes.min, n));

export const actions = {
  /** A tap on a hole in the grid or on a scorecard. */
  'score-cell': ({ team, hole }) => {
    if (canScore(team)) return openScore(team, Number(hole));
    if (!scoringOpen()) return toast('Scoring is closed.');
    const name = findTeam(team)?.name;
    toast(myPlayer() ? `Only ${name} players can enter ${name}'s scores.` : 'Pick your name (Who are you?) to enter scores.');
    location.hash = '#team-' + team;
  },
  'score-start': ({ team }) => openScore(team),
  'score-step': ({ by }) => { entry.strokes = clamp(entry.strokes + Number(by)); draw(); },
  'score-set': ({ strokes }) => { entry.strokes = Number(strokes); draw(); },
  'score-putts': ({ putts }) => { const p = Number(putts); entry.putts = entry.putts === p ? null : p; draw(); },
  'score-goto': ({ hole }) => openScore(entry.teamId, Number(hole)),
  'score-to-games': async () => {
    if (!(await save(false))) return;
    toast(`Hole ${entry.hole} saved`);
    app.ui.lbSection = 'games';
    closeSheet({ goTo: '#leaderboard' });
  },
  'score-clear': (_, el) => confirmTap(el, async () => {
    const { teamId, hole } = entry;
    if (await save(true)) { toast(`Hole ${hole} cleared`); openScore(teamId, hole); }
  }),
  'score-save': async () => { if (await save(false)) advance(); },
};
