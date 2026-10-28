// Actions for the header buttons shared by every screen.
import { toast } from '../lib/util.js';
import { tournament } from '../state.js';

export const actions = {
  'go-back': () => { if (history.length > 1) history.back(); else location.hash = '#leaderboard'; },
  'share': async () => {
    const url = location.origin + '/';
    const name = tournament().name;
    if (navigator.share) {
      try { await navigator.share({ title: name, text: `Live leaderboard for the ${name}`, url }); } catch { /* cancelled */ }
      return;
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
  },
};
