import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CineWeb } from "./CineWeb";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CineWeb />
  </StrictMode>
);
