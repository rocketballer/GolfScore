# Fighter Invitational: live golf scoring

A copy of the Squabbit event **Fighter Invitational** (invite code `CNHFQM`): a one-round 4-person scramble at Victoria Park Golf Course (East), Puslinch, ON on Sat, Oct 31, 2026 at 12:00 PM.

It is a phone-first web app with the same sections as Squabbit:

| Squabbit | Here |
|---|---|
| Home › About (schedule, weather, location, contact) | Same, plus a live leaders card and a format card |
| Home › Players (search, 36 players, handicaps) | Same, sortable by name, team or handicap |
| Leaderboard › Scramble › Overall / Round 1 | Same: expandable teams, hole-by-hole grid, gross/net toggle once handicaps exist |
| Leaderboard › Games › Hole competitions | Hole 6 closest to the pin, hole 10 longest drive |
| Leaderboard › Recap | Written recap, scoring progression chart, blowups, best/worst rounds, putting, birdies, doubles, streaks, front/back, scoring by par, hole difficulty, hole averages |
| Schedule (tee times) | Same; organizer can add tee times or one-tap shotgun start |
| Activity (group chat) | Same |
| "Playing or spectating?" prompt | Same; players pick their name and score for their own team |

The organizer page (`#admin`, linked at the bottom of Home) is protected by a PIN and lets you
edit teams, players and handicaps, set tee times, pick the tees, set the team handicap rule, close
scoring, post an announcement, and clear scores.

## Teams (from Squabbit)

1. Monik, Rick, Benny, Meth
2. Degroot, Frauts, Pres, Dove
3. Slater, Boland, Damo, Massey
4. Nomack, Nate, Braeden, Raceer
5. LD, JAKOB, El, Bully
6. Pio, Vinnie, Nick B, Reid
7. Sheridan, Richard, Nelson, Newdad
8. Ondercin, Levi, Bombino, Basso
9. Jack, Josh, Nabs, Nate Gurr

Handicaps were "Not set" in Squabbit, so the board is gross until the organizer adds them.

## How it runs

- `public/`: static site (no build step). `scoring.js` holds the scoring math.
- `netlify/functions/api.mjs`: one Netlify Function at `/api/*`, storing data in Netlify Blobs
  (one blob per team scorecard, plus games, chat and config).
- The app polls `/api/state` every 5 seconds, so every phone sees new scores within a few seconds.

Environment variable: `ADMIN_PIN`, the organizer PIN. Without it the organizer page stays locked.

## Local development

```bash
npm install
ADMIN_PIN=1234 npm run dev   # http://localhost:8888, in-memory data
npm test
```
