import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const root = document.querySelector("#root");
if (!root) {
  throw new Error("index.html needs a #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
