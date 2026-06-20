import { useState } from "react";
import { buildShareUrl } from "../lib/api";
import type { BreadcrumbItem } from "../lib/api";

interface ShareButtonProps {
  crumbs: BreadcrumbItem[];
  onScreenshot: () => string;
}

export function ShareButton({ crumbs, onScreenshot }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  if (crumbs.length === 0) return null;

  const share = async () => {
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

  const downloadShot = () => {
    const dataUrl = onScreenshot();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `cineweb-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="share-group">
      <button type="button" className="btn-secondary" onClick={share}>
        {copied ? "Link copied!" : "Share path"}
      </button>
      <button type="button" className="btn-secondary" onClick={downloadShot}>
        Save screenshot
      </button>
    </div>
  );
}
