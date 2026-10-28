// Bottom sheets / dialogs, plus the "who are you?" flow.
import { html, raw } from '../lib/html.js';
import { $, avatar, toast } from '../lib/util.js';
import { app, findPlayer, isOrganizer, myTeam, refresh, rerender, setMe, tournament } from '../state.js';
import { openScore } from './score-entry.js';

export const isSheetOpen = () => !$('#sheet').hidden;

export function openSheet(content, { center = false } = {}) {
  // An open sheet gets its own history entry, so the phone's Back button closes it.
  if (!isSheetOpen()) history.pushState({ sheet: true }, '');
  const s = $('#sheet');
  s.innerHTML = String(content);
  s.classList.toggle('center', center);
  s.hidden = false;
  $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}

let goToAfterBack = null;

/**
 * Closes the sheet. Polling pauses while a sheet is open, so catch up afterwards.
 * `goTo` (a "#screen" hash) opens another screen once the sheet's history entry is gone.
 */
export function closeSheet({ quiet = false, goTo = null } = {}) {
  if (!isSheetOpen()) { if (goTo) { location.hash = goTo; rerender(); } return; }
  if (history.state?.sheet) { goToAfterBack = goTo; history.back(); } // drop the sheet's history entry
  else if (goTo) { location.hash = goTo; rerender(); }
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  document.body.style.overflow = '';
  if (!quiet) refresh();
}

const PLAYER_ICON = raw('<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-3 13.3V17h6v-1.7A7 7 0 0 0 12 2zm-2 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-2 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM9 19h6v2H9z"/></svg>');
const EYE_ICON = raw('<svg viewBox="0 0 24 24"><path d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>');

export function whoSheet() {
  openSheet(html`<h2 class="who-q">Are you playing in ${tournament().name}, or just spectating?</h2>
    <button class="choice" data-action="iam-player">${PLAYER_ICON}<span><div class="t">I'm playing</div><div class="d">I'm a participant in the tournament</div></span></button>
    <button class="choice" data-action="iam-spectator">${EYE_ICON}<span><div class="t">I'm spectating</div><div class="d">Just follow along with the leaderboard</div></span></button>`, { center: true });
}

function pickList(query) {
  const q = query.toLowerCase();
  const groups = app.data.teams.map((t) => {
    const ps = t.players.filter((p) => !q || p.name.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
    return ps.length && html`<div class="pick-team">${t.name}</div>${ps.map((p) => html`
      <button class="pick ${app.me?.playerId === p.id && 'on'}" data-action="pick-player" data-player="${p.id}">${avatar(p.name)}${p.name}</button>`)}`;
  }).filter(Boolean);
  return groups.length ? groups : html`<p class="empty">No players match.</p>`;
}

function pickPlayerSheet() {
  openSheet(html`<h2>Who are you?</h2><p class="sheet-sub">Pick your name. You'll be able to enter scores for your team.</p>
    <label class="search pick-search"><input type="search" placeholder="Search players" autocomplete="off" data-action="pick-search"></label>
    <div class="pick-list" id="pick-list">${pickList('')}</div>
    <button class="btn btn-block sheet-cancel" data-action="sheet-close">Cancel</button>`);
}

function pickTeamSheet() {
  openSheet(html`<h2>Enter scores</h2>
    <p class="sheet-sub">${isOrganizer() ? 'Pick a team to score.' : 'Pick your name first so we know which team you score for.'}</p>
    ${isOrganizer()
      ? html`<div class="pick-list">${app.data.teams.map((t) => html`
          <button class="pick pick-plain" data-action="score-start" data-team="${t.id}"><b>${t.name}</b>&nbsp;<span class="small muted">${t.players.map((p) => p.name).join(', ')}</span></button>`)}</div>`
      : html`<button class="btn btn-primary btn-block" data-action="iam-player">Pick my name</button>`}
    <button class="btn btn-block sheet-cancel" data-action="sheet-close">Cancel</button>`);
}

/** Opens the right next step for someone who wants to enter scores. */
export function startScoring() {
  if (myTeam()) openScore(myTeam().id);
  else pickTeamSheet();
}

export const actions = {
  'who': () => whoSheet(),
  'iam-player': () => pickPlayerSheet(),
  'iam-spectator': () => { setMe({ role: 'spectator' }); closeSheet(); rerender(); },
  'pick-player': ({ player }) => {
    setMe({ role: 'player', playerId: player });
    closeSheet();
    toast(`Welcome, ${findPlayer(player)?.name}`);
    rerender();
  },
  'pick-search': (_, el) => { $('#pick-list').innerHTML = String(pickList(el.value)); },
  'sheet-close': () => closeSheet(),
  'enter-scores': () => startScoring(),
};

/** Back button (popstate): finishes a close-then-navigate, or closes an open sheet instead of leaving the screen. */
export function onHistoryBack() {
  if (goToAfterBack) { const hash = goToAfterBack; goToAfterBack = null; location.hash = hash; rerender(); return; }
  if (!isSheetOpen() || history.state?.sheet) return;
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  document.body.style.overflow = '';
  refresh();
}
