import { getCached, setCache } from "./cache";
import type { GraphNode, GraphResponse, SearchResponse } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_CONNECTIONS = 10;

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");
  return key;
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const cacheKey = path;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const url = `${TMDB_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB ${res.status}: ${text}`);
  }
  const data = (await res.json()) as T;
  setCache(cacheKey, data);
  return data;
}

function nodeId(type: "movie" | "person", id: number) {
  return `${type}-${id}`;
}

function yearFromDate(date?: string | null) {
  if (!date) return undefined;
  return date.slice(0, 4);
}

export async function searchTmdb(query: string): Promise<SearchResponse> {
  const q = encodeURIComponent(query.trim());
  if (!q) return { results: [] };

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = getCached<SearchResponse>(cacheKey);
  if (cached) return cached;

  const [movies, people] = await Promise.all([
    tmdbFetch<{ results: Array<Record<string, unknown>> }>(`/search/movie?query=${q}`),
    tmdbFetch<{ results: Array<Record<string, unknown>> }>(`/search/person?query=${q}`),
  ]);

  const movieResults = movies.results.slice(0, 6).map((m) => ({
    id: nodeId("movie", m.id as number),
    type: "movie" as const,
    tmdbId: m.id as number,
    title: (m.title as string) ?? "Unknown",
    subtitle: "Movie",
    imagePath: (m.poster_path as string | null) ?? null,
    year: yearFromDate(m.release_date as string),
  }));

  const personResults = people.results.slice(0, 6).map((p) => ({
    id: nodeId("person", p.id as number),
    type: "person" as const,
    tmdbId: p.id as number,
    title: (p.name as string) ?? "Unknown",
    subtitle: (p.known_for_department as string) ?? "Actor",
    imagePath: (p.profile_path as string | null) ?? null,
  }));

  const results = [...movieResults, ...personResults].slice(0, 10);
  const response = { results };
  setCache(cacheKey, response, 15 * 60 * 1000);
  return response;
}

export async function getMovieGraph(id: number): Promise<GraphResponse> {
  const cacheKey = `graph:movie:${id}`;
  const cached = getCached<GraphResponse>(cacheKey);
  if (cached) return cached;

  const [movie, credits] = await Promise.all([
    tmdbFetch<{ title: string; release_date?: string; poster_path?: string | null }>(
      `/movie/${id}`
    ),
    tmdbFetch<{
      cast: Array<{
        id: number;
        name: string;
        character?: string;
        profile_path?: string | null;
        order?: number;
      }>;
    }>(`/movie/${id}/credits`),
  ]);

  const center: GraphNode = {
    id: nodeId("movie", id),
    type: "movie",
    tmdbId: id,
    title: movie.title,
    subtitle: "Movie",
    imagePath: movie.poster_path ?? null,
    year: yearFromDate(movie.release_date),
  };

  const connections: GraphNode[] = credits.cast
    .filter((c) => c.profile_path)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .slice(0, MAX_CONNECTIONS)
    .map((c) => ({
      id: nodeId("person", c.id),
      type: "person" as const,
      tmdbId: c.id,
      title: c.name,
      subtitle: c.character,
      imagePath: c.profile_path ?? null,
    }));

  const response = { center, connections };
  setCache(cacheKey, response);
  return response;
}

export async function getPersonGraph(id: number): Promise<GraphResponse> {
  const cacheKey = `graph:person:${id}`;
  const cached = getCached<GraphResponse>(cacheKey);
  if (cached) return cached;

  const [person, credits] = await Promise.all([
    tmdbFetch<{ name: string; profile_path?: string | null }>(`/person/${id}`),
    tmdbFetch<{
      cast: Array<{
        id: number;
        title: string;
        poster_path?: string | null;
        release_date?: string;
        popularity?: number;
        vote_count?: number;
      }>;
    }>(`/person/${id}/movie_credits`),
  ]);

  const center: GraphNode = {
    id: nodeId("person", id),
    type: "person",
    tmdbId: id,
    title: person.name,
    subtitle: "Actor",
    imagePath: person.profile_path ?? null,
  };

  const connections: GraphNode[] = credits.cast
    .filter((m) => m.poster_path)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, MAX_CONNECTIONS)
    .map((m) => ({
      id: nodeId("movie", m.id),
      type: "movie" as const,
      tmdbId: m.id,
      title: m.title,
      subtitle: "Movie",
      imagePath: m.poster_path ?? null,
      year: yearFromDate(m.release_date),
    }));

  const response = { center, connections };
  setCache(cacheKey, response);
  return response;
}

export async function getGraph(type: "movie" | "person", id: number): Promise<GraphResponse> {
  return type === "movie" ? getMovieGraph(id) : getPersonGraph(id);
}
