// The hole-by-hole score entry sheet.
import { html } from '../lib/html.js';
import { toast } from '../lib/util.js';
import { fmtToPar } from '../scoring.js';
import { SCORE_LIMITS, emptyCard, gameLabel } from '../shared/rules.js';
import { app, api, canScore, findTeam, holes, isOrganizer, myPlayer, refresh, rerender, scoringOpen, settings, tournament } from '../state.js';
import { closeSheet, openSheet, startScoring } from './sheets.js';

const SCORE_NAMES = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };

let entry = null; // { teamId, hole, strokes, putts, existing }

const cardFor = (teamId) => app.data.scores[teamId] || emptyCard();

/** Holes in the order this team plays them (shotgun starts begin mid-course). */
function playOrder(teamId) {
  const start = app.data.teeTimes.find((g) => g.teamIds.includes(teamId))?.startHole || 1;
  return Array.from({ length: 18 }, (_, i) => ((start - 1 + i) % 18) + 1);
}

/** Opens a hole, or the team's next unscored hole when `hole` is omitted. */
export function openScore(teamId, hole) {
  const card = cardFor(teamId);
  hole ||= playOrder(teamId).find((n) => card.holes[n] == null) || playOrder(teamId)[0];
  entry = {
    teamId, hole,
    strokes: card.holes[hole] ?? holes()[hole - 1].par,
    putts: card.putts?.[hole] ?? null,
    existing: card.holes[hole] != null,
  };
  draw();
}

function draw() {
  const team = findTeam(entry.teamId);
  const h = holes()[entry.hole - 1];
  const card = cardFor(entry.teamId);
  const quick = [-2, -1, 0, 1, 2].map((d) => h.par + d).filter((v) => v >= SCORE_LIMITS.strokes.min);
  const game = tournament().games.find((g) => g.hole === h.n);
  const isLast = entry.hole === playOrder(entry.teamId).at(-1);
  openSheet(html`
    <div class="hole-info"><div><div class="eyebrow">${team.name}</div><div class="h">Hole ${h.n}</div></div>
      <div class="small muted right">Par ${h.par} · ${h.yards[settings().tee]} yds<br>Hcp ${h.si}</div></div>
    <div class="stepper"><button data-action="score-step" data-by="-1" aria-label="One fewer stroke">−</button>
      <div><div class="big num">${entry.strokes}</div><div class="rel">${SCORE_NAMES[entry.strokes - h.par] || fmtToPar(entry.strokes - h.par)}</div></div>
      <button data-action="score-step" data-by="1" aria-label="One more stroke">+</button></div>
    <div class="quick">${quick.map((v) => html`<button class="${v === entry.strokes && 'on'}" data-action="score-set" data-strokes="${v}"><b>${v}</b>${SCORE_NAMES[v - h.par]}</button>`)}</div>
    <div class="putts"><span class="small"><b>Putts</b> <span class="muted">(optional)</span></span>
      <div class="pbtns">${[0, 1, 2, 3].map((p) => html`<button class="${entry.putts === p && 'on'}" data-action="score-putts" data-putts="${p}">${p}${p === 3 && '+'}</button>`)}</div></div>
    ${game && html`<div class="banner banner-gap">${gameLabel(game)} is on this hole. <a href="#leaderboard" data-action="score-to-games">Enter distances in Games</a></div>`}
    <div class="sheet-actions">
      ${entry.existing ? html`<button class="btn btn-danger" data-action="score-clear">Clear</button>` : html`<button class="btn" data-action="sheet-close">Cancel</button>`}
      <button class="btn btn-primary" data-action="score-save">Save${!isLast && ' & next'}</button></div>
    <div class="hole-dots">${holes().map((x) => html`<button class="${x.n === entry.hole ? 'cur' : card.holes[x.n] != null && 'done'}" data-action="score-goto" data-hole="${x.n}" aria-label="Hole ${x.n}">${x.n}</button>`)}</div>
    <div class="text-center"><a class="link-btn" href="#team-${team.id}">View scorecard</a></div>`);
}

/** Saves (or clears) the open hole. Shows the change at once, then confirms with the server. */
async function save(clear) {
  const { teamId, hole, strokes, putts } = entry;
  const card = structuredClone(cardFor(teamId));
  if (clear) { delete card.holes[hole]; delete card.putts[hole]; }
  else { card.holes[hole] = strokes; if (putts === null) delete card.putts[hole]; else card.putts[hole] = putts; }
  app.data = { ...app.data, scores: { ...app.data.scores, [teamId]: card } };
  rerender();
  try {
    const by = myPlayer()?.name || (isOrganizer() ? 'Organizer' : '');
    const out = await api('score', { teamId, hole, strokes: clear ? null : strokes, putts: clear ? null : putts, by });
    app.data = { ...app.data, scores: { ...app.data.scores, [teamId]: out.card } };
    return true;
  } catch (e) {
    toast(e.message || 'Score not saved. Check your connection and try again.');
    refresh();
    return false;
  }
}

const clamp = (n) => Math.min(SCORE_LIMITS.strokes.max, Math.max(SCORE_LIMITS.strokes.min, n));

export const actions = {
  /** A tap on a hole in the grid or on a scorecard. */
  'score-cell': ({ team, hole }) => {
    if (canScore(team)) return openScore(team, Number(hole));
    if (!scoringOpen()) return toast('Scoring is closed.');
    if (!myPlayer()) return startScoring();
    location.hash = '#team-' + team;
  },
  'score-start': ({ team }) => openScore(team),
  'score-step': ({ by }) => { entry.strokes = clamp(entry.strokes + Number(by)); draw(); },
  'score-set': ({ strokes }) => { entry.strokes = Number(strokes); draw(); },
  'score-putts': ({ putts }) => { const p = Number(putts); entry.putts = entry.putts === p ? null : p; draw(); },
  'score-goto': ({ hole }) => openScore(entry.teamId, Number(hole)),
  'score-to-games': () => { app.ui.lbSection = 'games'; closeSheet(); },
  'score-clear': async (_, el) => {
    el.disabled = true;
    if (await save(true)) openScore(entry.teamId, entry.hole); else el.disabled = false;
  },
  'score-save': async (_, el) => {
    el.disabled = true;
    if (!(await save(false))) { el.disabled = false; return; }
    const order = playOrder(entry.teamId);
    const next = order[order.indexOf(entry.hole) + 1];
    if (next) { toast(`Hole ${entry.hole} saved`); openScore(entry.teamId, next); }
    else { toast('Round saved. Nice playing!'); closeSheet(); location.hash = '#team-' + entry.teamId; }
  },
};
