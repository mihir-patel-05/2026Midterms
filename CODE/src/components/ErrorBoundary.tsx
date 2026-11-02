import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a render error anywhere below it and shows a reload screen instead of a blank page. On election night a
 * redeploy replaces the script files an open tab still points at, so a screen that loads lazily (map, simulator) can
 * fail to import; reloading picks up the new build.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#06080b",
          color: "#e6edf3",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>This page needs a reload</h1>
        <p style={{ maxWidth: "32rem", margin: 0, color: "#8593a3" }}>
          Something went wrong while drawing this screen, or the site was updated while it was open. Reloading brings
          back the latest numbers.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ padding: "0.6rem 1.2rem", border: "1px solid #3a4655", borderRadius: 6, background: "#121821", color: "#e6edf3", cursor: "pointer", fontSize: "1rem" }}
        >
          Reload
        </button>
      </main>
    );
  }
}

const RELOAD_KEY = "voteinformed.preloadReloadAt";

/**
 * Reloads once when a lazily loaded script from an older build is gone (Vite's `vite:preloadError`). A second failure
 * within a minute is left to the error boundary, so a real outage never loops the page.
 */
export function reloadOnStaleChunks() {
  window.addEventListener("vite:preloadError", (event) => {
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* storage blocked */ }
    if (Date.now() - last < 60_000) return;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { return; }
    event.preventDefault();
    window.location.reload();
  });
}
