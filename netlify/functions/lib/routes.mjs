// Every API action, keyed "METHOD path". `access` is checked before `run` is
// called, so an organizer action can't be reached without the PIN no matter
// where it sits in this list.
//
// run({ body, repo, organizer }) returns the JSON response body, or throws an HttpError.
//
// Players say who they are with `me` (their player id, picked on "Who are you?").
// It's an honor system, but the server holds everyone to the same rules the
// screens show: you score for your own team and enter your own distances.
import { TOURNAMENT, defaultConfig } from './seed.mjs';
import { SCORE_LIMITS, gameType } from '../../../public/shared/rules.js';
import { HttpError, badRequest } from './http.mjs';
import { applyConfigEdits, cleanMessage, cleanText, decimal, int } from './validate.mjs';

const closed = () => new HttpError(423, 'Scoring is closed by the organizer.');

/** The player making the request, or a 403 explaining who may do this. */
function actingPlayer(config, me, whatFor) {
  const player = config.teams.flatMap((t) => t.players.map((p) => ({ ...p, teamId: t.id }))).find((p) => p.id === me);
  if (!player) throw new HttpError(403, `Pick your name (Who are you?) to ${whatFor}.`);
  return player;
}

export const routes = {
  'GET state': {
    access: 'public',
    run: ({ repo }) => repo.getState(),
  },

  'POST score': {
    access: 'public',
    async run({ body, repo, organizer }) {
      const config = await repo.getConfig();
      if (config.settings.locked && !organizer) throw closed();
      const team = config.teams.find((t) => t.id === body.teamId);
      if (!team) throw badRequest('Unknown team.');
      const me = organizer ? null : actingPlayer(config, body.me, 'enter scores');
      if (me && me.teamId !== team.id) throw new HttpError(403, `Only ${team.name} players and the organizer can enter scores for ${team.name}.`);
      const hole = int(body.hole, { min: 1, max: 18 }, 'Hole');
      if (!hole) throw badRequest('Pick a hole.');
      const strokes = int(body.strokes, SCORE_LIMITS.strokes, 'Strokes');
      const putts = int(body.putts, SCORE_LIMITS.putts, 'Putts');
      const by = me ? me.name : 'Organizer';
      const card = await repo.saveScore(team.id, hole, { strokes, putts: strokes === null ? null : putts, by });
      return { ok: true, card };
    },
  },

  'POST game': {
    access: 'public',
    async run({ body, repo, organizer }) {
      const game = TOURNAMENT.games.find((g) => g.id === body.gameId);
      if (!game) throw badRequest('Unknown game.');
      const config = await repo.getConfig();
      if (config.settings.locked && !organizer) throw closed();
      const player = config.teams.flatMap((t) => t.players).find((p) => p.id === body.playerId);
      if (!player) throw badRequest('Unknown player.');
      if (!organizer && actingPlayer(config, body.me, 'enter a distance').id !== player.id) {
        throw new HttpError(403, 'You can only enter your own distance.');
      }
      const { min, max } = gameType(game);
      const value = decimal(body.value, { min, max }, 'Distance');
      const games = await repo.saveDistance(game.id, player.id, value);
      return { ok: true, games };
    },
  },

  'POST chat': {
    access: 'public',
    async run({ body, repo, organizer }) {
      const name = cleanText(body.name);
      const text = cleanMessage(body.text);
      if (!name || !text) throw badRequest('Add your name and a message.');
      if (!organizer && name.toLowerCase() === TOURNAMENT.owner.toLowerCase()) {
        throw new HttpError(403, `Only the organizer can post as ${TOURNAMENT.owner}. Pick another name.`);
      }
      const chat = await repo.updateChat((list) => [...list, { id: crypto.randomUUID(), name, text, at: new Date().toISOString() }]);
      return { ok: true, name, chat };
    },
  },

  // ----- organizer only -----

  'POST admin/verify': {
    access: 'organizer',
    run: () => ({ ok: true }),
  },

  'POST admin/config': {
    access: 'organizer',
    async run({ body, repo }) {
      const config = applyConfigEdits(body, await repo.getConfig());
      await repo.saveConfig(config);
      return { ok: true, config };
    },
  },

  'POST admin/clear-scores': {
    access: 'organizer',
    async run({ body, repo }) {
      const ids = (await repo.getConfig()).teams.map((t) => t.id);
      if (body.teamId && !ids.includes(body.teamId)) throw badRequest('Unknown team.');
      await repo.clearScores(body.teamId ? [body.teamId] : ids);
      return { ok: true };
    },
  },

  'POST admin/clear-games': {
    access: 'organizer',
    async run({ repo }) { await repo.clearDistances(); return { ok: true }; },
  },

  'POST admin/clear-chat': {
    access: 'organizer',
    async run({ repo }) { await repo.clearChat(); return { ok: true }; },
  },

  'POST admin/chat-delete': {
    access: 'organizer',
    async run({ body, repo }) {
      await repo.updateChat((list) => list.filter((m) => m.id !== body.id));
      return { ok: true };
    },
  },

  'POST admin/reset-config': {
    access: 'organizer',
    /** Puts back the original Squabbit teams and players. Tee times, settings and scores stay. */
    async run({ repo }) {
      const config = applyConfigEdits({ teams: defaultConfig().teams }, await repo.getConfig());
      await repo.saveConfig(config);
      return { ok: true, config };
    },
  },
};
