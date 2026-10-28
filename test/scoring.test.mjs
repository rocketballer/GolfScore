import test from 'node:test';
import assert from 'node:assert/strict';
import { teamHandicap, strokesOnHole, teamRound, leaderboard, recap, fmtToPar } from '../public/scoring.js';
import { gameStandings, gameValueFromFields, gameLabel, GAME_TYPES } from '../public/shared/rules.js';
import { TOURNAMENT, defaultConfig } from '../netlify/functions/lib/seed.mjs';

const holes = TOURNAMENT.course.holes;
const state = (scores = {}) => ({ tournament: TOURNAMENT, ...defaultConfig(), scores, games: {}, chat: [] });
const card = (arr) => ({ holes: Object.fromEntries(arr.map((v, i) => [i + 1, v]).filter(([, v]) => v != null)), putts: {} });

test('seed matches the Squabbit event', () => {
  const c = defaultConfig();
  assert.equal(c.teams.length, 9);
  assert.equal(c.teams.flatMap((t) => t.players).length, 36);
  assert.equal(holes.reduce((s, h) => s + h.par, 0), 71);
  assert.deepEqual([...holes.map((h) => h.si)].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
  assert.equal(holes[5].par, 3); // CTP hole
  assert.equal(holes[9].par, 5); // long drive hole
});

test('handicap strokes by stroke index', () => {
  assert.equal(strokesOnHole(0, 1), 0);
  assert.equal(strokesOnHole(5, 5), 1);
  assert.equal(strokesOnHole(5, 6), 0);
  assert.equal(strokesOnHole(20, 2), 2);
  assert.equal(strokesOnHole(20, 3), 1);
  assert.equal(strokesOnHole(-2, 18), -1);
  assert.equal(strokesOnHole(-2, 16), 0);
});

test('team handicap methods', () => {
  const team = { hcpOverride: null, players: [{ hcp: 20 }, { hcp: 4 }, { hcp: 12 }, { hcp: 8 }] };
  assert.equal(teamHandicap(team, { teamHcpMethod: 'scramble4' }), Math.round(4 * 0.25 + 8 * 0.2 + 12 * 0.15 + 20 * 0.1));
  assert.equal(teamHandicap(team, { teamHcpMethod: 'pct', teamHcpPct: 10 }), 4);
  assert.equal(teamHandicap(team, { teamHcpMethod: 'none' }), null);
  assert.equal(teamHandicap({ ...team, hcpOverride: 3.4 }, { teamHcpMethod: 'none' }), 3);
  assert.equal(teamHandicap({ hcpOverride: null, players: [{ hcp: null }] }, { teamHcpMethod: 'scramble4' }), null);
});

test('round totals and leaderboard ordering with ties', () => {
  const pars = holes.map((h) => h.par);
  const s = state({
    t1: card(pars.map((p) => p - 1 + 1)), // even par, complete
    t2: card(pars.map((p, i) => (i < 9 ? p - 1 : null))), // -9 thru 9
    t3: card(pars.map((p) => p)), // even, complete
  });
  const lb = leaderboard(s, false);
  assert.equal(lb[0].team.id, 't2');
  assert.equal(lb[0].pos, '1');
  assert.equal(lb[0].toPar, -9);
  assert.equal(lb[0].thru, 9);
  assert.equal(lb[1].pos, 'T2');
  assert.equal(lb[2].pos, 'T2');
  assert.equal(lb[3].pos, '-');
  const r = teamRound(s.teams[0], s.scores.t1, holes, s.settings);
  assert.equal(r.gross, 71);
  assert.equal(r.complete, true);
  assert.equal(fmtToPar(0), 'E');
  assert.equal(fmtToPar(-3), '-3');
  assert.equal(fmtToPar(2), '+2');
});

test('recap stats', () => {
  const pars = holes.map((h) => h.par);
  const a = pars.slice(); a[2] = pars[2] + 3; a[7] = pars[7] - 2; a[0] = pars[0] - 1; a[1] = pars[1] - 1;
  const s = state({ t1: card(a), t2: card(pars) });
  const rc = recap(s);
  assert.equal(rc.bestGross.length, 2);
  assert.equal(rc.blowup[0].hole, 3);
  assert.equal(rc.blowup[0].value, 3);
  assert.equal(rc.lowest[0].hole, 8);
  assert.equal(rc.eagles[0].team.id, 't1');
  assert.equal(rc.birdies[0].value, 2);
  assert.equal(rc.doubles[0].value, 1);
  assert.equal(rc.parStreak.find((x) => x.team.id === 't2').value, 18);
  assert.equal(rc.bestGross[0].team.id, 't1');
});

test('game rules', () => {
  const ctp = { type: 'ctp', hole: 6 }, ld = { type: 'ld', hole: 10 };
  assert.deepEqual(gameStandings(ctp, [{ value: 40 }, { value: 12 }]).map((e) => e.value), [12, 40]);
  assert.deepEqual(gameStandings(ld, [{ value: 240 }, { value: 290 }]).map((e) => e.value), [290, 240]);
  assert.equal(gameValueFromFields(ctp, { ft: '7', in: '3' }), 87);
  assert.equal(gameValueFromFields(ctp, { ft: '', in: '' }), null);
  assert.equal(gameValueFromFields(ld, { yd: '285' }), 285);
  assert.equal(GAME_TYPES.ctp.format(87), `7' 3"`);
  assert.equal(gameLabel(ctp), 'Hole 6: Closest to the pin');
  for (const g of TOURNAMENT.games) assert.ok(GAME_TYPES[g.type], g.id);
});

test('play order follows the shotgun start', async () => {
  const { playOrder } = await import('../public/scoring.js');
  const teeTimes = [{ startHole: 16, teamIds: ['t1'] }];
  assert.deepEqual(playOrder(teeTimes, 't1').slice(0, 5), [16, 17, 18, 1, 2]);
  assert.deepEqual(playOrder(teeTimes, 'no-tee-time').slice(0, 2), [1, 2]);
});

test('ranks mark ties with T', async () => {
  const { withRanks } = await import('../public/scoring.js');
  const ranked = withRanks([{ value: 66 }, { value: 66 }, { value: 67 }, { value: 68 }, { value: 68 }]);
  assert.deepEqual(ranked.map((e) => e.rank), ['T1', 'T1', '3', 'T4', 'T4']);
  assert.deepEqual(ranked.map((e) => e.place), [1, 1, 3, 4, 4]);
});

test('recap streaks and progression use each team\'s play order', () => {
  // Team starts on hole 10: plays 10..18 (all par or better), then 1..9 where hole 1 is a bogey.
  const pars = holes.map((h) => h.par);
  const scores = pars.map((p, i) => (i === 0 ? p + 1 : p));
  const s = { ...state({ t1: card(scores) }), teeTimes: [{ startHole: 10, teamIds: ['t1'] }] };
  const rc = recap(s);
  // In play order the bogey on hole 1 comes 10th, so the best par streak is 9 (10..18) and then 8 (2..9).
  assert.equal(rc.parStreak[0].value, 9);
  assert.equal(rc.progression[0].points.length, 18);
  assert.equal(rc.progression[0].points[9], 1, 'after the 10th hole played (hole 1, a bogey) the team is +1');
});

test('aces are reported', () => {
  const pars = holes.map((h) => h.par);
  const scores = pars.slice(); scores[5] = 1; // hole 6 is a par 3
  const rc = recap(state({ t6: card(scores) }));
  assert.deepEqual(rc.aces.map((a) => [a.team.id, a.hole]), [['t6', 6]]);
});

test('hole competition wording and limits', async () => {
  const { winnerLine, GAME_TYPES } = await import('../public/shared/rules.js');
  const ctp = { type: 'ctp', hole: 6 }, ld = { type: 'ld', hole: 10 };
  assert.equal(winnerLine(ctp, 'Slater', 87, false), `Slater leads closest to the pin on hole 6 (7' 3").`);
  assert.equal(winnerLine(ld, 'Jack', 287, true), 'Jack won longest drive on hole 10 (287 yds).');
  assert.equal(GAME_TYPES.ctp.format(0), 'Hole in one');
  assert.equal(GAME_TYPES.ld.min, 1);
});
