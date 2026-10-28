// Every API action, keyed "METHOD path". `access` is checked before `run` is
// called, so an organizer action can't be reached without the PIN no matter
// where it sits in this list.
//
// run({ body, repo, organizer }) returns the JSON response body, or throws an HttpError.
import { TOURNAMENT } from './seed.mjs';
import { SCORE_LIMITS, gameType } from '../../../public/shared/rules.js';
import { HttpError, badRequest } from './http.mjs';
import { applyConfigEdits, cleanText, decimal, int } from './validate.mjs';

export const routes = {
  'GET state': {
    access: 'public',
    run: ({ repo }) => repo.getState(),
  },

  'POST score': {
    access: 'public',
    async run({ body, repo, organizer }) {
      const config = await repo.getConfig();
      if (config.settings.locked && !organizer) throw new HttpError(423, 'Scoring is closed by the organizer.');
      const team = config.teams.find((t) => t.id === body.teamId);
      if (!team) throw badRequest('Unknown team.');
      const hole = int(body.hole, { min: 1, max: 18 }, 'Hole');
      if (!hole) throw badRequest('Pick a hole.');
      const strokes = int(body.strokes, SCORE_LIMITS.strokes, 'Strokes');
      const putts = int(body.putts, SCORE_LIMITS.putts, 'Putts');
      const by = cleanText(body.by);
      const card = await repo.saveScore(team.id, hole, { strokes, putts: strokes === null ? null : putts, by });
      return { ok: true, card };
    },
  },

  'POST game': {
    access: 'public',
    async run({ body, repo }) {
      const game = TOURNAMENT.games.find((g) => g.id === body.gameId);
      if (!game) throw badRequest('Unknown game.');
      const config = await repo.getConfig();
      const player = config.teams.flatMap((t) => t.players).find((p) => p.id === body.playerId);
      if (!player) throw badRequest('Unknown player.');
      const value = decimal(body.value, { min: 0, max: gameType(game).max }, 'Distance');
      const games = await repo.saveDistance(game.id, player.id, value);
      return { ok: true, games };
    },
  },

  'POST chat': {
    access: 'public',
    async run({ body, repo }) {
      const name = cleanText(body.name);
      const text = String(body.text ?? '').trim().slice(0, 500);
      if (!name || !text) throw badRequest('Add your name and a message.');
      const chat = await repo.updateChat((list) => [...list, { id: crypto.randomUUID(), name, text, at: new Date().toISOString() }]);
      return { ok: true, chat };
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

  'POST admin/chat-delete': {
    access: 'organizer',
    async run({ body, repo }) {
      await repo.updateChat((list) => list.filter((m) => m.id !== body.id));
      return { ok: true };
    },
  },

  'POST admin/reset-config': {
    access: 'organizer',
    async run({ repo }) { await repo.resetConfig(); return { ok: true }; },
  },
};
