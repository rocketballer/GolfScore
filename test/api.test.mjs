import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../netlify/functions/lib/core.mjs';

function mkStore() {
  const m = new Map();
  return { getJSON: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, structuredClone(v)); } };
}
const env = { ADMIN_PIN: '4321' };
const call = async (store, path, body, pin) => {
  const headers = { 'content-type': 'application/json' };
  if (pin) headers['x-admin-pin'] = pin;
  const res = await handle(new Request('http://x/api/' + path, body === undefined ? {} : { method: 'POST', headers, body: JSON.stringify(body) }), store, env);
  return { status: res.status, body: await res.json() };
};

test('state, scoring, games, chat', async () => {
  const s = mkStore();
  let r = await call(s, 'state');
  assert.equal(r.status, 200);
  assert.equal(r.body.teams.length, 9);
  r = await call(s, 'score', { teamId: 't3', hole: 7, strokes: 3, putts: 1, by: 'Slater' });
  assert.equal(r.status, 200);
  r = await call(s, 'score', { teamId: 't3', hole: 8, strokes: 5 });
  r = await call(s, 'state');
  assert.deepEqual(r.body.scores.t3.holes, { 7: 3, 8: 5 });
  assert.equal(r.body.scores.t3.putts[7], 1);
  r = await call(s, 'score', { teamId: 't3', hole: 7, strokes: null });
  assert.deepEqual((await call(s, 'state')).body.scores.t3.holes, { 8: 5 });
  assert.equal((await call(s, 'score', { teamId: 't3', hole: 19, strokes: 4 })).status, 400);
  assert.equal((await call(s, 'score', { teamId: 'nope', hole: 1, strokes: 4 })).status, 400);
  assert.equal((await call(s, 'score', { teamId: 't1', hole: 1, strokes: 0 })).status, 400);

  r = await call(s, 'game', { gameId: 'ctp6', playerId: 'p3-1', value: 74 });
  assert.equal(r.status, 200);
  r = await call(s, 'game', { gameId: 'ctp6', playerId: 'p3-1', value: 50 });
  assert.equal(r.body.games.ctp6.length, 1);
  assert.equal(r.body.games.ctp6[0].value, 50);
  r = await call(s, 'chat', { name: 'Slater', text: 'Good luck boys' });
  assert.equal(r.body.chat.length, 1);
  assert.equal((await call(s, 'chat', { name: '', text: 'x' })).status, 400);
});

test('organizer routes need the PIN', async () => {
  const s = mkStore();
  assert.equal((await call(s, 'admin/verify', {})).status, 401);
  assert.equal((await call(s, 'admin/verify', {}, 'bad')).status, 401);
  assert.equal((await call(s, 'admin/verify', {}, '4321')).status, 200);
  const st = (await call(s, 'state')).body;
  st.teams[0].players[0].hcp = 12.4;
  st.teams[0].name = 'Fighters';
  let r = await call(s, 'admin/config', { teams: st.teams, settings: { locked: true, tee: 'Championship' }, teeTimes: [{ time: '12:00', startHole: 1, teamIds: ['t1'] }] }, '4321');
  assert.equal(r.status, 200);
  const st2 = (await call(s, 'state')).body;
  assert.equal(st2.teams[0].name, 'Fighters');
  assert.equal(st2.teams[0].players[0].hcp, 12.4);
  assert.equal(st2.settings.tee, 'Championship');
  assert.equal(st2.teeTimes.length, 1);
  // locked: players blocked, organizer allowed
  assert.equal((await call(s, 'score', { teamId: 't1', hole: 1, strokes: 4 })).status, 423);
  assert.equal((await call(s, 'score', { teamId: 't1', hole: 1, strokes: 4 }, '4321')).status, 200);
  assert.equal((await call(s, 'admin/config', { settings: { tee: 'Bogus' } }, '4321')).status, 400);
  await call(s, 'admin/clear-scores', {}, '4321');
  assert.deepEqual((await call(s, 'state')).body.scores.t1.holes, {});
  await call(s, 'admin/reset-config', {}, '4321');
  assert.equal((await call(s, 'state')).body.teams[0].name, 'Team 1');
});

test('organizer routes are closed when no PIN is configured', async () => {
  const res = await handle(new Request('http://x/api/admin/verify', { method: 'POST', body: '{}' }), mkStore(), {});
  assert.equal(res.status, 503);
});
