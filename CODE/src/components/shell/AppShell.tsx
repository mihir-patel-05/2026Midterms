import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChatButton } from "@/components/chat/ChatButton";
import { DataBanner } from "./DataBanner";
import { TopBar } from "./TopBar";

/**
 * Site chrome for the new frontend. `variant="app"` is the full-height
 * dashboard layout (no footer, content fills the viewport); `page` is for
 * regular scrolling pages.
 */
export function AppShell({ children, variant = "page" }: { children: ReactNode; variant?: "page" | "app" }) {
  return (
    <div className="flex min-h-screen flex-col bg-transparent text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-surface-2 focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar />
      <DataBanner />
      <main id="main-content" className="flex-1">{children}</main>
      {variant === "page" && <ShellFooter />}
      <ChatButton />
    </div>
  );
}

function ShellFooter() {
  return (
    <footer className="border-t border-line bg-surface/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-quiet sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <p>Non-partisan election data. Candidate and finance records from the Federal Election Commission.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link className="hover:text-foreground" to="/voter-resources">Voter resources</Link>
          <Link className="hover:text-foreground" to="/about">About &amp; methodology</Link>
          <a className="hover:text-foreground" href="https://vote.gov" target="_blank" rel="noreferrer">Vote.gov</a>
        </nav>
      </div>
    </footer>
  );
}
