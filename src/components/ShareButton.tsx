import { useState } from "react";
import { buildShareUrl } from "../lib/api";
import type { BreadcrumbItem } from "../lib/api";
import { trackShareClick } from "../lib/analytics";

interface ShareButtonProps {
  crumbs: BreadcrumbItem[];
}

export function ShareButton({ crumbs }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  if (crumbs.length === 0) return null;

  const share = async () => {
    trackShareClick(crumbs.length);
    const url = buildShareUrl(crumbs);
    try {
      if (navigator.share) {
        await navigator.share({ title: "CineWeb path", text: crumbs.map((c) => c.title).join(" → "), url });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-group">
      <button type="button" className="btn-secondary" onClick={share}>
        {copied ? "Link copied!" : "Share path"}
      </button>
    </div>
  );
}
