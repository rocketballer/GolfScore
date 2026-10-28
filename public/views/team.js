// One team's scorecard: summary, front nine, back nine.
import { html } from '../lib/html.js';
import { ago, avatar } from '../lib/util.js';
import { teamRound } from '../scoring.js';
import { emptyCard } from '../shared/rules.js';
import { app, canScore, findTeam, holes, isOrganizer, settings, standings } from '../state.js';
import { scoreMark, toPar, underClass } from './common.js';

function nine(round, from, to, label, scorable) {
  const tee = settings().tee;
  const rows = round.rows.slice(from, to);
  const meta = holes().slice(from, to);
  const sum = (f) => rows.reduce((s, x) => s + (f(x) ?? 0), 0);
  const started = rows.some((x) => x.gross !== null);
  const partial = started && rows.some((x) => x.gross === null);
  const cell = (x) => html`<td><button class="cell" data-action="score-cell" data-team="${round.team.id}" data-hole="${x.n}" ${!scorable && x.gross === null && 'disabled'}>
    ${x.gross !== null ? scoreMark(x.gross, x.par) : scorable && html`<span class="plus">+</span>`}</button></td>`;
  return html`<div class="card"><div class="sc-table"><table>
    <tr class="hole"><th>Hole</th>${rows.map((x) => html`<th>${x.n}</th>`)}<th>${label}</th></tr>
    <tr><td>Yds</td>${meta.map((h) => html`<td>${h.yards[tee]}</td>`)}<td class="out">${meta.reduce((s, h) => s + h.yards[tee], 0)}</td></tr>
    <tr><td>Hcp</td>${rows.map((x) => html`<td>${x.si}</td>`)}<td class="out"></td></tr>
    <tr><td>Par</td>${rows.map((x) => html`<td>${x.par}</td>`)}<td class="out">${sum((x) => x.par)}</td></tr>
    <tr class="scores"><td>Score</td>${rows.map(cell)}<td class="out">${started && sum((x) => x.gross)}${partial && '*'}</td></tr>
    ${round.hcp !== null && html`<tr><td>Net</td>${rows.map((x) => html`<td>${x.net}</td>`)}<td class="out">${started && sum((x) => x.net)}</td></tr>`}
    ${rows.some((x) => x.putts !== null) && html`<tr><td>Putts</td>${rows.map((x) => html`<td>${x.putts}</td>`)}<td class="out">${sum((x) => x.putts)}</td></tr>`}
  </table></div></div>`;
}

function render(route) {
  const team = findTeam(route.id);
  if (!team) return html`<p class="empty">That team no longer exists. <a href="#leaderboard">Back to the leaderboard</a></p>`;
  const card = app.data.scores[team.id] || emptyCard();
  const round = teamRound(team, card, holes(), settings());
  const pos = standings().find((x) => x.team.id === team.id)?.pos || '-';
  const scorable = canScore(team.id);
  return html`
    <div class="card card-plain stack">
      <div class="row spread"><div><div class="eyebrow">Round 1 · ${settings().tee} tees</div><div class="team-title">${team.name}</div></div>
        ${scorable && html`<button class="btn btn-primary" data-action="score-start" data-team="${team.id}">${round.thru ? 'Continue scoring' : 'Start scoring'}</button>`}</div>
      <div class="sc-summary">
        <div><div class="v num">${pos}</div><div class="k">Pos</div></div>
        <div><div class="v num ${underClass(round)}">${toPar(round)}</div><div class="k">To par</div></div>
        <div><div class="v num">${round.thru ? round.gross : '-'}</div><div class="k">Gross</div></div>
        <div><div class="v num">${round.complete ? 'F' : round.thru}</div><div class="k">Thru</div></div>
      </div>
      <div class="row small muted">${team.players.map((p) => html`<span class="row gap-6">${avatar(p.name)}<i>${p.name}</i></span>`)}</div>
      ${round.hcp !== null && html`<div class="small muted">Team handicap ${round.hcp} · Net ${toPar(round, true)}</div>`}
      ${round.lastUpdate && html`<div class="small muted">Last update ${ago(round.lastUpdate)}${card.updatedBy && ` by ${card.updatedBy}`}</div>`}
    </div>
    ${nine(round, 0, 9, 'Out', scorable)}
    ${nine(round, 9, 18, 'In', scorable)}
    ${round.complete && html`<div class="card card-plain row spread"><b>Total</b><span class="num"><b>${round.gross}</b> (${toPar(round)})${round.putts !== null && ` · ${round.putts} putts`}</span></div>`}
    ${!scorable && !isOrganizer() && html`<p class="small muted text-center">Only ${team.name} players and the organizer can enter scores for this team. <button class="link-btn" data-action="who">Change who you are</button></p>`}`;
}

export default { render };
