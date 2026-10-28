// Turns untrusted request input into clean values, or throws a 400 HttpError
// whose message says what to fix.
import { TOURNAMENT } from './seed.mjs';
import { HCP_METHODS } from '../../../public/shared/rules.js';
import { badRequest } from './http.mjs';

const blank = (v) => v === null || v === undefined || v === '';

export function cleanText(v, max = 40) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Whole number in [min, max], or null when blank. */
export function int(v, { min, max }, label) {
  if (blank(v)) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** Number in [min, max] rounded to one decimal, or null when blank. */
export function decimal(v, { min, max }, label) {
  if (blank(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${label} must be from ${min} to ${max}.`);
  return Math.round(n * 10) / 10;
}

const idOr = (v, pattern, fallback) => (typeof v === 'string' && pattern.test(v) ? v : fallback);
const newId = (prefix, i) => `${prefix}${Date.now().toString(36)}${i}`;

/** Applies the organizer's edits (any of teams, teeTimes, settings) on top of the current config. */
export function applyConfigEdits(input, current) {
  const out = structuredClone(current);

  if (input.teams !== undefined) {
    if (!Array.isArray(input.teams) || input.teams.length > 60) throw badRequest('Teams must be a list of up to 60.');
    const seen = new Set();
    out.teams = input.teams.map((t, i) => {
      const id = idOr(t.id, /^t[\w-]{1,20}$/, newId('t', i));
      if (seen.has(id)) throw badRequest('Two teams have the same id.');
      seen.add(id);
      return {
        id,
        name: cleanText(t.name) || `Team ${i + 1}`,
        hcpOverride: decimal(t.hcpOverride, { min: -20, max: 60 }, 'Team handicap'),
        players: (Array.isArray(t.players) ? t.players : []).slice(0, 8).map((p, j) => ({
          id: idOr(p.id, /^p[\w-]{1,30}$/, newId(`p${id}-`, j)),
          name: cleanText(p.name) || 'Player',
          hcp: decimal(p.hcp, { min: -10, max: 54 }, 'Player handicap'),
        })),
      };
    });
  }

  if (input.teeTimes !== undefined) {
    if (!Array.isArray(input.teeTimes) || input.teeTimes.length > 60) throw badRequest('Tee times must be a list of up to 60.');
    out.teeTimes = input.teeTimes.map((g, i) => ({
      id: idOr(g.id, /^g[\w-]{1,30}$/, newId('g', i)),
      time: /^\d{2}:\d{2}$/.test(g.time) ? g.time : TOURNAMENT.startTime,
      startHole: int(g.startHole, { min: 1, max: 18 }, 'Starting hole') || 1,
      teamIds: (Array.isArray(g.teamIds) ? g.teamIds : []).filter((x) => typeof x === 'string').slice(0, 6),
    }));
  }

  const s = input.settings;
  if (s) {
    if (s.tee !== undefined) {
      if (!TOURNAMENT.course.tees.some((t) => t.id === s.tee)) throw badRequest('Pick one of the course tees.');
      out.settings.tee = s.tee;
    }
    if (s.teamHcpMethod !== undefined) {
      if (!(s.teamHcpMethod in HCP_METHODS)) throw badRequest('Pick a team handicap method.');
      out.settings.teamHcpMethod = s.teamHcpMethod;
    }
    if (s.teamHcpPct !== undefined) out.settings.teamHcpPct = decimal(s.teamHcpPct, { min: 0, max: 100 }, 'Handicap percent') ?? 0;
    if (s.locked !== undefined) out.settings.locked = !!s.locked;
    if (s.announcement !== undefined) out.settings.announcement = String(s.announcement).slice(0, 300);
  }
  return out;
}
