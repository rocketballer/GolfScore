// Everything the API stores, behind plain functions. Callers never see
// storage keys, formats, or how simultaneous saves are kept apart.
//
//   scores:   one log entry per hole save   (see log.mjs)  s/<team>/<hole>/...
//   games:    one log entry per distance                   g/<game>/<player>/...
//   chat:     one JSON list, saved with retry-on-conflict
//   config:   one JSON object, written only by the organizer
import { TOURNAMENT, defaultConfig } from './seed.mjs';
import { emptyCard } from '../../../public/shared/rules.js';
import { createLog } from './log.mjs';

const MAX_CHAT = 500;
const MAX_TRIES = 6;
const CLEARED = 'x'; // payload meaning "no value" (a cleared hole or removed distance)

const keys = {
  config: 'config',
  chat: 'chat',
  failures: (ip) => `auth-fail-${String(ip).replace(/[^\w.:-]/g, '_').slice(0, 64)}`,
};

// Score payload: "<strokes or x>.<putts or n>.<who saved it, base64url>"
const toB64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const fromB64 = (s) => Buffer.from(s, 'base64url').toString('utf8');
const scorePayload = ({ strokes, putts, by }) => `${strokes ?? CLEARED}.${putts ?? 'n'}.${toB64(by || '')}`;

/** Turns one team's latest hole entries into the scorecard shape the app uses. */
function toCard(holes = {}) {
  const card = emptyCard();
  let newest = null;
  for (const [hole, e] of Object.entries(holes)) {
    if (!newest || e.stamp > newest.stamp) newest = e;
    const [strokes, putts] = e.payload.split('.');
    if (strokes === CLEARED) continue;
    card.holes[hole] = Number(strokes);
    if (putts !== 'n') card.putts[hole] = Number(putts);
  }
  if (newest) {
    card.updatedAt = newest.at;
    card.updatedBy = fromB64(newest.payload.split('.')[2] || '');
  }
  return card;
}

/** Turns the latest distance entries into { gameId: [{ playerId, value, at }] }. */
function toGames(latest) {
  const games = {};
  for (const [gameId, players] of Object.entries(latest)) {
    games[gameId] = Object.entries(players)
      .filter(([, e]) => e.payload !== CLEARED)
      .map(([playerId, e]) => ({ playerId, value: Number(e.payload), at: e.at }));
  }
  return games;
}

export class ConflictError extends Error {}

export function createRepo(kv) {
  const scores = createLog(kv, 's');
  const distances = createLog(kv, 'g');
  const get = async (key, fallback) => (await kv.read(key))?.value ?? fallback();

  /** Read, change and save one value, starting over if someone saved it in between. */
  async function update(key, fallback, change) {
    for (let i = 0; i < MAX_TRIES; i++) {
      const cur = await kv.read(key);
      const next = change(cur ? cur.value : fallback());
      if (await kv.writeIf(key, next, cur ? cur.tag : null)) return next;
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (i + 1)));
    }
    throw new ConflictError(`Too many simultaneous changes to ${key}`);
  }

  const getConfig = () => get(keys.config, defaultConfig);

  return {
    getConfig,
    /**
     * Saves the organizer's config. Scores of teams that no longer exist and
     * distances of players who no longer exist are deleted with it.
     */
    async saveConfig(next) {
      const before = await getConfig();
      const teamIds = new Set(next.teams.map((t) => t.id));
      const playerIds = new Set(next.teams.flatMap((t) => t.players.map((p) => p.id)));
      const goneTeams = before.teams.filter((t) => !teamIds.has(t.id)).map((t) => t.id);
      const gonePlayers = before.teams.flatMap((t) => t.players).filter((p) => !playerIds.has(p.id)).map((p) => p.id);
      await kv.write(keys.config, next);
      await Promise.all([
        ...goneTeams.map((id) => scores.clear(id)),
        ...TOURNAMENT.games.flatMap((g) => gonePlayers.map((id) => distances.clear(g.id, id))),
      ]);
    },

    /** Everything a screen needs, in one object. */
    async getState() {
      const [config, chat, allScores, allDistances] = await Promise.all([
        getConfig(), get(keys.chat, () => []), scores.latest(), distances.latest(),
      ]);
      const cards = Object.fromEntries(config.teams.map((t) => [t.id, toCard(allScores[t.id])]));
      return { tournament: TOURNAMENT, ...config, scores: cards, games: toGames(allDistances), chat };
    },

    /** Saves one hole (strokes null clears it) and returns the team's updated card. */
    async saveScore(teamId, hole, score) {
      await scores.put(teamId, hole, scorePayload(score));
      return toCard((await scores.latest(teamId))[teamId]);
    },
    clearScores: (teamIds) => Promise.all(teamIds.map((id) => scores.clear(id))),

    /** Saves one player's distance (null removes it) and returns all game entries. */
    async saveDistance(gameId, playerId, value) {
      await distances.put(gameId, playerId, value === null ? CLEARED : String(value));
      return toGames(await distances.latest());
    },
    clearDistances: () => distances.clear(),

    /** Applies `change` to the message list and keeps only the newest messages. */
    updateChat: (change) => update(keys.chat, () => [], (chat) => change(chat).slice(-MAX_CHAT)),
    clearChat: () => kv.write(keys.chat, []),

    // Wrong-PIN tracking, per client address.
    getFailures: (ip) => get(keys.failures(ip), () => ({ count: 0, since: 0 })),
    saveFailures: (ip, record) => kv.write(keys.failures(ip), record),
  };
}
