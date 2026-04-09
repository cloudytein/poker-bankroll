# AGENTS

## Project Summary

Cloud Poker Bankroll is a Vite + React single-page app for tracking poker results.

Main user flows:

- `Log Session`
- `View Details`
- `Banker`

The app supports:

- local-only mode with browser storage
- cloud-sync mode with Supabase auth + database

Visual direction:

- lightweight
- soft lavender / violet theme
- mobile-friendly
- minimal landing page with cloud icon

## Tech Stack

- `Vite`
- `React`
- `@supabase/supabase-js`
- plain CSS in one stylesheet

Key files:

- [package.json](/Users/cloud/Desktop/poker_bankroll/package.json)
- [vite.config.js](/Users/cloud/Desktop/poker_bankroll/vite.config.js)
- [src/main.jsx](/Users/cloud/Desktop/poker_bankroll/src/main.jsx)
- [src/App.jsx](/Users/cloud/Desktop/poker_bankroll/src/App.jsx)
- [src/styles.css](/Users/cloud/Desktop/poker_bankroll/src/styles.css)
- [src/lib/supabase.js](/Users/cloud/Desktop/poker_bankroll/src/lib/supabase.js)
- [README.md](/Users/cloud/Desktop/poker_bankroll/README.md)
- [supabase/schema.sql](/Users/cloud/Desktop/poker_bankroll/supabase/schema.sql)

## File Directory

Important repo structure:

```text
/Users/cloud/Desktop/poker_bankroll
├── AGENTS.md
├── README.md
├── package.json
├── vite.config.js
├── .env.example
├── src
│   ├── App.jsx
│   ├── main.jsx
│   ├── styles.css
│   └── lib
│       └── supabase.js
└── supabase
    └── schema.sql
```

Notes:

- `node_modules` exists locally right now.
- `package-lock.json` exists.
- real Supabase keys should stay in `.env.local`, not in git-tracked files.

## Environment Variables

Required for cloud mode:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Reference file:

- [.env.example](/Users/cloud/Desktop/poker_bankroll/.env.example)

If those env vars are missing, the app falls back to local mode.

## Auth Model

Supabase auth uses:

- email magic links

Client setup lives in:

- [src/lib/supabase.js](/Users/cloud/Desktop/poker_bankroll/src/lib/supabase.js)

Behavior:

- if Supabase is configured and no user is signed in, app shows auth screen
- if signed in, app loads synced user data
- if not configured, app uses localStorage

## Database Schema

Defined in:

- [supabase/schema.sql](/Users/cloud/Desktop/poker_bankroll/supabase/schema.sql)

### `public.poker_sessions`

Columns:

- `id uuid primary key`
- `user_id uuid`
- `date date`
- `game_type text`
- `custom_game_type text`
- `buy_in numeric`
- `payout numeric nullable`
- `cash_out numeric nullable`
- `stakes text`
- `location text`
- `net numeric`
- `created_at timestamptz`

Purpose:

- stores the player’s normal poker session history

### `public.banker_days`

Columns:

- `id uuid primary key`
- `user_id uuid`
- `date date`
- `game_type text`
- `custom_game_type text`
- `players jsonb`
- `saved_at timestamptz`

Purpose:

- stores saved banker sessions

### `public.banker_drafts`

Columns:

- `user_id uuid primary key`
- `date date`
- `game_type text`
- `custom_game_type text`
- `players jsonb`
- `updated_at timestamptz`

Purpose:

- stores the current in-progress banker board for each user

### Security

All three tables have:

- Row Level Security enabled
- policies based on `auth.uid() = user_id`

## Frontend State and Storage

Main app file:

- [src/App.jsx](/Users/cloud/Desktop/poker_bankroll/src/App.jsx)

The app currently handles:

- navigation by internal page state, not a router
- poker session CRUD
- banker player management
- banker saved-session history
- monthly analytics
- local mode and Supabase cloud mode in the same component

Local storage keys used in fallback mode:

- `cloud-bankroll-sessions-v1`
- `cloud-banker-v1`
- `cloud-banker-days-v1`

## Current Screens

### Landing

Shows:

- cloud icon
- total profit
- win rate
- sessions
- buttons for `Log Session`, `View Details`, `Banker`

### Log Session

Behavior:

- fields only appear after a game type is selected
- supports decimals
- `tourney` uses payout flow
- non-tourney games use cash out + stakes

### View Details

Primary tabs:

- `Sessions`
- `Monthly Analytics`

Sessions view includes:

- summary strip
- game filter
- result filter
- expandable session cards
- location shown beside date when present

Monthly Analytics includes:

- summary sub-tab
- calendar sub-tab using `📅`
- month selector

Calendar behavior:

- shows only daily total result
- no per-session list in the calendar cells

### Banker

Behavior:

- tracks current banker board
- supports decimals
- separate banker game type selector
- excludes `tourney`
- supports custom banker game type via `other`
- saved banker sessions live on a separate `Saved Sessions` page

Saved banker sessions:

- can be reopened for editing
- update in place
- are separate from normal poker sessions

## Important Product Decisions Already Made

- landing page stays minimal
- lavender/violet styling is intentional
- local mode still works if Supabase is not configured
- cloud mode syncs data by signed-in user
- monthly analytics belongs inside `View Details`
- calendar is a sub-view of monthly analytics, not a top-level tab
- calendar cells show daily total only
- session cards no longer show the old `buy-in to cashout` inline summary
- location appears next to date if present

## Deployment Notes

Frontend hosting options:

- Vercel recommended
- GitHub Pages also supported for static hosting

Important:

- GitHub Pages only hosts the frontend
- Supabase is required for shared cross-device data

GitHub Pages workflow exists at:

- [.github/workflows/deploy.yml](/Users/cloud/Desktop/poker_bankroll/.github/workflows/deploy.yml)

## Known Constraints

- Main UI logic is still concentrated in a single file: [src/App.jsx](/Users/cloud/Desktop/poker_bankroll/src/App.jsx)
- No router yet
- No tests yet
- No edit flow for regular poker sessions yet beyond delete/recreate

## Good Next Improvements

- split `App.jsx` into smaller components
- add explicit loading/error states around all Supabase mutations
- add charts to monthly analytics
- add edit support for normal poker sessions
- add schema migrations/versioning
- add tests

## How To Resume In A New Chat

If starting fresh, first read:

1. [AGENTS.md](/Users/cloud/Desktop/poker_bankroll/AGENTS.md)
2. [README.md](/Users/cloud/Desktop/poker_bankroll/README.md)
3. [src/App.jsx](/Users/cloud/Desktop/poker_bankroll/src/App.jsx)
4. [supabase/schema.sql](/Users/cloud/Desktop/poker_bankroll/supabase/schema.sql)

Then confirm:

- whether work should stay local-only or use Supabase cloud mode
- whether the user wants UI polish or data/model changes
