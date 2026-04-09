# Cloud Poker Bankroll

A lightweight poker bankroll tracker with three flows:

- Log Session
- View Details
- Banker

## Cloud sync

The app supports two modes:

- Local mode: if Supabase is not configured, data stays in browser storage on that device.
- Cloud mode: if Supabase is configured, the app uses username + password sign-in and syncs data across devices.

### 1. Create a Supabase project

Create a project in [Supabase](https://supabase.com/), then in the SQL editor run:

`[supabase/schema.sql](/Users/cloud/Desktop/poker_bankroll/supabase/schema.sql)`

### 2. Add environment variables

Copy `.env.example` to `.env` and fill in your project values:

```bash
cp .env.example .env
```

Required keys:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 3. Configure auth

In Supabase Auth settings:

- disable email confirmation for email/password signups if you want sign-up to work immediately
- add your local and deployed URLs to the allowed redirect URLs if you later enable social login

### 4. Sign in

The app uses username + password sign-in. The UI asks for a username, but Supabase still stores an internal email behind the scenes for authentication.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## GitHub hosting

This project includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

To publish it:

1. Push the repo to GitHub.
2. In GitHub, open `Settings > Secrets and variables > Actions`.
3. Add these repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. In GitHub, open `Settings > Pages`.
5. Set the source to `GitHub Actions`.
6. Push to `main`.

GitHub Actions will build the Vite app and deploy the `dist` output automatically.

Your site URL will usually be:

- `https://your-github-username.github.io/your-repo-name/`

## Recommended hosting

Vercel is the easiest option for this cloud-synced version because it handles environment variables and custom domains cleanly.

You can also use GitHub Pages, but you still need Supabase for shared data storage and auth.
