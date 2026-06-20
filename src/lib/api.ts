export type { GraphNode, GraphResponse, SearchResult, SearchResponse, NodeType } from "../../server/types";

export interface BreadcrumbItem {
  id: string;
  type: "movie" | "person";
  tmdbId: number;
  title: string;
}

export function imageUrl(path: string | null, size: "w185" | "w342" = "w185"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export async function search(query: string) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchGraph(type: "movie" | "person", id: number) {
  const res = await fetch(`/api/graph/${type}/${id}`);
  if (!res.ok) throw new Error("Failed to load graph");
  return res.json();
}

export function encodePath(crumbs: BreadcrumbItem[]): string {
  return crumbs.map((c) => `${c.type[0]}${c.tmdbId}`).join(",");
}

export function parsePath(raw: string): Array<{ type: "movie" | "person"; tmdbId: number }> {
  if (!raw.trim()) return [];
  return raw.split(",").flatMap((part) => {
    const match = part.match(/^([mp])(\d+)$/);
    if (!match) return [];
    return [{ type: match[1] === "m" ? "movie" : "person", tmdbId: Number(match[2]) }];
  });
}

export function buildShareUrl(crumbs: BreadcrumbItem[]): string {
  const url = new URL(window.location.href);
  url.searchParams.set("path", encodePath(crumbs));
  return url.toString();
}
