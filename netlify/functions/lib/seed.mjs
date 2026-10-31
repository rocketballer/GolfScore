// Fighter Invitational. Originally copied from the Squabbit event (invite code CNHFQM);
// the lineup below is the organizer's final one for Oct 31, 2026.
// Course data: Victoria Park East Golf Club, Puslinch, ON (GolfPass scorecard).

const HOLES = [
  // n, par, men's stroke index, yards: Championship, Tournament, Intermediate, Forward
  [1, 5, 17, 484, 457, 449, 449],
  [2, 4, 5, 396, 382, 341, 341],
  [3, 4, 1, 424, 400, 365, 325],
  [4, 3, 13, 176, 158, 139, 126],
  [5, 4, 9, 392, 358, 331, 301],
  [6, 3, 15, 153, 136, 124, 112],
  [7, 4, 11, 402, 384, 349, 275],
  [8, 5, 3, 545, 520, 491, 460],
  [9, 4, 7, 418, 389, 365, 325],
  [10, 5, 8, 523, 504, 482, 442],
  [11, 3, 10, 190, 177, 171, 142],
  [12, 4, 2, 387, 361, 329, 329],
  [13, 3, 12, 161, 146, 138, 112],
  [14, 4, 18, 340, 326, 307, 307],
  [15, 3, 16, 177, 161, 155, 126],
  [16, 5, 4, 528, 506, 433, 433],
  [17, 4, 14, 356, 333, 291, 277],
  [18, 4, 6, 400, 381, 346, 326],
];

const TEES = [
  { id: 'Championship', rating: 69.8, slope: 122 },
  { id: 'Tournament', rating: 68.2, slope: 117 },
  { id: 'Intermediate', rating: 72.0, slope: 124 },
  { id: 'Forward', rating: 68.9, slope: 116 },
];

export const TOURNAMENT = {
  id: 'fighter-invitational', // also the name of the data store
  name: 'Fighter Invitational',
  format: 'Scramble',
  teamSize: 4,
  date: '2026-10-31',
  startTime: '12:00',
  timeZone: 'America/Toronto',
  owner: 'Noah Slater',
  course: {
    name: 'Victoria Park Golf Course (East)',
    address: 'Farnham Road, Puslinch, Wellington County, Southwestern Ontario, Ontario, Canada',
    lat: 43.5297599197544,
    lng: -80.1910892128944,
    tees: TEES,
    holes: HOLES.map(([n, par, si, ...y]) => ({
      n, par, si,
      yards: Object.fromEntries(TEES.map((t, i) => [t.id, y[i]])),
    })),
  },
  // Hole competitions. `type` is a key of GAME_TYPES in public/shared/rules.js.
  games: [
    { id: 'ctp6', type: 'ctp', hole: 6 },
    { id: 'ld10', type: 'ld', hole: 10 },
  ],
};

// The official lineup, one team per tee time. Each player is [id, name]. Ids
// never change once a player has one (phones remember who they are by id), so
// a player who moves team keeps their id and a new player gets a new one.
const LINEUP = [
  { time: '12:00', players: [['p1-1', 'Monik'], ['p2-4', 'Dove'], ['p1-5', 'Ben H'], ['p1-4', 'Meth']] },
  { time: '12:08', players: [['p2-1', 'Degroot'], ['p2-2', 'Frauts'], ['p8-4', 'Basso'], ['p2-5', 'Alonzo']] },
  { time: '12:16', players: [['p3-1', 'Slater'], ['p3-2', 'Boland'], ['p3-5', 'Damon'], ['p3-6', 'Wilson']] },
  { time: '12:24', players: [['p4-1', 'Nomack'], ['p4-2', 'Nate'], ['p4-3', 'Braeden'], ['p4-4', 'Raceer']] },
  { time: '12:32', players: [['p5-1', 'LD'], ['p5-2', 'JAKOB'], ['p5-5', 'Ethan'], ['p5-4', 'Bully']] },
  { time: '12:40', players: [['p6-1', 'Pio'], ['p6-2', 'Vinnie'], ['p6-5', 'Bradley'], ['p6-4', 'Reid']] },
  { time: '12:40', players: [['p7-1', 'Sheridan'], ['p7-2', 'Richard'], ['p7-3', 'Nelson'], ['p7-5', 'Weapon']] },
  { time: '12:48', players: [['p8-1', 'Ondercin'], ['p2-3', 'Pres'], ['p8-3', 'Bombino'], ['p8-2', 'Levi']] },
  { time: '12:56', players: [['p9-1', 'Jack'], ['p9-2', 'Josh'], ['p9-3', 'Nabs'], ['p9-4', 'Nate Gurr']] },
];

export function defaultConfig() {
  return {
    teams: LINEUP.map((group, i) => ({
      id: `t${i + 1}`,
      name: `Team ${i + 1}`,
      hcpOverride: null,
      players: group.players.map(([id, name]) => ({ id, name, hcp: null })),
    })),
    teeTimes: LINEUP.map((group, i) => ({ id: `g${i + 1}`, time: group.time, startHole: 1, teamIds: [`t${i + 1}`] })),
    settings: {
      tee: 'Tournament',
      // How a team handicap is built from player handicaps when none is set directly.
      // 'none' = gross only, 'scramble4' = 25/20/15/10% of A/B/C/D, 'pct' = sum x pct
      teamHcpMethod: 'scramble4',
      teamHcpPct: 10,
      locked: false,
      announcement: '',
    },
  };
}
