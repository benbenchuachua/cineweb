import {
  clampScrollSpeed,
  clampZoomSpeed,
  speedLabel,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
  ZOOM_SPEED_MAX,
  ZOOM_SPEED_MIN,
  type AppSettings,
} from "../lib/settings";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, settings, onChange, onClose }: SettingsPanelProps) {
  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
        aria-modal="true"
      >
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="theme-toggle-row">
            <button
              type="button"
              className={`theme-option ${settings.theme === "dark" ? "theme-option-active" : ""}`}
              onClick={() => onChange({ ...settings, theme: "dark" })}
            >
              <span className="theme-icon">☾</span>
              Dark
            </button>
            <button
              type="button"
              className={`theme-option ${settings.theme === "light" ? "theme-option-active" : ""}`}
              onClick={() => onChange({ ...settings, theme: "light" })}
            >
              <span className="theme-icon">☀</span>
              Light
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Graph view</h3>
          <div className="theme-toggle-row">
            <button
              type="button"
              className={`theme-option ${settings.viewMode === "3d" ? "theme-option-active" : ""}`}
              onClick={() => onChange({ ...settings, viewMode: "3d" })}
            >
              <span className="theme-icon">◈</span>
              3D
            </button>
            <button
              type="button"
              className={`theme-option ${settings.viewMode === "2d" ? "theme-option-active" : ""}`}
              onClick={() => onChange({ ...settings, viewMode: "2d" })}
            >
              <span className="theme-icon">▣</span>
              2D
            </button>
          </div>
          <p className="settings-hint">
            {settings.viewMode === "2d"
              ? "Flat layout · pan and zoom only"
              : "Perspective orbit · depth and parallax"}
          </p>
        </section>

        <section className="settings-section">
          <div className="settings-row">
            <h3>Pan speed</h3>
            <span className="settings-value">
              {speedLabel(settings.scrollSpeed, SCROLL_SPEED_MAX)}
            </span>
          </div>
          <p className="settings-hint">Two-finger scroll and drag-to-pan</p>
          <input
            type="range"
            className="settings-slider"
            min={SCROLL_SPEED_MIN}
            max={SCROLL_SPEED_MAX}
            step={0.1}
            value={settings.scrollSpeed}
            onChange={(e) =>
              onChange({
                ...settings,
                scrollSpeed: clampScrollSpeed(Number(e.target.value)),
              })
            }
          />
          <div className="settings-slider-labels">
            <span>Slow</span>
            <span>Fast</span>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-row">
            <h3>Zoom speed</h3>
            <span className="settings-value">
              {speedLabel(settings.zoomSpeed, ZOOM_SPEED_MAX)}
            </span>
          </div>
          <p className="settings-hint">Mouse wheel and pinch-to-zoom</p>
          <input
            type="range"
            className="settings-slider"
            min={ZOOM_SPEED_MIN}
            max={ZOOM_SPEED_MAX}
            step={0.1}
            value={settings.zoomSpeed}
            onChange={(e) =>
              onChange({
                ...settings,
                zoomSpeed: clampZoomSpeed(Number(e.target.value)),
              })
            }
          />
          <div className="settings-slider-labels">
            <span>Slow</span>
            <span>Fast</span>
          </div>
        </section>
      </div>
    </div>
  );
}
