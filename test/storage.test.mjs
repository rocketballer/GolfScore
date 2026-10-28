import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV } from '../netlify/functions/lib/kv.mjs';
import { createLog } from '../netlify/functions/lib/log.mjs';
import { createRepo } from '../netlify/functions/lib/repo.mjs';

test('log keeps only the newest entry per item', async () => {
  const kv = memoryKV();
  const log = createLog(kv, 's');
  await log.put('t1', 7, 'a');
  await new Promise((r) => setTimeout(r, 2));
  await log.put('t1', 7, 'b');
  await log.put('t1', 8, 'c');
  const latest = await log.latest();
  assert.equal(latest.t1[7].payload, 'b');
  assert.equal(latest.t1[8].payload, 'c');
  assert.equal((await kv.list('s/t1/7/')).length, 1, 'superseded entry removed');
  await log.clear('t1');
  assert.deepEqual(await kv.list('s/'), []);
});

test('log groups do not leak into each other (t1 vs t10, hole 1 vs 10)', async () => {
  const log = createLog(memoryKV(), 's');
  await log.put('t1', 1, 'a');
  await log.put('t10', 10, 'b');
  assert.deepEqual(Object.keys(await log.latest('t1')), ['t1']);
  await log.clear('t1');
  assert.equal((await log.latest()).t10[10].payload, 'b');
});

test('repo scorecards: putts, clearing, who saved, unicode names', async () => {
  const repo = createRepo(memoryKV());
  await repo.saveScore('t3', 1, { strokes: 4, putts: 2, by: 'Søren' });
  let card = await repo.saveScore('t3', 2, { strokes: 3, putts: null, by: 'Slater' });
  assert.deepEqual(card.holes, { 1: 4, 2: 3 });
  assert.deepEqual(card.putts, { 1: 2 });
  assert.equal(card.updatedBy, 'Slater');
  await new Promise((r) => setTimeout(r, 2));
  card = await repo.saveScore('t3', 1, { strokes: null, putts: null, by: 'Søren' });
  assert.deepEqual(card.holes, { 2: 3 });
  assert.deepEqual(card.putts, {});
  assert.equal(card.updatedBy, 'Søren');
  const state = await repo.getState();
  assert.deepEqual(state.scores.t3.holes, { 2: 3 });
  assert.deepEqual(state.scores.t1, { holes: {}, putts: {} });
});

test('repo distances: replace, remove, decimals', async () => {
  const repo = createRepo(memoryKV());
  await repo.saveDistance('ctp6', 'p1-1', 87);
  await repo.saveDistance('ld10', 'p1-2', 285.5);
  await new Promise((r) => setTimeout(r, 2));
  let games = await repo.saveDistance('ctp6', 'p1-1', 50);
  assert.deepEqual(games.ctp6.map((e) => e.value), [50]);
  assert.equal(games.ld10[0].value, 285.5);
  games = await repo.saveDistance('ctp6', 'p1-1', null);
  assert.deepEqual(games.ctp6, []);
});
