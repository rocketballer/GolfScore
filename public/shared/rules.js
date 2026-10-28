// Tournament rules shared by the browser and the server.
// Keep this file free of DOM and Node APIs so both sides can import it.

/** Allowed values for one hole's score. */
export const SCORE_LIMITS = { strokes: { min: 1, max: 20 }, putts: { min: 0, max: 10 } };

/** How a scramble team handicap is built from player handicaps. */
export const HCP_METHODS = {
  scramble4: '4-person scramble: 25% / 20% / 15% / 10% (low to high)',
  pct: 'Percent of combined handicaps',
  none: 'Gross only',
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
    max: 3000,
    rule: 'Shortest distance from the pin wins (must be on the green)',
    fields: [
      { name: 'ft', label: 'Feet', max: 250, scale: 12 },
      { name: 'in', label: 'Inches', max: 11, scale: 1 },
    ],
    format: (v) => `${Math.floor(v / 12)}' ${Math.round(v % 12)}"`,
    winnerLine: (player, game) => `${player} won closest to the pin on ${game.hole}.`,
  },
  ld: {
    name: 'Longest drive',
    unit: 'yd',
    lowerWins: false,
    max: 500,
    rule: 'Longest drive in the fairway wins',
    fields: [{ name: 'yd', label: 'Yards', max: 500, scale: 1 }],
    format: (v) => `${v} yds`,
    winnerLine: (player, game, v) => `${player} won the long drive on ${game.hole} (${GAME_TYPES.ld.format(v)}).`,
  },
};

export const gameType = (game) => GAME_TYPES[game.type];
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
