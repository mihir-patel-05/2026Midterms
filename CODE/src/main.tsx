import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { newFrontendEnabled } from "./lib/featureFlags";
import { reloadOnStaleChunks } from "./components/ErrorBoundary";
import "./index.css";

reloadOnStaleChunks();

if (newFrontendEnabled) document.documentElement.dataset.frontend = "v2";

createRoot(document.getElementById("root")!).render(<App />);
