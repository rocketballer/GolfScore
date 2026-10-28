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

## How it's organized

Each file owns one job, and each fact about the tournament lives in exactly one place.

```
public/                        static site, no build step
  index.html, styles.css       page shell and styles
  app.js                       screens list, header/tabs, action dispatcher, live polling
  state.js                     app state: data, who is viewing, permissions, derived standings, API calls
  scoring.js                   scoring math (handicaps, leaderboard, recap stats); no DOM
  shared/rules.js              rules used by browser AND server: score limits, handicap methods,
                               the empty scorecard, hole-competition types (GAME_TYPES)
  lib/html.js                  html`...` templates that escape text automatically
  lib/util.js                  small generic helpers (storage, dates, toasts, avatars)
  views/*.js                   one file per screen; each exports render() and its actions
  img/                         header photo
netlify/functions/
  api.mjs                      Netlify entry point (wiring only)
  lib/seed.mjs                 the event: course, date, games, original Squabbit teams
  lib/core.mjs                 request handling: routing, organizer PIN check, lockout, errors
  lib/routes.mjs               every API action, each marked public or organizer
  lib/repo.mjs                 all storage, behind plain functions (getState, saveScore, ...)
  lib/log.mjs                  "newest entry wins" storage used for scores and distances
  lib/kv.mjs                   storage adapters: Netlify Blobs, and in-memory for dev/tests
  lib/validate.mjs             cleans request input
```

**Buttons and forms.** Any element with `data-action="name"` runs the action of that name
(click for buttons and links, input for text fields, change for selects and checkboxes,
submit for forms). Each view exports its actions; `test/ui.test.mjs` fails if a
`data-action` has no handler or a handler is never used.

**Adding a hole competition.** Add `{ id, type, hole }` to `games` in `seed.mjs`. For a new
kind of competition, add one entry to `GAME_TYPES` in `shared/rules.js`; the entry form,
standings, server limits and recap line all read from it.

**Security.**
- Organizer actions are marked `access: 'organizer'` in `routes.mjs` and checked before
  they run. A test confirms every one of them refuses requests without the PIN.
- After 5 wrong PINs, that address is locked out for 15 minutes.
- Templates escape all text unless it's explicitly marked `raw()`.
- Score entry is honor-system by design: the screens only offer scoring for your own team,
  but the server accepts any team's score.

**Simultaneous saves.** Every score or distance save writes its own small entry rather
than editing a shared scorecard, so two people saving at the same moment can't overwrite
each other. Netlify's "only save if unchanged" check proved unreliable under truly
simultaneous writes, so this design doesn't rely on it. Chat still uses that check with
retries; a lost message would need two people to press Send within milliseconds of each other.

**Live updates.** The app polls `/api/state` every 5 seconds and redraws only when something
changed. Redraws never interrupt someone typing.

Environment variable: `ADMIN_PIN`, the organizer PIN. Without it the organizer page stays locked.

## Local development

```bash
npm install
ADMIN_PIN=1234 npm run dev   # http://localhost:8888, in-memory data
npm test
```

## Credits

Header photo by [Keith Tanner](https://unsplash.com/photos/a-golf-course-is-surrounded-by-trees-EGQ0m5QyNu8)
on Unsplash (Unsplash License).
