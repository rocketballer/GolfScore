// Leaderboard › Scramble (overall list or hole-by-hole grid), plus the Games and Recap sections.
import { html } from '../lib/html.js';
import { avatar, chevron, local } from '../lib/util.js';
import { app, canScore, hasHandicaps, holes, rerender, settings, standings, useNet } from '../state.js';
import { scoreMark, thruText, toPar, underClass } from './common.js';
import games from './games.js';
import recap from './recap.js';

const SECTIONS = [['scramble', 'Scramble'], ['games', 'Games'], ['recap', 'Recap']];

function overall(rows, net) {
  return html`<div class="lb-head"><span>Po</span><span>Teams</span><span>R1</span><span>Tot</span></div>
  <div class="stack tight">${rows.map((r) => {
    const open = app.ui.open.has(r.team.id);
    const leader = r.thru && r.posNum === rows[0].posNum;
    return html`<div class="lb-team ${open && 'open'} ${leader && 'leader'}">
      <button class="lb-row" data-action="lb-toggle" data-team="${r.team.id}" aria-expanded="${open}">
        <span class="pos num">${r.pos}</span>
        <span class="name"><span>${r.team.name}</span>${chevron}<span class="sub">${thruText(r)}</span></span>
        <span class="num">${r.thru ? (net ? r.net : r.gross) : '-'}</span>
        <span class="score num ${underClass(r, net)}">${toPar(r, net)}</span>
      </button>
      ${open && html`<div class="lb-players">${r.team.players.map((p) => html`
          <div class="lb-player">${avatar(p.name)}<span>${p.name}${p.hcp != null && html` <span class="muted small">(${p.hcp})</span>`}</span></div>`)}</div>
        <div class="lb-actions"><a class="btn btn-outline" href="#team-${r.team.id}">Scorecard</a>
          ${r.hcp !== null && html`<span class="small muted self-center">Team handicap ${r.hcp}</span>`}</div>`}
    </div>`;
  })}</div>`;
}

function grid(rows, net) {
  const hs = holes();
  const cell = (r, x) => {
    const inner = x.gross !== null ? scoreMark(x.gross, x.par)
      : canScore(r.team.id) ? html`<span class="plus">+</span>` : html`<span class="muted">·</span>`;
    return html`<td><button class="cell" data-action="score-cell" data-team="${r.team.id}" data-hole="${x.n}"
      aria-label="${r.team.name} hole ${x.n}, ${x.gross ?? 'no score'}">${inner}</button></td>`;
  };
  return html`<div class="grid-wrap"><table class="grid"><thead>
      <tr><th class="sticky">Po · Teams</th><th>Tot</th>${hs.map((h) => html`<th>${h.n}</th>`)}</tr>
      <tr class="par"><th class="sticky muted">Par</th><th class="muted">${hs.reduce((s, h) => s + h.par, 0)}</th>${hs.map((h) => html`<th class="muted">${h.par}</th>`)}</tr>
    </thead><tbody>${rows.map((r) => html`<tr>
      <td class="sticky"><a class="plain" href="#team-${r.team.id}"><span class="muted small">${r.pos}</span> <b>${r.team.name}</b></a></td>
      <td class="tot ${underClass(r, net)}">${toPar(r, net)}</td>${r.rows.map((x) => cell(r, x))}</tr>`)}</tbody></table></div>
    <p class="small muted">Tap a <span class="green">+</span> on your team's row to enter a score. Swipe sideways for the back nine.</p>`;
}

function scramble() {
  const net = useNet();
  const rows = standings(net);
  const chip = (action, attr, value, on, label) => html`<button class="chip ${on && 'on'}" data-action="${action}" data-${attr}="${value}">${label}</button>`;
  return html`<div class="row spread"><div class="chips">
      ${chip('lb-mode', 'mode', 'overall', app.ui.lbMode === 'overall', 'Overall')}
      ${chip('lb-mode', 'mode', 'round', app.ui.lbMode === 'round', 'Round 1')}</div>
      ${hasHandicaps() && html`<div class="chips">${chip('lb-net', 'net', '0', !net, 'Gross')}${chip('lb-net', 'net', '1', net, 'Net')}</div>`}
    </div>
    <div class="small muted"><span class="live-dot"></span>${app.online ? 'Live · updates every few seconds' : 'Offline · showing last scores'}${settings().locked && ' · Scoring closed'}</div>
    ${app.ui.lbMode === 'round' ? grid(rows, net) : overall(rows, net)}`;
}

function render() {
  const s = app.ui.lbSection;
  const body = s === 'games' ? games.render() : s === 'recap' ? recap.render() : scramble();
  return html`<div class="chips">${SECTIONS.map(([k, label]) => html`<button class="chip ${s === k && 'on'}" data-action="lb-section" data-section="${k}">${label}</button>`)}</div>${body}`;
}

export default {
  render,
  whileTyping: games.whileTyping,
  actions: {
    ...games.actions,
    ...recap.actions,
    'lb-section': ({ section }) => { app.ui.lbSection = section; rerender(); },
    'lb-mode': ({ mode }) => { app.ui.lbMode = mode; local.set('lbMode', mode); rerender(); },
    'lb-net': ({ net }) => { app.ui.net = net === '1'; local.set('net', app.ui.net); rerender(); },
    'lb-toggle': ({ team }) => {
      const open = app.ui.open;
      if (open.has(team)) open.delete(team); else open.add(team);
      local.set('open', [...open]);
      rerender();
    },
  },
};
