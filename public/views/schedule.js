// Schedule: tee times set by the organizer.
import { html } from '../lib/html.js';
import { dateLabel, timeLabel } from '../lib/util.js';
import { app, findTeam, isOrganizer, settings, tournament } from '../state.js';

function render() {
  const t = tournament();
  const groups = [...app.data.teeTimes].sort((a, b) => a.time.localeCompare(b.time) || a.startHole - b.startHole);
  const head = html`<div class="text-center"><div class="title">${t.course.name}</div>
    <div>${dateLabel(t.date, t.timeZone, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
    <div class="small muted">${t.format} · ${settings().tee} tees</div></div>`;
  if (!groups.length) {
    return html`${head}<p class="empty">Once an admin creates tee times you will see them here${isOrganizer() && html`.<br><a href="#admin">Add tee times</a>`}</p>`;
  }
  return html`${head}<div class="card"><div class="card-head">Round 1 tee times</div><div class="card-body">${groups.map((g) => {
    const teams = g.teamIds.map(findTeam).filter(Boolean);
    return html`<div class="tee-group"><div><div class="tee-time num">${timeLabel(g.time)}</div><div class="small muted">Hole ${g.startHole}</div></div>
      <div class="stack tight grow">${teams.length
        ? teams.map((team) => html`<div><b>${team.name}</b><div class="small muted">${team.players.map((p) => p.name).join(', ')}</div></div>`)
        : html`<span class="muted small">No teams assigned</span>`}</div></div>`;
  })}</div></div>`;
}

export default { render };
