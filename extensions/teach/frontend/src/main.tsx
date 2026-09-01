// First, and before anything can pull in the diagram editor: it works out where its
// fonts live the moment its bundle is evaluated.
import "./visuals/excalidraw-asset-path.ts";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import "./styles.css";

const rootElement = document.getElementById("lesson-root");
if (rootElement === null) {
  throw new Error("The lesson page is missing its root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
