# Cloud Poker Bankroll App — Project Overview

## Purpose
This project is a poker bankroll tracking web app with three main user flows:

1. **Log Session** — record poker sessions and bankroll results
2. **View Details** — browse, filter, and inspect past sessions
3. **Banker** — manage player buy-ins and cash-outs for a live poker day

The app is intended to feel lightweight, clean, and mobile-friendly, with a soft lavender/violet visual style.

---

## Current Tech / State
There are currently **two versions** of the app concept:

- a **React component** version
- a **single-file HTML** version

The most important reference for functionality and UI behavior is the **latest React version**.

### React component details
- Single component app
- Uses React state and hooks
- Uses `lucide-react` icons
- Uses Tailwind utility classes for styling
- Stores data in `localStorage`

### Current storage keys
- `cloud-bankroll-sessions-v1`
- `cloud-banker-v1`

---

## Core Product Requirements

### 1. Landing Page
The landing page is intentionally minimal.

#### It must show:
- a **cloud icon only** at the top
- **Total Profit**
- **Win Rate**
- **Sessions**
- three buttons:
  - **Log Session**
  - **View Details**
  - **Banker**

#### Important design notes
- No app title text like “PokerTrack”
- No large outer boxed container around the whole landing page
- Soft lavender / violet theme
- Clean centered layout
- The cloud icon should be slightly prominent
- The landing block should sit vertically balanced on the page
- The three stats should align cleanly on the same baseline
- Buttons are intentionally compact, not oversized

---

## 2. Log Session Flow
This page lets the user add a poker session.

### Fields
#### Always shown
- **Date**
  - defaults to today’s local date
- **Game type** buttons:
  - `tourney`
  - `cash game`
  - `home game`
  - `online`
  - `other`

#### If `other` is selected
- show a text input asking what the game type is

#### For `tourney`
Show:
- buy in
- how much you made
- optional location

Net formula:
- `net = payout - buyIn`

#### For `cash game`, `home game`, `online`, and `other`
Show:
- buy in
- cash out
- stakes
- optional location

Net formula:
- `net = cashOut - buyIn`

### Validation rules
- date is required
- game type is required
- if `other` is selected, custom game name is required
- buy in must be valid
- for non-tourney games, stakes are required
- cash out / payout cannot be negative

### On save
- create a new session object
- prepend it to the sessions list
- persist to localStorage
- reset form to defaults
- navigate to **View Details**

---

## 3. View Details Page
This page is the session history view.

### It should support
- viewing all sessions
- filtering by game type
- filtering by result:
  - All
  - Wins
  - Losses
  - Even
- logging a new session from this page

### Session card behavior
Each session card shows:
- session name / game label
- date
- profit/loss amount
- buy in → payout/cash out summary
- stakes badge when relevant
- delete button

### Expand behavior
When a session is expanded, show:
- buy in
- amount made or cash out
- location

### Important behavior
- sessions should be sorted newest-first by date
- filters should update displayed sessions only
- deleting a session should update persisted state

---

## 4. Banker Page
This page is for managing player money on a given poker day.

### Top summary area
Show:
- **Total Money**
- **Total Buy Ins**
- **Date**

### Banker data model
Each player should have:
- `id`
- `name`
- `buyIns` (array, because a player can rebuy multiple times)
- `cashOut`

### Player management behavior
The user can:
- add player names
- prevent duplicate names ignoring case
- add multiple buy-ins for the same player
- set cash-out amount for each player
- remove a player

### Player calculations
#### Total buy-in per player
- sum of `buyIns`

#### Result for the day
- `cashOut - totalBuyIn`

### Expand behavior
When clicking a player’s name, show:
- buy-in history
- winnings/losses for the day

### Banker summary formulas
#### Total buy ins
- sum of every player’s buy-ins

#### Total cash out
- sum of every player’s cash out

#### Total money
Current implementation uses:
- `totalMoney = totalBuyIns - totalCashOut`

If Codex thinks the display wording should change for clarity, it can improve naming, but should preserve the current calculation unless explicitly changed.

---

## Data Structures

### Session object
```js
{
  id: string,
  date: string,
  gameType: string,
  customGameType: string,
  buyIn: number,
  payout: number | null,
  cashOut: number | null,
  stakes: string,
  location: string,
  net: number,
  createdAt: number
}
```

### Banker player object
```js
{
  id: string,
  name: string,
  buyIns: number[],
  cashOut: number
}
```

---

## Existing Helper Logic
The current app already includes helper functions for:

- getting today’s local date
- formatting currency in AUD
- formatting signed currency for profit/loss
- formatting dates for display
- generating a readable session label
- converting labels to title case
- calculating summary stats
- calculating banker totals
- calculating per-player totals

Codex should preserve this behavior unless there is a strong reason to refactor.

---

## Current UI / Styling Direction
The visual direction is important.

### Style goals
- clean
- minimal
- soft
- modern
- slightly premium
- mobile-friendly
- no clutter

### Theme
- light background
- lavender / violet accent color
- white cards
- subtle borders
- soft shadows
- rounded corners

### Important landing page specifics
- cloud icon only at top
- stat row centered
- compact buttons
- balanced spacing
- no big boxed container around everything

---

## What Should Not Change Without Good Reason
- three-button landing page structure
- cloud icon at top
- overall lavender theme
- localStorage persistence
- main pages:
  - landing
  - log
  - details
  - banker
- multiple buy-ins per banker player
- session history filtering

---

## Good Next Improvements for Codex
Codex can improve the project by doing any of the following:

### Code quality
- split large component into smaller components
- extract reusable UI components
- centralize helpers and types
- improve naming consistency
- remove duplication

### UX improvements
- better mobile spacing
- inline validation messages instead of alerts
- smoother page transitions
- edit existing sessions
- edit player names or buy-ins
- add confirmation before deletion
- add empty-state illustrations or nicer messaging

### Data / product improvements
- add notes field for sessions
- add session duration or hours played
- add charts for profit over time
- add bankroll trend graph
- add CSV export/import
- allow multiple banker dates / saved banker days
- allow archiving past banker days

### Architecture improvements
- convert to proper multi-file React app structure
- add TypeScript
- add tests
- add a lightweight routing solution if needed
- add persistent schema versioning for localStorage

---

## If Codex Rebuilds the App
If Codex chooses to rebuild instead of patching the current code, the rebuilt version should still preserve:

1. the same three main user flows
2. the same underlying session and banker logic
3. the same simple visual personality
4. the same landing page concept
5. local-first persistence unless otherwise requested

---

## Suggested Handoff Goal for Codex
A good task framing for Codex would be:

> Refactor and improve this poker bankroll tracking app while preserving the existing features, lavender visual style, and simple landing page layout. Keep the three main sections: Log Session, View Details, and Banker. Improve code structure, maintain localStorage persistence, preserve current calculations, and make the UI more polished and responsive without changing the core product behavior.

---

## Notes About User Preference
The user cares a lot about:
- exact landing page proportions
- small visual spacing adjustments
- compact button sizing
- alignment
- keeping the interface minimal

Codex should avoid making the landing page feel bulky, oversized, or too “app-dashboard” heavy.

