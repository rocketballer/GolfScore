// Home › About: schedule, format, location and contact, all read from tournament data.
import { html } from '../lib/html.js';
import { dateLabel, local, timeLabel } from '../lib/util.js';
import { gameType } from '../shared/rules.js';
import { holes, rerender, settings, standings, tournament } from '../state.js';
import { homeChips, standingRow, thruText, toPar, underClass } from './common.js';

// ----- weather (Open-Meteo, no key needed); cached for 3 hours -----
let weather = local.get('weather');
async function loadWeather() {
  if (weather && Date.now() - weather.at < 3 * 3600e3) return;
  try {
    const { course: { lat, lng }, date } = tournament();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const d = (await res.json()).daily;
    weather = { at: Date.now(), hi: Math.round(d.temperature_2m_max[0]), lo: Math.round(d.temperature_2m_min[0]), code: d.weather_code[0], rain: d.precipitation_probability_max?.[0] };
    local.set('weather', weather);
    rerender();
  } catch { /* the forecast is optional */ }
}
function weatherIcon(code) {
  if (code === 0) return '☀️'; if (code <= 2) return '🌤️'; if (code === 3) return '☁️';
  if (code <= 48) return '🌫️'; if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️';
  return '⛈️';
}

function leadersCard() {
  const leaders = standings(false).filter((r) => r.thru).slice(0, 3);
  if (!leaders.length) return '';
  return html`<div class="card"><div class="card-head"><span><span class="live-dot"></span>Live leaders</span><a class="link-btn on-dark" href="#leaderboard">Full board</a></div>
    <div class="card-body">${leaders.map((r) => standingRow(r.pos, html`<b>${r.team.name}</b> <span class="muted small">${thruText(r)}</span>`,
      html`<span class="${underClass(r)}">${toPar(r)}</span>`, { place: r.posNum }))}</div></div>`;
}

function render() {
  const t = tournament(), c = t.course, tee = settings().tee;
  const teeInfo = c.tees.find((x) => x.id === tee);
  const yards = holes().reduce((s, h) => s + h.yards[tee], 0);
  const par = holes().reduce((s, h) => s + h.par, 0);
  const shortDate = dateLabel(t.date, t.timeZone, { month: 'short', day: 'numeric' });
  const games = t.games.map((g) => `${gameType(g).name.toLowerCase()} on hole ${g.hole} (par ${holes()[g.hole - 1].par})`);
  const span = 0.008; // map box size in degrees
  return html`${homeChips('about')}
    ${settings().announcement && html`<div class="banner">${settings().announcement}</div>`}
    ${leadersCard()}
    <div class="card"><div class="card-head">Schedule</div><div class="card-body">
      <div class="round-row"><span class="round-badge">R1</span><div class="grow">
        <div class="title">${dateLabel(t.date, t.timeZone)} · ${timeLabel(t.startTime)}</div>
        <div class="small">${c.name}</div>
        <div class="small muted">18 holes · ${t.format} · ${tee} tees</div>
      </div>
      ${weather && html`<div class="weather" title="Forecast for ${shortDate}"><span class="w-icon">${weatherIcon(weather.code)}</span>${weather.hi}°/${weather.lo}°${weather.rain != null && html`<br>${weather.rain}% rain`}</div>`}</div>
    </div></div>
    <div class="card"><div class="card-head">Format</div><div class="card-body stack small">
      <div><b>${t.teamSize}-person ${t.format.toLowerCase()}.</b> Everyone hits, the team picks the best shot, and everyone plays from there. One team score per hole.</div>
      ${games.length > 0 && html`<div><b>Hole competitions:</b> ${games.join(' and ')}.</div>`}
      <div class="muted">Par ${par} · ${yards.toLocaleString()} yards from the ${tee} tees${teeInfo && ` · Rating ${teeInfo.rating} / Slope ${teeInfo.slope}`}</div>
    </div></div>
    <div class="card"><div class="card-head">Location</div>
      <iframe class="map" title="Map of ${c.name}" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${c.lng - span},${c.lat - span * 0.6},${c.lng + span},${c.lat + span * 0.6}&layer=mapnik&marker=${c.lat},${c.lng}"></iframe>
      <div class="addr"><div><b>${c.name}</b><div class="small muted">${c.address}</div></div>
      <a class="btn btn-outline" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.address}`)}">Directions</a></div>
    </div>
    <div class="footer-links"><a class="link-btn" href="#admin">Admin setup</a>
      <div class="small muted">Header photo: <a href="https://unsplash.com/photos/a-golf-course-is-surrounded-by-trees-EGQ0m5QyNu8" target="_blank" rel="noopener">Keith Tanner on Unsplash</a></div></div>`;
}

export default { render, mounted: loadWeather };
