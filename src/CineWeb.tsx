import { useCallback, useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SearchBar } from "./components/SearchBar";
import { ShareButton } from "./components/ShareButton";
import type { BreadcrumbItem, GraphNode, SearchResult } from "./lib/api";
import { fetchGraph, parsePath } from "./lib/api";
import { GraphScene } from "./scene/GraphScene";

export function CineWeb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GraphScene | null>(null);
  const crumbsRef = useRef<BreadcrumbItem[]>([]);

  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [centerLabel, setCenterLabel] = useState<string | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);
  const [started, setStarted] = useState(false);

  crumbsRef.current = crumbs;

  const loadNode = useCallback(
    async (type: "movie" | "person", tmdbId: number, title?: string, appendCrumb = true) => {
      setLoading(true);
      setError(null);
      try {
        const graph = await fetchGraph(type, tmdbId);
        await sceneRef.current?.setGraph(graph.center, graph.connections);
        setCenterLabel(graph.center.title);
        setConnectionCount(graph.connections.length);
        setStarted(true);

        let updatedCrumbs = crumbsRef.current;
        if (appendCrumb) {
          const next: BreadcrumbItem = {
            id: graph.center.id,
            type: graph.center.type,
            tmdbId: graph.center.tmdbId,
            title: title ?? graph.center.title,
          };
          const existing = updatedCrumbs.findIndex((c) => c.id === next.id);
          updatedCrumbs =
            existing >= 0 ? updatedCrumbs.slice(0, existing + 1) : [...updatedCrumbs, next];
          setCrumbs(updatedCrumbs);
          crumbsRef.current = updatedCrumbs;
        }

        const url = new URL(window.location.href);
        url.searchParams.set(
          "path",
          updatedCrumbs.map((c) => `${c.type[0]}${c.tmdbId}`).join(",")
        );
        window.history.replaceState({}, "", url.toString());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onNodeClick = useCallback(
    (node: GraphNode) => {
      loadNode(node.type, node.tmdbId, node.title);
    },
    [loadNode]
  );

  const onSearchSelect = useCallback(
    (result: SearchResult) => {
      setCrumbs([]);
      loadNode(result.type, result.tmdbId, result.title);
    },
    [loadNode]
  );

  const onCrumbJump = useCallback(
    (index: number) => {
      const next = crumbs.slice(0, index + 1);
      const item = next[index];
      if (!item) return;
      setCrumbs(next);
      crumbsRef.current = next;
      loadNode(item.type, item.tmdbId, item.title, false);
    },
    [crumbs, loadNode]
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new GraphScene(canvas, onNodeClick);
    scene.mount(container);
    sceneRef.current = scene;

    const onResize = () => scene.resize(container.clientWidth, container.clientHeight);
    window.addEventListener("resize", onResize);
    onResize();

    const pathParam = new URLSearchParams(window.location.search).get("path");
    if (pathParam) {
      const segments = parsePath(pathParam);
      if (segments.length > 0) {
        (async () => {
          const built: BreadcrumbItem[] = [];
          for (const seg of segments) {
            const graph = await fetchGraph(seg.type, seg.tmdbId);
            built.push({
              id: graph.center.id,
              type: graph.center.type,
              tmdbId: graph.center.tmdbId,
              title: graph.center.title,
            });
          }
          setCrumbs(built);
          crumbsRef.current = built;
          const last = segments[segments.length - 1];
          await loadNode(last.type, last.tmdbId, built[built.length - 1]?.title, false);
        })().catch(() => setError("Could not restore shared path"));
      }
    }

    return () => {
      window.removeEventListener("resize", onResize);
      scene.unmount(container);
      sceneRef.current = null;
    };
  }, [loadNode, onNodeClick]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <h1>CineWeb</h1>
        </div>
        <SearchBar onSelect={onSearchSelect} loading={loading} />
      </header>

      <div className="trail-row">
        <Breadcrumbs items={crumbs} onJump={onCrumbJump} />
        <ShareButton
          crumbs={crumbs}
          onScreenshot={() => sceneRef.current?.captureScreenshot() ?? ""}
        />
      </div>

      <div ref={containerRef} className="canvas-wrap">
        <canvas ref={canvasRef} />
        {!started && !loading && (
          <div className="hero-overlay">
            <h2>Six degrees, but cinematic</h2>
            <p>
              Search any movie or actor. Click nodes to wander cast lists and filmographies in 3D.
            </p>
          </div>
        )}
        {loading && (
          <div className="loading-overlay">
            <span className="loading-pulse" />
            <p>Loading connections…</p>
          </div>
        )}
        {error && (
          <div className="error-banner">
            {error}
            {error.includes("TMDB_API_KEY") && (
              <small>
                Set TMDB_API_KEY in Vercel project settings (or in local .env for dev). Never commit the key.
              </small>
            )}
          </div>
        )}
      </div>

      {centerLabel && (
        <footer className="footer">
          <strong>{centerLabel}</strong>
          <span>
            {connectionCount === 0
              ? "No connections found — try a bigger movie or actor"
              : `${connectionCount} connection${connectionCount === 1 ? "" : "s"}`}
          </span>
        </footer>
      )}
    </div>
  );
}
