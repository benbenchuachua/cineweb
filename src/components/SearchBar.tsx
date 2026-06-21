import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../lib/api";
import { search } from "../lib/api";

interface SearchBarProps {
  onSelect: (result: SearchResult) => void;
  loading: boolean;
  autoFocus?: boolean;
  variant?: "default" | "hero";
  placeholder?: string;
}

export function SearchBar({
  onSelect,
  loading,
  autoFocus = false,
  variant = "default",
  placeholder = "Search movies or actors…",
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await search(query.trim());
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`search-wrap ${variant === "hero" ? "search-wrap-hero" : ""}`}>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        disabled={loading}
      />
      {(searching || loading) && <span className="search-spinner" />}
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="search-result"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                  setQuery(r.title);
                }}
              >
                <Thumb path={r.imagePath} type={r.type} title={r.title} />
                <span className="search-result-text">
                  <strong>{r.title}</strong>
                  <small>
                    {r.subtitle}
                    {r.year ? ` · ${r.year}` : ""}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({
  path,
  type,
  title,
}: {
  path: string | null;
  type: "movie" | "person";
  title: string;
}) {
  const url = path
    ? `https://image.tmdb.org/t/p/w92${path}`
    : null;
  if (!url) {
    return <span className="search-thumb search-thumb-empty">{type === "movie" ? "🎬" : "👤"}</span>;
  }
  return <img className="search-thumb" src={url} alt={title} loading="lazy" />;
}
