// Tournament API. Works against any store with async getJSON(key) / setJSON(key, value),
// so the same code runs on Netlify Blobs and in the local dev server.
import { TOURNAMENT, defaultConfig } from './seed.mjs';

const MAX_CHAT = 500;
const MAX_TEXT = 500;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const bad = (msg) => json(400, { error: msg });

async function getConfig(store) {
  return (await store.getJSON('config')) || defaultConfig();
}

async function loadState(store) {
  const config = await getConfig(store);
  const [games, chat, ...teamScores] = await Promise.all([
    store.getJSON('games'),
    store.getJSON('chat'),
    ...config.teams.map((t) => store.getJSON(`scores-${t.id}`)),
  ]);
  const scores = {};
  config.teams.forEach((t, i) => { scores[t.id] = teamScores[i] || { holes: {}, putts: {} }; });
  return {
    tournament: TOURNAMENT,
    ...config,
    scores,
    games: games || {},
    chat: chat || [],
    serverTime: new Date().toISOString(),
  };
}

function cleanName(v, max = 40) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function intOrNull(v, min, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('out of range');
  return n;
}

function numOrNull(v, min, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error('out of range');
  return Math.round(n * 10) / 10;
}

function isAdmin(req, env) {
  const pin = env.ADMIN_PIN;
  return !!pin && req.headers.get('x-admin-pin') === pin;
}

function validateConfig(input, current) {
  const out = structuredClone(current);
  if (input.teams) {
    if (!Array.isArray(input.teams) || input.teams.length > 60) throw new Error('teams');
    const seen = new Set();
    out.teams = input.teams.map((t, i) => {
      const id = /^t[\w-]{1,20}$/.test(t.id) ? t.id : `t${Date.now().toString(36)}${i}`;
      if (seen.has(id)) throw new Error('duplicate team id');
      seen.add(id);
      return {
        id,
        name: cleanName(t.name) || `Team ${i + 1}`,
        hcpOverride: numOrNull(t.hcpOverride, -20, 60),
        players: (Array.isArray(t.players) ? t.players : []).slice(0, 8).map((p, j) => ({
          id: /^p[\w-]{1,30}$/.test(p.id) ? p.id : `p${id}-${Date.now().toString(36)}${j}`,
          name: cleanName(p.name) || 'Player',
          hcp: numOrNull(p.hcp, -10, 54),
        })),
      };
    });
  }
  if (input.teeTimes) {
    if (!Array.isArray(input.teeTimes) || input.teeTimes.length > 60) throw new Error('teeTimes');
    out.teeTimes = input.teeTimes.map((g, i) => ({
      id: /^g[\w-]{1,30}$/.test(g.id) ? g.id : `g${Date.now().toString(36)}${i}`,
      time: /^\d{2}:\d{2}$/.test(g.time) ? g.time : TOURNAMENT.startTime,
      startHole: intOrNull(g.startHole, 1, 18) || 1,
      teamIds: (Array.isArray(g.teamIds) ? g.teamIds : []).filter((x) => typeof x === 'string').slice(0, 6),
    }));
  }
  if (input.settings) {
    const s = input.settings;
    const tees = TOURNAMENT.course.tees.map((t) => t.id);
    if (s.tee !== undefined) { if (!tees.includes(s.tee)) throw new Error('tee'); out.settings.tee = s.tee; }
    if (s.teamHcpMethod !== undefined) {
      if (!['none', 'scramble4', 'pct'].includes(s.teamHcpMethod)) throw new Error('method');
      out.settings.teamHcpMethod = s.teamHcpMethod;
    }
    if (s.teamHcpPct !== undefined) out.settings.teamHcpPct = numOrNull(s.teamHcpPct, 0, 100) ?? 0;
    if (s.locked !== undefined) out.settings.locked = !!s.locked;
    if (s.announcement !== undefined) out.settings.announcement = String(s.announcement).slice(0, 300);
  }
  return out;
}

export async function handle(req, store, env = {}) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = req.method.toUpperCase();

  try {
    if (method === 'GET' && path === 'state') return json(200, await loadState(store));

    if (method !== 'POST') return json(404, { error: 'Not found' });
    let body;
    try { body = await req.json(); } catch { return bad('Send a JSON body.'); }

    if (path === 'score') {
      const config = await getConfig(store);
      if (config.settings.locked && !isAdmin(req, env)) return json(423, { error: 'Scoring is locked by the organizer.' });
      const team = config.teams.find((t) => t.id === body.teamId);
      if (!team) return bad('Unknown team.');
      let hole, strokes, putts;
      try {
        hole = intOrNull(body.hole, 1, 18);
        strokes = intOrNull(body.strokes, 1, 20);
        putts = intOrNull(body.putts, 0, 10);
      } catch { return bad('Score is out of range.'); }
      if (!hole) return bad('Pick a hole.');
      const key = `scores-${team.id}`;
      const card = (await store.getJSON(key)) || { holes: {}, putts: {} };
      if (strokes === null) { delete card.holes[hole]; delete card.putts[hole]; }
      else {
        card.holes[hole] = strokes;
        if (putts === null) delete card.putts[hole]; else card.putts[hole] = putts;
      }
      card.updatedAt = new Date().toISOString();
      card.updatedBy = cleanName(body.by);
      await store.setJSON(key, card);
      return json(200, { ok: true, card });
    }

    if (path === 'game') {
      const game = TOURNAMENT.games.find((g) => g.id === body.gameId);
      if (!game) return bad('Unknown game.');
      const config = await getConfig(store);
      const player = config.teams.flatMap((t) => t.players).find((p) => p.id === body.playerId);
      if (!player) return bad('Unknown player.');
      let value;
      try { value = numOrNull(body.value, 0, game.type === 'ctp' ? 3000 : 500); } catch { return bad('Distance is out of range.'); }
      const games = (await store.getJSON('games')) || {};
      const list = (games[game.id] || []).filter((e) => e.playerId !== player.id);
      if (value !== null) list.push({ playerId: player.id, value, at: new Date().toISOString() });
      games[game.id] = list;
      await store.setJSON('games', games);
      return json(200, { ok: true, games });
    }

    if (path === 'chat') {
      const name = cleanName(body.name);
      const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
      if (!name || !text) return bad('Add your name and a message.');
      const chat = (await store.getJSON('chat')) || [];
      chat.push({ id: crypto.randomUUID(), name, text, at: new Date().toISOString() });
      const trimmed = chat.slice(-MAX_CHAT);
      await store.setJSON('chat', trimmed);
      return json(200, { ok: true, chat: trimmed });
    }

    // Organizer-only routes below.
    if (path.startsWith('admin/')) {
      if (!env.ADMIN_PIN) return json(503, { error: 'Organizer PIN is not set up on the server.' });
      if (!isAdmin(req, env)) return json(401, { error: 'Wrong organizer PIN.' });
      const action = path.slice(6);
      if (action === 'verify') return json(200, { ok: true });
      if (action === 'config') {
        let next;
        try { next = validateConfig(body, await getConfig(store)); } catch (e) { return bad(`Invalid ${e.message}.`); }
        await store.setJSON('config', next);
        return json(200, { ok: true, config: next });
      }
      if (action === 'clear-scores') {
        const config = await getConfig(store);
        const ids = body.teamId ? [body.teamId] : config.teams.map((t) => t.id);
        await Promise.all(ids.map((id) => store.setJSON(`scores-${id}`, { holes: {}, putts: {} })));
        return json(200, { ok: true });
      }
      if (action === 'clear-games') { await store.setJSON('games', {}); return json(200, { ok: true }); }
      if (action === 'chat-delete') {
        const chat = ((await store.getJSON('chat')) || []).filter((m) => m.id !== body.id);
        await store.setJSON('chat', chat);
        return json(200, { ok: true });
      }
      if (action === 'reset-config') { await store.setJSON('config', defaultConfig()); return json(200, { ok: true }); }
    }
    return json(404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Something went wrong on the server. Try again.' });
  }
}
