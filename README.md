# CineWeb

3D movie & actor explorer. Search a film or performer, then click through cast lists and filmographies in an interactive node web — powered by [TMDB](https://www.themoviedb.org/).

## Setup

1. Get a free API key at [TMDB Settings → API](https://www.themoviedb.org/settings/api)
   - **Application URL:** use your GitHub repo URL or `http://localhost:5173` — TMDB requires a URL but any valid one works for personal use
2. **Never commit your key.** Copy `.env.example` to `.env` locally only:

```bash
cp .env.example .env
# TMDB_API_KEY=...
```

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deploy (Vercel)

1. Import this repo in [Vercel](https://vercel.com/new)
2. Add environment variable **`TMDB_API_KEY`** in Project → Settings → Environment Variables (Production, Preview, Development)
3. Deploy

The API key lives only on the server (`/api/*` proxy). It is never sent to the browser or stored in git.

## Features

- Search movies or actors to start
- 3D radial graph with poster/headshot nodes
- Click any node to fly the camera and bloom new connections
- Breadcrumb trail tracks your path
- Share button copies a link with the path encoded (`?path=m550,p287,...`)
- Save screenshot of the current view
- In-memory server cache to reduce TMDB calls

## Tech

- Vite + React + Three.js
- TMDB API via Vercel serverless proxy (local dev uses Vite middleware)
- Top 10 connections per node, sorted by billing order (cast) or popularity (filmography)
