// Leaderboard › Recap: written summary, progression chart and stat cards.
import { html, raw } from '../lib/html.js';
import { fmtToPar, recap, withRanks } from '../scoring.js';
import { gameStandings, winnerLine } from '../shared/rules.js';
import { app, findPlayer, hasHandicaps, rerender, settings, standings, tournament } from '../state.js';
import { standingRow } from './common.js';

const TEAM_COLORS = ['#1c64d6', '#e8590c', '#2b9348', '#15aabf', '#be4bdb', '#74b816', '#1d3fa8', '#e03131', '#5c3d2e', '#f59f00', '#495057', '#0b7285'];

// How each kind of stat value is shown.
const SHOW = {
  hole: (e) => `${fmtToPar(e.value)} · #${e.hole}`,
  round: (e) => `${e.value} (${fmtToPar(e.toPar)})`,
  toPar: (e) => fmtToPar(e.value),
  avg: (e) => e.value.toFixed(2),
  count: (e) => e.value,
};

// Stat cards. Each option: [key in recap(), chip label, title, how to show it].
const STAT_GROUPS = [
  { key: 'holes', eyebrow: 'Hole scores', opts: [['blowup', 'Blowup', 'Biggest Blowup Hole', 'hole'], ['lowest', 'Lowest', 'Lowest Hole Score', 'hole']] },
  { key: 'gross', eyebrow: 'Gross rounds', opts: [['bestGross', 'Best', 'Best Gross Round', 'round'], ['worstGross', 'Worst', 'Worst Gross Round', 'round']] },
  { key: 'net', eyebrow: 'Net rounds', opts: [['bestNet', 'Best', 'Best Net Round', 'round'], ['worstNet', 'Worst', 'Worst Net Round', 'round']] },
  { key: 'putts', eyebrow: 'Putting', opts: [['fewestPutts', 'Fewest', 'Fewest Putts', 'count'], ['mostPutts', 'Most', 'Most Putts', 'count'], ['puttAvgLow', 'Low Avg', 'Lowest Putts Per Hole', 'avg'], ['puttAvgHigh', 'High Avg', 'Highest Putts Per Hole', 'avg']] },
  { key: 'birdies', eyebrow: 'Birdies', opts: [['birdies', 'Birdies', 'Most Birdies', 'count'], ['eagles', 'Eagles', 'Most Eagles', 'count'], ['netBirdies', 'Net', 'Most Net Birdies', 'count']] },
  { key: 'doubles', eyebrow: 'Double bogeys', opts: [['doubles', 'Total', 'Most Double Bogeys or Worse', 'count']] },
  { key: 'streaks', eyebrow: 'Streaks', opts: [['parStreak', 'Par+', 'Longest Par Or Better Streak', 'count'], ['bogeyStreak', 'Bogey+', 'Longest Bogey Or Worse Streak', 'count']] },
  { key: 'fb', eyebrow: 'Gross front & back scores', opts: [['bestFront', 'Best Front', 'Best Gross Front', 'count'], ['worstFront', 'Worst Front', 'Worst Gross Front', 'count'], ['bestBack', 'Best Back', 'Best Gross Back', 'count'], ['worstBack', 'Worst Back', 'Worst Gross Back', 'count']] },
  { key: 'bypar', eyebrow: 'Scoring by par', opts: [['par3', 'Best 3s', 'Best Score On Par 3s', 'toPar'], ['par3w', 'Worst 3s', 'Worst Score On Par 3s', 'toPar'], ['par4', 'Best 4s', 'Best Score On Par 4s', 'toPar'], ['par4w', 'Worst 4s', 'Worst Score On Par 4s', 'toPar'], ['par5', 'Best 5s', 'Best Score On Par 5s', 'toPar'], ['par5w', 'Worst 5s', 'Worst Score On Par 5s', 'toPar']] },
  { key: 'diff', eyebrow: 'Hole difficulty', opts: [['hard', 'Best Hard', 'Best On Hardest Holes (Hcp 1–6)', 'toPar'], ['hardw', 'Worst Hard', 'Worst On Hardest Holes (Hcp 1–6)', 'toPar'], ['easy', 'Best Easy', 'Best On Easiest Holes (Hcp 13–18)', 'toPar'], ['easyw', 'Worst Easy', 'Worst On Easiest Holes (Hcp 13–18)', 'toPar']] },
];

/** A few sentences about how the tournament played out, or null before anyone finishes. */
function story(rc, board) {
  const done = board.filter((r) => r.complete);
  if (!done.length) return null;
  const t = tournament();
  const teamCount = app.data.teams.length;
  const all = board.filter((r) => r.thru);
  const lead = all[0];
  const finished = done.length === teamCount;
  const tied = all.filter((r) => r.posNum === lead.posNum);
  const parts = [];
  if (!finished) parts.push(`${done.length} of ${teamCount} teams are in the clubhouse. ${lead.team.name} leads at ${fmtToPar(lead.toPar)}${lead.complete ? '' : ` through ${lead.thru}`}.`);
  else if (tied.length > 1) parts.push(`${tied.map((r) => r.team.name).join(' and ')} finished tied for the ${t.name} title at ${fmtToPar(lead.toPar)} (${lead.gross}).`);
  else parts.push(`${lead.team.name} won the ${t.name} at ${fmtToPar(lead.toPar)}, a ${lead.gross} at ${t.course.name}.`);
  if (finished && all[1] && all[1].posNum !== lead.posNum) parts.push(`${all[1].team.name} took second at ${fmtToPar(all[1].toPar)}.`);
  if (finished && hasHandicaps()) {
    const net = standings(true).filter((r) => r.thru);
    const netLeaders = net.filter((r) => r.posNum === net[0].posNum);
    parts.push(`On net, ${listNames(netLeaders.map((r) => r.team.name))} ${netLeaders.length > 1 ? 'tied for the win' : 'won'} at ${fmtToPar(net[0].netToPar)}.`);
  }
  for (const ace of rc.aces) parts.push(`${ace.team.name} made a hole-in-one on hole ${ace.hole}!`);
  if (rc.birdies[0]) {
    const top = rc.birdies.filter((e) => e.value === rc.birdies[0].value);
    parts.push(`${listNames(top.map((e) => e.team.name))} made the most birdies (${top[0].value}${top.length > 1 ? ' each' : ''}).`);
  }
  // Eagles that weren't already reported as a hole-in-one (an ace on a par 3 is also an eagle).
  const eagleTeams = rc.eagles
    .map((e) => ({ ...e, value: e.value - rc.aces.filter((a) => a.team.id === e.team.id).length }))
    .filter((e) => e.value > 0);
  if (eagleTeams.length) parts.push(`${listNames(eagleTeams.map((e) => e.team.name))} carded ${eagleTeams.length === 1 && eagleTeams[0].value === 1 ? 'an eagle' : 'eagles'}.`);
  const hardest = rc.holeAvg.filter((h) => h.n).sort((a, b) => b.value - a.value)[0];
  if (hardest) parts.push(`Hole ${hardest.hole} played toughest, averaging ${fmtToPar(+hardest.value.toFixed(2))} to par.`);
  if (rc.blowup[0]) parts.push(`The biggest blowup was ${rc.blowup[0].team.name}'s ${fmtToPar(rc.blowup[0].value)} on hole ${rc.blowup[0].hole}.`);
  for (const g of t.games) {
    const best = gameStandings(g, app.data.games[g.id])[0];
    const p = best && findPlayer(best.playerId);
    if (p) parts.push(winnerLine(g, p.name, best.value, settings().locked));
  }
  return parts.join(' ');
}

/** "A", "A and B", "A, B and C" */
function listNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * Line chart of each team's score to par after each hole PLAYED (so shotgun
 * starts line up: point 5 is every team's fifth hole). Under par plots higher.
 */
function chart(rc) {
  const W = 360, H = 230, L = 32, R = 8, TOP = 10, B = 26;
  const values = rc.progression.flatMap((p) => p.points.filter((v) => v !== null));
  const lim = Math.max(10, Math.ceil(Math.max(5, ...values.map(Math.abs)) / 5) * 5);
  const x = (i) => L + (i * (W - L - R)) / 17;
  const y = (v) => TOP + ((v + lim) * (H - TOP - B)) / (2 * lim);
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score to par after each hole played, by team">`;
  for (const t of ticks) svg += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e3e7e4" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" font-size="10" text-anchor="end" fill="#7b847e">${fmtToPar(t)}</text>`;
  for (let i = 0; i < 18; i++) svg += `<text x="${x(i)}" y="${H - 8}" font-size="9.5" text-anchor="middle" fill="#7b847e">${i + 1}</text>`;
  app.data.teams.forEach((team, ti) => {
    const line = rc.progression.find((p) => p.team.id === team.id);
    if (!line) return;
    const color = TEAM_COLORS[ti % TEAM_COLORS.length];
    let d = '', pen = false, last = null;
    line.points.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
      last = [x(i), y(v)];
    });
    if (d) svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (last) svg += `<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/>`;
  });
  return raw(svg + '</svg>'); // built only from numbers and constants
}

function statCard(rc, group) {
  const pick = app.ui.recapPick[group.key] || group.opts[0][0];
  const [key, , title, show] = group.opts.find((o) => o[0] === pick);
  const list = rc[key] || [];
  const more = app.ui.recapMore[group.key];
  return html`<div class="card card-plain stat-card"><div class="eyebrow">${group.eyebrow}</div>
    ${group.opts.length > 1 && html`<div class="chips scroll">${group.opts.map(([k, label]) => html`
      <button class="chip ${k === pick && 'on'}" data-action="recap-pick" data-group="${group.key}" data-stat="${k}">${label}</button>`)}</div>`}
    <div class="stat-title">${title}</div>
    ${list.length
      ? html`${withRanks(list).slice(0, more ? list.length : 3).map((e) => standingRow(e.rank, html`<b>${e.team.name}</b>`, SHOW[show](e), { place: e.place }))}
        ${list.length > 3 && html`<div class="text-center"><button class="btn btn-outline btn-small" data-action="recap-more" data-group="${group.key}">${more ? 'Show less' : `${list.length - 3} more`}</button></div>`}`
      : html`<p class="stat-empty">Not enough data yet</p>`}
  </div>`;
}

function render() {
  const rc = recap(app.data);
  const summary = story(rc, standings(false));
  const averages = rc.holeAvg.filter((h) => h.n);
  return html`
    <div class="card card-plain"><div class="eyebrow">✦ Tournament recap</div>
      ${summary ? html`<p class="story">${summary}</p>`
        : html`<p class="stat-empty">Once a team finishes its round, the story of the tournament shows up here: the results, the standouts, and how it played out.<br><span class="small">Waiting for the first completed round</span></p>`}
    </div>
    <div class="card card-plain chart"><div class="eyebrow">Scoring progression</div><div class="stat-title">${tournament().format}</div>${chart(rc)}
      <div class="small muted text-center">Holes played (each team from its own starting hole)</div>
      <div class="legend">${app.data.teams.map((t, i) => html`<span><i style="background:${TEAM_COLORS[i % TEAM_COLORS.length]}"></i>${t.name}</span>`)}</div></div>
    ${STAT_GROUPS.map((g) => statCard(rc, g))}
    <div class="card card-plain"><div class="eyebrow">Hole averages</div>
      ${averages.length
        ? html`<div class="sc-table"><table><tr class="hole"><th>Hole</th><th>Par</th><th>Hcp</th><th>Avg</th><th>Teams</th></tr>
            ${averages.map((h) => html`<tr><td>${h.hole}</td><td>${h.par}</td><td>${h.si}</td><td class="${h.value < 0 && 'under'}">${fmtToPar(+h.value.toFixed(2))}</td><td>${h.n}</td></tr>`)}</table></div>`
        : html`<p class="stat-empty">Not enough data yet</p>`}
    </div>`;
}

export default {
  render,
  actions: {
    'recap-pick': ({ group, stat }) => { app.ui.recapPick[group] = stat; rerender(); },
    'recap-more': ({ group }) => { app.ui.recapMore[group] = !app.ui.recapMore[group]; rerender(); },
  },
};
