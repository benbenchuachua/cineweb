import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { CineWeb } from "./CineWeb";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CineWeb />
    <Analytics />
    <SpeedInsights />
  </StrictMode>
);
