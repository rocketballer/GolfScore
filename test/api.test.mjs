import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../netlify/functions/lib/core.mjs';
import { routes } from '../netlify/functions/lib/routes.mjs';
import { memoryKV } from '../netlify/functions/lib/kv.mjs';
import { createRepo } from '../netlify/functions/lib/repo.mjs';

const PIN = '4321';
const setup = (overrides = {}) => ({ repo: createRepo(memoryKV()), adminPin: PIN, clientIp: '1.2.3.4', ...overrides });
const call = async (ctx, path, body, pin) => {
  const headers = { 'content-type': 'application/json' };
  if (pin) headers['x-admin-pin'] = pin;
  const init = body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) };
  const res = await handle(new Request('http://x/api/' + path, init), ctx);
  return { status: res.status, body: await res.json() };
};

test('state, scoring, games, chat', async () => {
  const ctx = setup();
  let r = await call(ctx, 'state');
  assert.equal(r.status, 200);
  assert.equal(r.body.teams.length, 9);
  r = await call(ctx, 'score', { teamId: 't3', hole: 7, strokes: 3, putts: 1, by: 'Slater' });
  assert.equal(r.status, 200);
  await call(ctx, 'score', { teamId: 't3', hole: 8, strokes: 5 });
  r = await call(ctx, 'state');
  assert.deepEqual(r.body.scores.t3.holes, { 7: 3, 8: 5 });
  assert.equal(r.body.scores.t3.putts[7], 1);
  assert.equal(r.body.scores.t3.updatedBy, '');
  await call(ctx, 'score', { teamId: 't3', hole: 7, strokes: null });
  assert.deepEqual((await call(ctx, 'state')).body.scores.t3.holes, { 8: 5 });
  assert.equal((await call(ctx, 'score', { teamId: 't3', hole: 19, strokes: 4 })).status, 400);
  assert.equal((await call(ctx, 'score', { teamId: 'nope', hole: 1, strokes: 4 })).status, 400);
  assert.equal((await call(ctx, 'score', { teamId: 't1', hole: 1, strokes: 0 })).status, 400);

  r = await call(ctx, 'game', { gameId: 'ctp6', playerId: 'p3-1', value: 74 });
  assert.equal(r.status, 200);
  r = await call(ctx, 'game', { gameId: 'ctp6', playerId: 'p3-1', value: 50 });
  assert.deepEqual(r.body.games.ctp6.map((e) => e.value), [50]);
  assert.equal((await call(ctx, 'game', { gameId: 'ld10', playerId: 'p3-1', value: 501 })).status, 400);
  r = await call(ctx, 'chat', { name: 'Slater', text: 'Good luck boys' });
  assert.equal(r.body.chat.length, 1);
  assert.equal((await call(ctx, 'chat', { name: '', text: 'x' })).status, 400);
  assert.equal((await call(ctx, 'nope', {})).status, 404);
});

test('simultaneous saves on one team keep every hole', async () => {
  const ctx = setup();
  const results = await Promise.all(Array.from({ length: 18 }, (_, i) => call(ctx, 'score', { teamId: 't2', hole: i + 1, strokes: 4 })));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
  const holes = (await call(ctx, 'state')).body.scores.t2.holes;
  assert.equal(Object.keys(holes).length, 18);
});

test('simultaneous chat messages are all kept', async () => {
  const ctx = setup();
  await Promise.all(Array.from({ length: 5 }, (_, i) => call(ctx, 'chat', { name: 'A', text: `m${i}` })));
  assert.equal((await call(ctx, 'state')).body.chat.length, 5);
});

test('every organizer route refuses requests without the PIN', async () => {
  const organizerRoutes = Object.entries(routes).filter(([, r]) => r.access === 'organizer');
  assert.ok(organizerRoutes.length >= 6);
  for (const [key] of organizerRoutes) {
    const path = key.split(' ')[1];
    assert.equal((await call(setup(), path, {})).status, 401, key);
    assert.equal((await call(setup({ adminPin: undefined }), path, {})).status, 503, key);
  }
  for (const [key, r] of Object.entries(routes)) assert.ok(['public', 'organizer'].includes(r.access), key);
});

test('organizer edits, locked scoring, clearing and resetting', async () => {
  const ctx = setup();
  assert.equal((await call(ctx, 'admin/verify', {}, PIN)).status, 200);
  const st = (await call(ctx, 'state')).body;
  st.teams[0].players[0].hcp = 12.4;
  st.teams[0].name = 'Fighters';
  let r = await call(ctx, 'admin/config', { teams: st.teams, settings: { locked: true, tee: 'Championship' }, teeTimes: [{ time: '12:00', startHole: 1, teamIds: ['t1'] }] }, PIN);
  assert.equal(r.status, 200);
  const st2 = (await call(ctx, 'state')).body;
  assert.equal(st2.teams[0].name, 'Fighters');
  assert.equal(st2.teams[0].players[0].hcp, 12.4);
  assert.equal(st2.settings.tee, 'Championship');
  assert.equal(st2.teeTimes.length, 1);
  assert.equal((await call(ctx, 'score', { teamId: 't1', hole: 1, strokes: 4 })).status, 423);
  assert.equal((await call(ctx, 'score', { teamId: 't1', hole: 1, strokes: 4 }, PIN)).status, 200);
  assert.equal((await call(ctx, 'admin/config', { settings: { tee: 'Bogus' } }, PIN)).status, 400);
  await call(ctx, 'admin/clear-scores', {}, PIN);
  assert.deepEqual((await call(ctx, 'state')).body.scores.t1.holes, {});
  await call(ctx, 'admin/reset-config', {}, PIN);
  assert.equal((await call(ctx, 'state')).body.teams[0].name, 'Team 1');
});

test('wrong PINs lock out that address after 5 tries', async () => {
  const ctx = setup();
  for (let i = 0; i < 5; i++) assert.equal((await call(ctx, 'admin/verify', {}, '0000')).status, 401);
  assert.equal((await call(ctx, 'admin/verify', {}, PIN)).status, 429, 'locked even with the right PIN');
  assert.equal((await call(ctx, 'score', { teamId: 't1', hole: 1, strokes: 4 }, '0000')).status, 429, 'every route checks a sent PIN');
  assert.equal((await call({ ...ctx, clientIp: '5.6.7.8' }, 'admin/verify', {}, PIN)).status, 200, 'other addresses unaffected');
  assert.equal((await call(ctx, 'score', { teamId: 't1', hole: 1, strokes: 4 })).status, 200, 'public use without a PIN still works');
});
