// Fighter Invitational, copied from the Squabbit event (invite code CNHFQM).
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
  id: 'fighter-invitational',
  name: 'Fighter Invitational',
  format: 'Scramble',
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
  games: [
    { id: 'ctp6', type: 'ctp', hole: 6, label: 'Hole 6: Closest to the pin' },
    { id: 'ld10', type: 'ld', hole: 10, label: 'Hole 10: Longest drive' },
  ],
};

const TEAM_PLAYERS = [
  ['Monik', 'Rick', 'Benny', 'Meth'],
  ['Degroot', 'Frauts', 'Pres', 'Dove'],
  ['Slater', 'Boland', 'Damo', 'Massey'],
  ['Nomack', 'Nate', 'Braeden', 'Raceer'],
  ['LD', 'JAKOB', 'El', 'Bully'],
  ['Pio', 'Vinnie', 'Nick B', 'Reid'],
  ['Sheridan', 'Richard', 'Nelson', 'Newdad'],
  ['Ondercin', 'Levi', 'Bombino', 'Basso'],
  ['Jack', 'Josh', 'Nabs', 'Nate Gurr'],
];

export function defaultConfig() {
  return {
    teams: TEAM_PLAYERS.map((names, i) => ({
      id: `t${i + 1}`,
      name: `Team ${i + 1}`,
      hcpOverride: null,
      players: names.map((name, j) => ({ id: `p${i + 1}-${j + 1}`, name, hcp: null })),
    })),
    teeTimes: [],
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
