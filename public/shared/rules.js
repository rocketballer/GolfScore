// Tournament rules shared by the browser and the server.
// Keep this file free of DOM and Node APIs so both sides can import it.

/** Allowed values for one hole's score. */
export const SCORE_LIMITS = { strokes: { min: 1, max: 20 }, putts: { min: 0, max: 10 } };

/** How a scramble team handicap is built from player handicaps. */
export const HCP_METHODS = {
  scramble4: 'Scramble: 25/20/15/10% (low to high)',
  pct: 'Percent of combined handicaps',
  none: 'Gross only (no net)',
};

/** A team scorecard with nothing entered. Hole numbers are the keys. */
export const emptyCard = () => ({ holes: {}, putts: {} });

/**
 * Everything the app knows about each kind of hole competition.
 * `value` is always stored as one number in `unit`; `fields` describe how
 * people type it in (each field's number is multiplied by `scale`).
 */
export const GAME_TYPES = {
  ctp: {
    name: 'Closest to the pin',
    unit: 'in',
    lowerWins: true,
    min: 0, // 0 = in the hole
    max: 3000,
    rule: 'Shortest distance from the pin wins (must be on the green)',
    fields: [
      { name: 'ft', label: 'Feet', max: 250, scale: 12 },
      { name: 'in', label: 'Inches', max: 11, scale: 1 },
    ],
    format: (v) => (v === 0 ? 'Hole in one' : `${Math.floor(v / 12)}' ${Math.round(v % 12)}"`),
  },
  ld: {
    name: 'Longest drive',
    unit: 'yd',
    lowerWins: false,
    min: 1,
    max: 500,
    rule: 'Longest drive in the fairway wins',
    fields: [{ name: 'yd', label: 'Yards', max: 500, scale: 1 }],
    format: (v) => `${v} yds`,
  },
};

export const gameType = (game) => GAME_TYPES[game.type];

/** "Slater won closest to the pin on hole 6 (7' 3")." — or "leads" while scoring is still open. */
export function winnerLine(game, playerName, value, final) {
  const type = gameType(game);
  return `${playerName} ${final ? 'won' : 'leads'} ${type.name.toLowerCase()} on hole ${game.hole} (${type.format(value)}).`;
}

export const gameLabel = (game) => `Hole ${game.hole}: ${gameType(game).name}`;

/** Turns typed field values ({ft: '12', in: '4'}) into the stored number, or null if all are blank. */
export function gameValueFromFields(game, values) {
  const fields = gameType(game).fields;
  if (fields.every((f) => values[f.name] === '' || values[f.name] == null)) return null;
  return Math.round(fields.reduce((sum, f) => sum + Number(values[f.name] || 0) * f.scale, 0));
}

/** Entries sorted best first. */
export function gameStandings(game, entries) {
  const dir = gameType(game).lowerWins ? 1 : -1;
  return [...(entries || [])].sort((a, b) => (a.value - b.value) * dir);
}
