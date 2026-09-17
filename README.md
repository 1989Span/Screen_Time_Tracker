# Screen Time Tracker (Gauge)

A screen-time tracking app for Android, designed in [Claude Design](https://claude.ai/design) and implemented as an Expo / React Native app.

**This is a working prototype running entirely on generated demo data.** It does not read real device usage, has no backend, and moves no real money. See [Prototype limits](#prototype-limits).

## Layout

- **`app/`** — the implemented app (Expo + React Native + TypeScript).
- **`project/`** — the original Claude Design handoff bundle (HTML/CSS/JS prototypes, design-system tokens, assets). `project/Gauge Screen Time.dc.html` is the source design the first four screens were built from; see `project/README.md`.
- **`chats/`** — transcripts of the design conversations that produced the prototype, kept for context on how the design decisions were made.

## Running it

Requires Node 20 or newer.

```bash
cd app
npm install
npm run web      # browser (easiest; use the device toolbar for a phone-sized view)
npm run android  # Android emulator or device
npm run ios      # iOS simulator
```

## What the app does

Usage is tracked across eight categories — Social, Video, Work, Messaging, Games, Music, Reading and Navigation — over Day / Week / Month / Year. Four tabs at the bottom:

### Overview

- **Penalty limit card** — today's tracked time against your daily limit, today's running charge, and the locked balance.
- **Four timeframe cards** — each with a total, a colour-coded composition strip, an auto-generated "interesting fact" about the time spent, and the top 3 categories. Tap one for the breakdown.
- **Breakdown** — a Day/Week/Month/Year control, a tappable stacked bar chart that scopes into a single bucket, and the full ranked category list.

### Penalty limit

Set a daily limit for your tracked screen time and a charge per minute over it (presets or a custom amount, plus a custom hour/minute limit). Going over costs money:

- The day's charge is tallied live and settles at midnight. There's no daily cap.
- Changes take effect the next day, so the limit can't be loosened to dodge today's charge.
- Charges go into a locked balance that unlocks one year after install. What happens to the money then is undecided.
- A history screen lists every day's charge and the running balance.

### Groups

Accountability groups — Friends and Family in the demo — where the lowest daily screen time wins the day's point.

- **Daily ranking** — members ordered from least to most usage, each with their total and top categories.
- **Points and streaks** — an all-time leaderboard with each member's current and best winning streak.
- **Scoring** — the point is awarded at midnight to the lowest full-day total; everyone tied gets a point. Rankings use every category, so personal tracking toggles can't game them.
- **Tracking rules** — a group can agree to stop counting a category (Music, Navigation, …). Excluding one, or bringing it back, needs *every* member to agree; either change recalculates past points. At least one category must stay tracked.
- **Creating a group** — name it, choose which categories it tracks, and invite people from your contacts. Contacts who already have the app get an in-app invite; the rest get a download link by text. A group needs at least 2 people.
- **Group settings** — invite more people (any member can), open the tracking rules, or leave the group.
- **Joining** — someone who joins later leaves existing points and streaks untouched and starts at zero, competing from their join day onward.

### App timers

A daily budget per category, with a progress bar and a chip showing usage against the limit.

### Settings

Toggle which categories count toward your own totals and charts, with a select-all / clear-all shortcut.

## How the demo data works

Everything comes from deterministic pseudo-random formulas in `app/src/data.ts` and `app/src/groups.ts`, so the numbers are the same on every run.

- **"Today" is fixed** at 25 Aug 2026, 7pm, matching the original mockup.
- **Penalty limit** — pretends the app was installed 1 Mar 2026 with a 4h daily limit at $0.10/min, giving a locked balance that unlocks 1 Mar 2027.
- **Groups** — Friends (4 members, started 31 May) and Family (5 members, started 16 Apr). Each demo member has their own usage habits, balanced so everyone wins a fair share of points.
- **Voting** — each group starts with one excluded category plus seeded proposals, so every voting state is visible: one waiting only on you, one waiting on others, and one request to bring a category back.
- **Invites** — a fake contact list where each contact is flagged as having the app or not. Pending invites have an **Accept (demo)** action that stands in for the invitee accepting on their own phone.

## Prototype limits

- **No real tracking.** Reading actual usage needs Android's `UsageStatsManager` behind a usage-access permission, which means a custom native module and a development build.
- **No backend.** Groups, invites and contact matching would need accounts, a server and push notifications. Scoring should also move server-side so totals can't be faked by a modified client.
- **Nothing is saved.** All state is in memory and resets on reload.
- **Midnight never arrives.** Because "today" is fixed, pending changes and daily settlements never actually run.
- **No real money.** The penalty ledger is simulated. A real version needs a payment provider and legal review, since holding user funds for a year may count as money transmission.

## Project structure

```
app/
  App.tsx                  screen switch + bottom tab bar
  src/
    data.ts                demo usage data, formatting, penalty math
    groups.ts              groups, contacts, scoring, voting rules
    useModel.ts            view-model: all state and derived display data
    theme.ts               design tokens ported from the design system
    components/            shared UI (cards, chips, avatars, tab bar, contact picker)
    screens/               one file per screen
```

## License

MIT — see `app/LICENSE`.
