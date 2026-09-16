# Screen Time Tracker (Gauge)

An Android screen-time tracking app, designed in [Claude Design](https://claude.ai/design) and implemented as a real Expo/React Native app.

## Layout

- **`app/`** — the implemented app (Expo + React Native + TypeScript). See `app/package.json` for scripts; `npm run web` / `npm run android` / `npm run ios` from inside `app/`.
- **`project/`** — the original Claude Design handoff bundle (HTML/CSS/JS prototypes, design-system tokens, assets). `project/Gauge Screen Time.dc.html` is the source design that `app/` was built from — see `project/README.md`.
- **`chats/`** — transcripts of the design conversations that produced the prototype, kept for context on how the design decisions were made.

## What the app does

Tracks device screen time by category (Social, Video, Work, Messaging, Games, Music, Reading) across Day / Week / Month / Year:

- **Overview** — four timeframe cards, each with a total, a color-coded composition strip, an auto-generated "interesting fact" about the time spent, and the top 3 categories.
- **Breakdown** — tap a card to drill in: a segmented Day/Week/Month/Year control, a tappable stacked bar chart to scope into a single bucket, and a full ranked category list.
- **App timers** — set a daily budget per category; a progress bar and chip show usage against the limit.
- **Tracked categories** — toggle which categories count toward totals, with a select-all/clear-all shortcut.
