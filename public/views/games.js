// Leaderboard › Games: hole competitions. Everything type-specific comes from GAME_TYPES.
import { html } from '../lib/html.js';
import { avatar, toast } from '../lib/util.js';
import { gameLabel, gameStandings, gameType, gameValueFromFields } from '../shared/rules.js';
import { allPlayers, api, app, findPlayer, holes, isOrganizer, myPlayer, patchData, scoringOpen, settings, tournament } from '../state.js';
import { standingRow } from './common.js';

function entryForm(game) {
  const type = gameType(game);
  const me = myPlayer();
  if (!scoringOpen()) return html`<p class="small muted text-center">Scoring is closed.</p>`;
  if (!me && !isOrganizer()) {
    return html`<button class="btn btn-outline self-center" data-action="who">Pick your name to enter a distance</button>`;
  }
  const mine = me && (app.data.games[game.id] || []).find((e) => e.playerId === me.id);
  return html`<form class="game-entry" data-action="game-save" data-game="${game.id}">
    ${isOrganizer()
      ? html`<select class="input" name="player" aria-label="Player">${allPlayers().map((p) => html`<option value="${p.id}" ${me?.id === p.id && 'selected'}>${p.name} · ${p.team.name}</option>`)}</select>`
      : html`<div class="small">Entering for <b>${me.name}</b>${mine && ` · current: ${type.format(mine.value)}`}</div>`}
    <div class="row">${type.fields.map((f) => html`<input class="input grow" name="${f.name}" type="number" inputmode="numeric" min="0" max="${f.max}" placeholder="${f.label}" aria-label="${f.label}">`)}
      <button class="btn btn-primary" type="submit">Save</button></div>
    ${mine && !isOrganizer() && html`<button class="link-btn" type="button" data-action="game-remove" data-game="${game.id}" data-player="${me.id}">Remove my distance</button>`}
  </form>`;
}

function gameCard(game) {
  const type = gameType(game);
  const h = holes()[game.hole - 1];
  const entries = gameStandings(game, app.data.games[game.id]);
  return html`<div class="card card-plain stack">
    <div class="game-title">${gameLabel(game)}</div>
    <div class="small muted text-center">Par ${h.par} · ${h.yards[settings().tee]} yds · ${type.rule}</div>
    ${entries.length
      ? html`<div>${entries.map((e, i) => {
          const p = findPlayer(e.playerId);
          return standingRow(i + 1, html`${avatar(p?.name || '?')} <i>${p?.name || 'Removed player'}</i> <span class="small muted">${p?.team.name}</span>`,
            type.format(e.value),
            { extra: isOrganizer() && html`<button class="x-btn" title="Remove" data-action="game-remove" data-game="${game.id}" data-player="${e.playerId}">×</button>` });
        })}</div>`
      : html`<p class="stat-empty">Results will be displayed when users enter their distances</p>`}
    ${entryForm(game)}
  </div>`;
}

async function saveEntry(gameId, playerId, value, done) {
  try {
    const out = await api('game', { gameId, playerId, value, me: myPlayer()?.id });
    patchData({ games: out.games });
    toast(done);
  } catch (e) { toast(e.message); }
}

export default {
  render: () => html`<div class="chips"><span class="chip on">Hole competitions</span></div>${tournament().games.map(gameCard)}`,
  whileTyping: () => {}, // keep half-typed distances
  actions: {
    'game-save': (ds, form) => {
      const game = tournament().games.find((g) => g.id === ds.game);
      const values = Object.fromEntries(gameType(game).fields.map((f) => [f.name, form.elements[f.name].value]));
      const value = gameValueFromFields(game, values);
      if (value === null) return toast(`Enter ${gameType(game).fields.map((f) => f.label.toLowerCase()).join(' and ')}`);
      const playerId = isOrganizer() ? form.elements.player.value : myPlayer()?.id;
      saveEntry(game.id, playerId, value, 'Distance saved');
    },
    'game-remove': ({ game, player }) => saveEntry(game, player, null, 'Distance removed'),
  },
};
