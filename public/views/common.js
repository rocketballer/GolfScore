// Display pieces used by more than one screen.
import { html } from '../lib/html.js';
import { fmtToPar } from '../scoring.js';

/** A team round's score to par ("-3", "E") or "-" before the first hole. */
export const toPar = (round, net = false) => (round.thru ? fmtToPar(net ? round.netToPar : round.toPar) : '-');

/** "under" (red) when the round is under par. */
export const underClass = (round, net = false) => (round.thru && (net ? round.netToPar : round.toPar) < 0 ? 'under' : '');

/** "", "thru 9" or "F". */
export const thruText = (round) => (!round.thru ? '' : round.complete ? 'F' : `thru ${round.thru}`);

const markClass = (rel) => (rel <= -2 ? 'eagle' : rel === -1 ? 'birdie' : rel === 1 ? 'bogey' : rel >= 2 ? 'double' : '');
/** A hole score drawn golf-style: circles under par, squares over. */
export const scoreMark = (gross, par) => html`<span class="mark ${markClass(gross - par)}">${gross}</span>`;

/** The About / Players chips at the top of the Home tab. */
export const homeChips = (active) => html`<div class="chips">
  <a class="chip ${active === 'about' && 'on'}" href="#home">About</a>
  <a class="chip ${active === 'players' && 'on'}" href="#players">Players</a></div>`;

/** A ranked row: badge ("1", "T2"), label, value. `place` (a number) picks the medal color. */
export const standingRow = (rank, label, value, { place = rank, extra = '' } = {}) => html`<div class="standing">
  <span class="rank r${place}">${rank}</span><span class="grow">${label}</span><span class="val num">${value}</span>${extra}</div>`;
