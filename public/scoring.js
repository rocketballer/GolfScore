// Pure scoring helpers shared by the UI and the tests.

/** Team handicap for a scramble. Returns a whole number or null when none applies. */
export function teamHandicap(team, settings) {
  if (team.hcpOverride !== null && team.hcpOverride !== undefined) return Math.round(team.hcpOverride);
  const hcps = team.players.map((p) => p.hcp).filter((h) => h !== null && h !== undefined).sort((a, b) => a - b);
  if (!hcps.length || settings.teamHcpMethod === 'none') return null;
  if (settings.teamHcpMethod === 'scramble4') {
    const w = [0.25, 0.2, 0.15, 0.1];
    return Math.round(hcps.slice(0, 4).reduce((s, h, i) => s + h * w[i], 0));
  }
  return Math.round(hcps.reduce((s, h) => s + h, 0) * (settings.teamHcpPct / 100));
}

/** Strokes a handicap receives on a hole with stroke index `si`. */
export function strokesOnHole(hcp, si) {
  if (!hcp) return 0;
  if (hcp > 0) return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
  // A plus handicap gives strokes back, starting from the easiest holes.
  const plus = -hcp;
  const given = Math.floor(plus / 18) + (si > 18 - (plus % 18) ? 1 : 0);
  return given ? -given : 0;
}

/** Everything the screens need about one team's round. */
export function teamRound(team, card, holes, settings) {
  const hcp = teamHandicap(team, settings);
  const rows = holes.map((h) => {
    const g = card?.holes?.[h.n] ?? null;
    const recv = strokesOnHole(hcp ?? 0, h.si);
    return {
      n: h.n, par: h.par, si: h.si,
      gross: g, net: g === null ? null : g - recv,
      putts: card?.putts?.[h.n] ?? null,
      toPar: g === null ? null : g - h.par,
    };
  });
  const played = rows.filter((r) => r.gross !== null);
  const sum = (arr, f) => arr.reduce((s, r) => s + f(r), 0);
  const front = played.filter((r) => r.n <= 9), back = played.filter((r) => r.n >= 10);
  return {
    team, hcp, rows,
    thru: played.length, // holes played, in any order
    complete: played.length === holes.length,
    gross: sum(played, (r) => r.gross),
    toPar: sum(played, (r) => r.toPar),
    netToPar: sum(played, (r) => r.net - r.par),
    net: sum(played, (r) => r.net),
    front: { n: front.length, gross: sum(front, (r) => r.gross), toPar: sum(front, (r) => r.toPar), netToPar: sum(front, (r) => r.net - r.par) },
    back: { n: back.length, gross: sum(back, (r) => r.gross), toPar: sum(back, (r) => r.toPar), netToPar: sum(back, (r) => r.net - r.par) },
    putts: played.some((r) => r.putts !== null) ? sum(played, (r) => r.putts ?? 0) : null,
    puttHoles: played.filter((r) => r.putts !== null).length,
    lastUpdate: card?.updatedAt || null,
  };
}

/** Sorted leaderboard with positions ("1", "T2"). Teams without scores go last. */
export function leaderboard(state, useNet) {
  const holes = state.tournament.course.holes;
  const rounds = state.teams.map((t) => teamRound(t, state.scores[t.id], holes, state.settings));
  const key = (r) => (useNet ? r.netToPar : r.toPar);
  rounds.sort((a, b) => {
    if (!a.thru !== !b.thru) return a.thru ? -1 : 1;
    if (!a.thru) return 0;
    return key(a) - key(b) || b.thru - a.thru;
  });
  let prev = null, pos = 0;
  rounds.forEach((r, i) => {
    if (!r.thru) { r.pos = '-'; return; }
    if (prev === null || key(r) !== prev) pos = i + 1;
    prev = key(r);
    r.posNum = pos;
  });
  rounds.forEach((r) => {
    if (r.posNum === undefined) return;
    const tied = rounds.filter((x) => x.posNum === r.posNum).length > 1;
    r.pos = (tied ? 'T' : '') + r.posNum;
  });
  return rounds;
}

export function fmtToPar(n) {
  if (n === null || n === undefined) return '-';
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
}

/** Recap statistics for the Recap tab. Each list is sorted best first. */
export function recap(state) {
  const holes = state.tournament.course.holes;
  const rounds = state.teams.map((t) => teamRound(t, state.scores[t.id], holes, state.settings)).filter((r) => r.thru);
  const per = (f) => rounds.map((r) => ({ team: r.team, value: f(r) })).filter((x) => x.value !== null && x.value !== undefined && !Number.isNaN(x.value));
  const asc = (a, b) => a.value - b.value, desc = (a, b) => b.value - a.value;
  const played = (r) => r.rows.filter((x) => x.gross !== null);

  const holeExtremes = (worst) => rounds.flatMap((r) => played(r).map((x) => ({ team: r.team, value: x.toPar, hole: x.n })))
    .sort(worst ? desc : asc);

  const streak = (r, ok) => {
    let best = 0, cur = 0;
    for (const x of r.rows) {
      if (x.gross === null) { cur = 0; continue; }
      cur = ok(x) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  };
  const count = (r, f) => played(r).filter(f).length;
  const byPar = (p) => per((r) => { const xs = played(r).filter((x) => x.par === p); return xs.length ? xs.reduce((s, x) => s + x.toPar, 0) : null; });
  const bySi = (lo, hi) => per((r) => { const xs = played(r).filter((x) => x.si >= lo && x.si <= hi); return xs.length ? xs.reduce((s, x) => s + x.toPar, 0) : null; });

  // Hole-by-hole average to par across all teams.
  const holeAvg = holes.map((h) => {
    const xs = rounds.map((r) => r.rows[h.n - 1].toPar).filter((v) => v !== null);
    return { hole: h.n, par: h.par, si: h.si, n: xs.length, value: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null };
  });

  const complete = rounds.filter((r) => r.complete);
  return {
    blowup: holeExtremes(true).filter((x) => x.value > 0),
    lowest: holeExtremes(false).filter((x) => x.value < 0),
    bestGross: complete.map((r) => ({ team: r.team, value: r.gross, toPar: r.toPar })).sort(asc),
    worstGross: complete.map((r) => ({ team: r.team, value: r.gross, toPar: r.toPar })).sort(desc),
    bestNet: complete.filter((r) => r.hcp !== null).map((r) => ({ team: r.team, value: r.net, toPar: r.netToPar })).sort(asc),
    worstNet: complete.filter((r) => r.hcp !== null).map((r) => ({ team: r.team, value: r.net, toPar: r.netToPar })).sort(desc),
    fewestPutts: complete.filter((r) => r.puttHoles === 18).map((r) => ({ team: r.team, value: r.putts })).sort(asc),
    mostPutts: complete.filter((r) => r.puttHoles === 18).map((r) => ({ team: r.team, value: r.putts })).sort(desc),
    puttAvgLow: per((r) => (r.puttHoles ? +(r.putts / r.puttHoles).toFixed(2) : null)).sort(asc),
    puttAvgHigh: per((r) => (r.puttHoles ? +(r.putts / r.puttHoles).toFixed(2) : null)).sort(desc),
    eagles: per((r) => count(r, (x) => x.toPar <= -2)).filter((x) => x.value).sort(desc),
    birdies: per((r) => count(r, (x) => x.toPar === -1)).filter((x) => x.value).sort(desc),
    netBirdies: per((r) => count(r, (x) => x.net - x.par === -1)).filter((x) => x.value).sort(desc),
    doubles: per((r) => count(r, (x) => x.toPar >= 2)).filter((x) => x.value).sort(desc),
    parStreak: per((r) => streak(r, (x) => x.toPar <= 0)).filter((x) => x.value).sort(desc),
    bogeyStreak: per((r) => streak(r, (x) => x.toPar >= 1)).filter((x) => x.value).sort(desc),
    bestFront: per((r) => (r.front.n === 9 ? r.front.gross : null)).sort(asc),
    worstFront: per((r) => (r.front.n === 9 ? r.front.gross : null)).sort(desc),
    bestBack: per((r) => (r.back.n === 9 ? r.back.gross : null)).sort(asc),
    worstBack: per((r) => (r.back.n === 9 ? r.back.gross : null)).sort(desc),
    par3: byPar(3).sort(asc), par3w: byPar(3).sort(desc),
    par4: byPar(4).sort(asc), par4w: byPar(4).sort(desc),
    par5: byPar(5).sort(asc), par5w: byPar(5).sort(desc),
    hard: bySi(1, 6).sort(asc), hardw: bySi(1, 6).sort(desc),
    easy: bySi(13, 18).sort(asc), easyw: bySi(13, 18).sort(desc),
    holeAvg,
    progression: rounds.map((r) => {
      let run = 0;
      return { team: r.team, points: r.rows.map((x) => (x.gross === null ? null : (run += x.toPar))) };
    }),
  };
}
