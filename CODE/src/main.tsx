import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { newFrontendEnabled } from "./lib/featureFlags";
import "./index.css";

if (newFrontendEnabled) document.documentElement.dataset.frontend = "v2";

createRoot(document.getElementById("root")!).render(<App />);
