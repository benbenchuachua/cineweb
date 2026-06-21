import { useCallback, useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SearchBar } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { ShareButton } from "./components/ShareButton";
import { TmdbAttribution } from "./components/TmdbAttribution";
import type { BreadcrumbItem, GraphNode, SearchResult } from "./lib/api";
import { fetchGraph, fetchRandomPerson, parsePath, prefetchConnections, prefetchGraph } from "./lib/api";
import { nodeDescription } from "./lib/layout";
import { loadSettings, saveSettings, type AppSettings } from "./lib/settings";
import { hasSeenTopHint, markTopHintSeen } from "./lib/onboarding";
import { setActiveTheme } from "./lib/theme";
import { GraphScene } from "./scene/GraphScene";

export function CineWeb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GraphScene | null>(null);
  const crumbsRef = useRef<BreadcrumbItem[]>([]);
  const loadGenRef = useRef(0);
  const skipTopHintRef = useRef(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("path")
  );

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [centerLabel, setCenterLabel] = useState<string | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [randomizing, setRandomizing] = useState(false);
  const [topOpen, setTopOpen] = useState(false);
  const [showTopHint, setShowTopHint] = useState(false);
  const topHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: GraphNode;
    x: number;
    y: number;
  } | null>(null);

  crumbsRef.current = crumbs;

  const applySettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    document.documentElement.dataset.theme = next.theme;
    setActiveTheme(next.theme);
    sceneRef.current?.setTheme(next.theme);
    sceneRef.current?.setScrollSpeed(next.scrollSpeed);
    sceneRef.current?.setZoomSpeed(next.zoomSpeed);
    sceneRef.current?.setViewMode(next.viewMode);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    setActiveTheme(settings.theme);
    sceneRef.current?.setTheme(settings.theme);
    sceneRef.current?.setScrollSpeed(settings.scrollSpeed);
    sceneRef.current?.setZoomSpeed(settings.zoomSpeed);
    sceneRef.current?.setViewMode(settings.viewMode);
  }, [settings.theme, settings.scrollSpeed, settings.zoomSpeed, settings.viewMode]);

  const loadNode = useCallback(
    async (type: "movie" | "person", tmdbId: number, title?: string, appendCrumb = true) => {
      const gen = ++loadGenRef.current;
      setLoading(true);
      setError(null);
      try {
        const graph = await fetchGraph(type, tmdbId);
        if (gen !== loadGenRef.current) return;

        await sceneRef.current?.setGraph(graph.center, graph.connections);
        if (gen !== loadGenRef.current) return;

        prefetchConnections(graph.connections);
        setCenterLabel(graph.center.title);
        setConnectionCount(graph.connections.length);
        setStarted(true);
        setTopOpen(false);

        if (!skipTopHintRef.current && !hasSeenTopHint()) {
          setShowTopHint(true);
        }

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
    async (node: GraphNode) => {
      await loadNode(node.type, node.tmdbId, node.title);
    },
    [loadNode]
  );

  const onHover = useCallback((node: GraphNode | null, screen: { x: number; y: number } | null) => {
    if (node && screen) {
      setTooltip({ node, x: screen.x, y: screen.y });
      prefetchGraph(node.type, node.tmdbId);
    } else {
      setTooltip(null);
    }
  }, []);

  const onSearchSelect = useCallback(
    (result: SearchResult) => {
      setCrumbs([]);
      setTopOpen(false);
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

  const onReset = useCallback(() => {
    loadGenRef.current += 1;
    sceneRef.current?.reset();
    setCrumbs([]);
    crumbsRef.current = [];
    setCenterLabel(null);
    setConnectionCount(0);
    setStarted(false);
    setError(null);
    setTooltip(null);
    setLoading(false);
    setRandomizing(false);

    const url = new URL(window.location.href);
    url.searchParams.delete("path");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const onRandom = useCallback(async () => {
    setRandomizing(true);
    setError(null);
    try {
      const result = await fetchRandomPerson();
      setCrumbs([]);
      crumbsRef.current = [];
      setTopOpen(false);
      await loadNode(result.type, result.tmdbId, result.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pick someone random");
    } finally {
      setRandomizing(false);
    }
  }, [loadNode]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const initial = loadSettings();
    const scene = new GraphScene(canvas, onNodeClick, onHover, initial.theme, initial.viewMode);
    scene.setScrollSpeed(initial.scrollSpeed);
    scene.setZoomSpeed(initial.zoomSpeed);
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
  }, [loadNode, onNodeClick, onHover]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const dismissTopHint = useCallback(() => {
    setShowTopHint(false);
    markTopHintSeen();
    if (topHintTimerRef.current) clearTimeout(topHintTimerRef.current);
  }, []);

  const showTop = useCallback(() => {
    if (topHideRef.current) clearTimeout(topHideRef.current);
    setTopOpen(true);
    dismissTopHint();
  }, [dismissTopHint]);

  const scheduleHideTop = useCallback(() => {
    if (topHideRef.current) clearTimeout(topHideRef.current);
    topHideRef.current = setTimeout(() => setTopOpen(false), 450);
  }, []);

  useEffect(() => {
    return () => {
      if (topHideRef.current) clearTimeout(topHideRef.current);
      if (topHintTimerRef.current) clearTimeout(topHintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showTopHint) return;
    topHintTimerRef.current = setTimeout(() => dismissTopHint(), 12000);
    return () => {
      if (topHintTimerRef.current) clearTimeout(topHintTimerRef.current);
    };
  }, [showTopHint, dismissTopHint]);

  return (
    <div className="app">
      <div
        className={`top-chrome ${topOpen ? "top-chrome-open" : ""} ${showTopHint ? "top-chrome-hint" : ""}`}
        onMouseLeave={scheduleHideTop}
      >
        <div
          className="top-trigger"
          onMouseEnter={showTop}
          onFocus={showTop}
          aria-label="Show menu"
          tabIndex={0}
        />
        <div className="top-drawer" onMouseEnter={showTop}>
          <SearchBar onSelect={onSearchSelect} loading={loading} />
        </div>
      </div>

      {showTopHint && (
        <div className="top-search-hint" role="status">
          <span className="top-search-hint-arrow" aria-hidden="true">
            ↑
          </span>
          <p>Search again anytime — move to the top edge</p>
          <button type="button" className="top-search-hint-dismiss" onClick={dismissTopHint}>
            Got it
          </button>
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={applySettings}
        onClose={() => setSettingsOpen(false)}
      />

      <div className="canvas-wrap">
        <div ref={containerRef} className="canvas-stage">
          <canvas ref={canvasRef} />
        </div>
        {crumbs.length > 0 && (
          <div className="trail-float">
            <Breadcrumbs items={crumbs} onJump={onCrumbJump} />
            <ShareButton crumbs={crumbs} />
          </div>
        )}
        {!started && !loading && (
          <div className="hero-overlay">
            <div className="hero-card">
              <h2>Six degrees, but cinematic</h2>
              <p>Search a movie or actor to map their connections</p>
              <SearchBar
                variant="hero"
                autoFocus
                onSelect={onSearchSelect}
                loading={loading}
                placeholder="Try “Inception” or “Tom Hanks”…"
              />
              <p className="hero-footnote">Or hit Random in the bottom right</p>
            </div>
          </div>
        )}
        {loading && !started && (
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
        {tooltip && (
          <div
            className="node-tooltip"
            style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          >
            <strong>{tooltip.node.title}</strong>
            <span>{nodeDescription(tooltip.node)}</span>
          </div>
        )}
        <button
          type="button"
          className="btn-options"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
        <div className="canvas-actions">
          <button
            type="button"
            className="btn-float"
            onClick={onRandom}
            disabled={loading || randomizing}
            title="Explore a random actor"
            aria-label="Random actor"
          >
            {randomizing ? "…" : "Random"}
          </button>
          {started && (
            <button
              type="button"
              className="btn-float"
              onClick={onReset}
              title="Reset exploration"
              aria-label="Reset"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {centerLabel && started && (
        <footer className="footer footer-minimal">
          <strong>{centerLabel}</strong>
          {!loading && connectionCount > 0 && (
            <span>{connectionCount} connection{connectionCount === 1 ? "" : "s"}</span>
          )}
          {loading && <span>Loading…</span>}
        </footer>
      )}

      <TmdbAttribution />
    </div>
  );
}
