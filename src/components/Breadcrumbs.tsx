import type { BreadcrumbItem } from "../lib/api";

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onJump: (index: number) => void;
}

export function Breadcrumbs({ items, onJump }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Exploration path">
      {items.map((item, i) => (
        <span key={`${item.id}-${i}`} className="crumb-wrap">
          {i > 0 && <span className="crumb-sep">→</span>}
          <button
            type="button"
            className={`crumb ${i === items.length - 1 ? "crumb-active" : ""}`}
            onClick={() => onJump(i)}
            disabled={i === items.length - 1}
          >
            {item.title}
          </button>
        </span>
      ))}
    </nav>
  );
}
