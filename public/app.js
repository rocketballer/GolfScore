// Entry point: picks the screen for the URL, draws the shared chrome (header,
// tabs, bottom bar), and routes every interaction to a named action.
//
// How interactions work: any element with data-action="name" runs actions[name].
//   - buttons and links run on click
//   - text inputs and textareas run on input
//   - selects, checkboxes and radios run on change
//   - forms run on submit (the page never reloads)
// The handler receives (element.dataset, element, event). Each view module
// exports its own actions; names must be unique across the app.
import { $, dateLabel } from './lib/util.js';
import { app, isOrganizer, myPlayer, myTeam, onRender, refresh, scoringOpen, tournament } from './state.js';
import home from './views/home.js';
import players from './views/players.js';
import leaderboard from './views/leaderboard.js';
import team from './views/team.js';
import schedule from './views/schedule.js';
import activity from './views/activity.js';
import admin from './views/admin.js';
import * as sheets from './views/sheets.js';
import * as scoreEntry from './views/score-entry.js';
import * as chrome from './views/chrome.js';

// tab: highlighted tab · hero: photo header · bar: "Enter scores" button · back: back button
const SCREENS = {
  home: { view: home, tab: 'home', hero: true, bar: true },
  players: { view: players, tab: 'home', hero: true, bar: true },
  leaderboard: { view: leaderboard, tab: 'leaderboard', bar: true },
  team: { view: team, tab: 'leaderboard', bar: true, back: true },
  schedule: { view: schedule, tab: 'schedule', bar: true },
  activity: { view: activity, tab: 'activity' },
  admin: { view: admin, back: true },
};

function currentRoute() {
  const h = location.hash.slice(1) || 'home';
  if (h.startsWith('team-')) return { name: 'team', id: h.slice(5) };
  return { name: h in SCREENS ? h : 'home' };
}

// ---------- actions ----------
const actions = {};
const views = new Set(Object.values(SCREENS).map((s) => s.view));
for (const source of [chrome.actions, sheets.actions, scoreEntry.actions, ...[...views].map((v) => v.actions)]) {
  for (const [name, fn] of Object.entries(source || {})) {
    if (actions[name]) throw new Error(`Two handlers for action "${name}"`);
    actions[name] = fn;
  }
}

function dispatch(el, ev) {
  const fn = actions[el.dataset.action];
  if (fn) fn({ ...el.dataset }, el, ev);
  else console.warn(`No handler for action "${el.dataset.action}"`);
}
const isTextField = (el) => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type));

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (el && !el.matches('form, input, select, textarea')) dispatch(el, ev);
});
document.addEventListener('input', (ev) => { if (ev.target.dataset?.action && isTextField(ev.target)) dispatch(ev.target, ev); });
document.addEventListener('change', (ev) => { if (ev.target.dataset?.action && !isTextField(ev.target)) dispatch(ev.target, ev); });
document.addEventListener('submit', (ev) => { ev.preventDefault(); if (ev.target.dataset.action) dispatch(ev.target, ev); });

// ---------- chrome ----------
function updateTopbar() {
  const screen = SCREENS[currentRoute().name];
  const hero = $('#hero');
  $('#topbar').classList.toggle('solid', !screen.hero || window.scrollY > hero.offsetHeight - $('#topbar').offsetHeight - 24);
}

function renderChrome(route, screen) {
  const t = tournament();
  document.title = t.name;
  $('#topbar-title').textContent = t.name;
  $('#hero-title').textContent = t.name;
  $('#hero-format').textContent = `${t.format} tournament`;
  $('#hero-date').textContent = dateLabel(t.date, t.timeZone, { month: 'short', day: 'numeric', year: 'numeric' });

  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === screen.tab));
  document.body.classList.toggle('compact', !screen.hero);
  document.body.classList.toggle('offline', !app.online);
  $('#btn-back').hidden = !screen.back;
  $('#btn-me').textContent = myPlayer()?.name || (app.me?.role === 'spectator' ? 'Spectating' : 'Who are you?');

  $('#bottom-bar').hidden = !screen.bar;
  document.body.classList.toggle('no-bar', !screen.bar);
  const enter = $('#btn-enter');
  enter.disabled = !scoringOpen();
  enter.textContent = !scoringOpen() ? 'Scoring closed' : myTeam() ? `Enter scores · ${myTeam().name}` : 'Enter scores';
  updateTopbar();
}

// ---------- rendering ----------
let shownHash = null;
let askedWho = false;

function render({ background = false } = {}) {
  const view = $('#view');
  if (!app.data) {
    if (!app.online) view.innerHTML = '<p class="empty">Can\'t reach the scoring server. Check your connection and try again.</p>';
    return;
  }
  const route = currentRoute();
  const screen = SCREENS[route.name];
  const sameScreen = shownHash === location.hash;
  renderChrome(route, screen);

  // New data arriving while someone types: let the view update around the cursor.
  const focused = document.activeElement;
  if (background && sameScreen && screen.view.whileTyping && view.contains(focused) && focused.matches('input, textarea, select')) {
    screen.view.whileTyping();
    return;
  }

  const y = window.scrollY;
  view.innerHTML = String(screen.view.render(route));
  if (sameScreen) window.scrollTo(0, y);
  shownHash = location.hash;
  screen.view.mounted?.();

  if (!app.me && !askedWho && !isOrganizer()) { askedWho = true; sheets.whoSheet(); }
}
onRender(render);

let shownScreen = currentRoute().name;
window.addEventListener('hashchange', () => {
  SCREENS[shownScreen].view.leave?.();
  shownScreen = currentRoute().name;
  sheets.closeSheet({ quiet: true });
  render();
  if (shownScreen !== 'activity') window.scrollTo(0, 0);
});
window.addEventListener('scroll', updateTopbar, { passive: true });
$('#sheet-backdrop').addEventListener('click', () => sheets.closeSheet());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheets.closeSheet(); });

// ---------- live updates ----------
refresh();
setInterval(() => { if (!document.hidden && !sheets.isSheetOpen()) refresh(); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
