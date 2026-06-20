import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dodge3D } from "./Dodge3D";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dodge3D />
  </StrictMode>
);
