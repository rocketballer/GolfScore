// Small helpers with no knowledge of the tournament.
import { html, raw } from './html.js';

export const $ = (sel, el = document) => el.querySelector(sel);

function storage(area) {
  return {
    get(k, fallback = null) { try { const v = area().getItem('fi:' + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { v === null ? area().removeItem('fi:' + k) : area().setItem('fi:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
}
/** Remembered on this device. */
export const local = storage(() => localStorage);
/** Remembered until the tab closes. */
export const session = storage(() => sessionStorage);

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

/** "13:05" -> "1:05 PM" */
export function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "2026-10-31" -> "Sat, Oct 31, 2026" (or a shorter form via options). */
export function dateLabel(isoDate, timeZone, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const AVATAR_COLORS = ['#e0457b', '#1e9e5a', '#e8590c', '#7048e8', '#1c7ed6', '#0c8599', '#d6336c', '#f08c00', '#5f3dc4', '#c92a2a', '#2b8a3e', '#364fc7', '#212529', '#a61e4d', '#087f5b', '#9c36b5'];
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
const initials = (name) => {
  const parts = String(name).trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 1)).toUpperCase();
};

export const avatar = (name, size = '') =>
  html`<span class="avatar ${size}" style="background:${AVATAR_COLORS[hash(name) % AVATAR_COLORS.length]}" aria-hidden="true">${initials(name)}</span>`;

export const chevron = raw('<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 15.4 12 10.8l4.6 4.6L18 14l-6-6-6 6z"/></svg>');

/** Two-tap confirm, since browser dialogs are unreliable on some phones. */
export function confirmTap(btn, run) {
  if (btn.dataset.armed) { delete btn.dataset.armed; run(); return; }
  btn.dataset.armed = '1';
  const label = btn.textContent;
  btn.textContent = 'Tap again to confirm';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = label; } }, 3500);
}

/** setPath(obj, 'teams.2.name', 'X') */
export function setPath(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  parts.reduce((o, k) => o[k], obj)[last] = value;
}
