// Home › Players: searchable, sortable list of everyone in the event.
import { html, raw } from '../lib/html.js';
import { $, avatar } from '../lib/util.js';
import { allPlayers, app, rerender } from '../state.js';
import { homeChips } from './common.js';

const SEARCH_ICON = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 9.5 16a6.5 6.5 0 0 0 4.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>');

const COMPARE = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  team: (a, b) => a.team.name.localeCompare(b.team.name, undefined, { numeric: true }),
  hcp: (a, b) => (a.hcp ?? 999) - (b.hcp ?? 999),
};

function list() {
  const { playerQuery, playerSort, playerDir } = app.ui;
  const q = playerQuery.toLowerCase();
  const rows = allPlayers()
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.name.toLowerCase().includes(q))
    .sort((a, b) => COMPARE[playerSort](a, b) * playerDir || COMPARE.name(a, b));
  if (!rows.length) return html`<p class="empty">No players match that search.</p>`;
  return rows.map((p) => html`<div class="prow"><span class="who">${avatar(p.name)}<span>${p.name}</span></span>
    <span class="small">${p.team.name}</span><span class="small ${p.hcp == null && 'muted'}">${p.hcp == null ? 'Not set' : p.hcp}</span></div>`);
}

function render() {
  const arrow = (key) => (app.ui.playerSort === key ? (app.ui.playerDir > 0 ? ' ▾' : ' ▴') : '');
  const sortBtn = (key, label) => html`<button class="sort-btn" data-action="player-sort" data-key="${key}">${label}${arrow(key)}</button>`;
  return html`${homeChips('players')}
    <label class="search">${SEARCH_ICON}<input type="search" placeholder="Search players" value="${app.ui.playerQuery}" autocomplete="off" data-action="player-search"></label>
    <div><b>Total players: ${allPlayers().length}</b></div>
    <div class="plist">
      <div class="plist-head">${sortBtn('name', 'Name')}${sortBtn('team', 'Team')}${sortBtn('hcp', 'Handicap')}</div>
      <div class="plist" id="player-list">${list()}</div>
    </div>`;
}

const redrawList = () => { $('#player-list').innerHTML = String(list()); };

export default {
  render,
  whileTyping: redrawList,
  actions: {
    'player-search': (_, el) => { app.ui.playerQuery = el.value; redrawList(); },
    'player-sort': ({ key }) => {
      if (app.ui.playerSort === key) app.ui.playerDir *= -1;
      else Object.assign(app.ui, { playerSort: key, playerDir: 1 });
      rerender();
    },
  },
};
