// Everything the API stores, behind plain functions. Callers never see
// storage keys, blob formats or the retry-on-conflict logic.
import { TOURNAMENT, defaultConfig } from './seed.mjs';
import { emptyCard } from '../../../public/shared/rules.js';

const MAX_CHAT = 500;
const MAX_TRIES = 6;

const keys = {
  config: 'config',
  games: 'games',
  chat: 'chat',
  card: (teamId) => `scores-${teamId}`,
  failures: (ip) => `auth-fail-${String(ip).replace(/[^\w.:-]/g, '_').slice(0, 64)}`,
};

export class ConflictError extends Error {}

export function createRepo(kv) {
  const get = async (key, fallback) => (await kv.read(key))?.value ?? fallback();

  /**
   * Read, change and save one value without losing anyone else's change made
   * in between: if the value moved under us, start over from the new value.
   */
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
    saveConfig: (config) => kv.write(keys.config, config),
    resetConfig: () => kv.write(keys.config, defaultConfig()),

    /** Everything a screen needs, in one object. */
    async getState() {
      const config = await getConfig();
      const [games, chat, ...cards] = await Promise.all([
        get(keys.games, () => ({})),
        get(keys.chat, () => []),
        ...config.teams.map((t) => get(keys.card(t.id), emptyCard)),
      ]);
      const scores = Object.fromEntries(config.teams.map((t, i) => [t.id, cards[i]]));
      return { tournament: TOURNAMENT, ...config, scores, games, chat };
    },

    updateCard: (teamId, change) => update(keys.card(teamId), emptyCard, change),
    clearCards: (teamIds) => Promise.all(teamIds.map((id) => kv.write(keys.card(id), emptyCard()))),

    updateGames: (change) => update(keys.games, () => ({}), change),
    clearGames: () => kv.write(keys.games, {}),

    /** Applies `change` to the message list and keeps only the newest messages. */
    updateChat: (change) => update(keys.chat, () => [], (chat) => change(chat).slice(-MAX_CHAT)),

    // Wrong-PIN tracking, per client address.
    getFailures: (ip) => get(keys.failures(ip), () => ({ count: 0, since: 0 })),
    saveFailures: (ip, record) => kv.write(keys.failures(ip), record),
  };
}
