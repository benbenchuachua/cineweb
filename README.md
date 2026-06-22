# CineWeb

3D movie & actor explorer. Search a film or performer, then click through cast lists and filmographies in an interactive node web — powered by [TMDB](https://www.themoviedb.org/).

## Setup

1. Get a free token at [TMDB Settings → API](https://www.themoviedb.org/settings/api)
   - Use the **API Read Access Token** (Bearer token) — **not** the v3 API Key
   - **Application URL:** `https://github.com/benbenchuachua/cineweb` or `http://localhost:5173`
2. **Never commit your token.** Copy `.env.example` to `.env` locally only:

```bash
cp .env.example .env
# TMDB_READ_ACCESS_TOKEN=eyJ...
```

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deploy (Vercel)

1. Import this repo in [Vercel](https://vercel.com/new)
2. Add environment variable **`TMDB_READ_ACCESS_TOKEN`** in Project → Settings → Environment Variables (Production, Preview, Development). Paste your TMDB **API Read Access Token** (not the v3 API key). `TMDB_API_KEY` is also accepted as a legacy alias.
3. Deploy — then **Redeploy** after saving env vars so they take effect.

4. **Analytics (optional):** In the Vercel project dashboard, enable **Web Analytics** and **Speed Insights**. The app already includes both via `@vercel/analytics/react` and `@vercel/speed-insights/react` in `src/main.tsx`. After deploy, visit the live site — data appears within ~30 seconds (disable ad blockers if nothing shows).

5. **Engagement events (optional):** Run `supabase/cineweb_events.sql` in your Supabase project, then set **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** in Vercel (and local `.env`). Tracks search, node clicks, shares, and anonymous retention via `localStorage` — no login required. Share links include `?ref=share`; tag your own distribution links with `?ref=internetisbeautiful`, etc.

The API key lives only on the server (`/api/*` proxy). It is never sent to the browser or stored in git.

API routes are rate-limited per IP (15 searches/min, 40 graph loads/min) to protect your TMDB quota.

## TMDB attribution

The TMDB API is free for non-commercial use when you credit TMDB as the source of data and/or images. CineWeb displays this attribution in the app footer. For commercial licensing, contact [sales@themoviedb.org](mailto:sales@themoviedb.org).

## Features

- Search movies or actors to start
- 3D radial graph with poster/headshot nodes
- Click any node to fly the camera and bloom new connections
- Breadcrumb trail tracks your path
- Share button copies a link with the path encoded (`?path=m550,p287,...`)
- In-memory server cache to reduce TMDB calls

## Tech

- Vite + React + Three.js
- TMDB API via Vercel serverless proxy (local dev uses Vite middleware)
- Top 10 connections per node, sorted by billing order (cast) or popularity (filmography)
