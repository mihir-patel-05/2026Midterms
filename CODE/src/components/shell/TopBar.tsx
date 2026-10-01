import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Info, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { mockResultsProviderEnabled } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";
import { isNavLinkActive, shellNavLinks } from "./navLinks";

export function TopBar({ search }: { search?: ReactNode }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background/90 backdrop-blur-xl">
      <div className="flex min-h-[68px] items-center gap-4 px-4 py-2.5 lg:px-5">
        <BrandMark />

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {shellNavLinks.map((link) => {
            const active = isNavLinkActive(pathname, link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  active ? "bg-signal-teal/10 text-signal-teal" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden min-w-0 flex-1 justify-center md:flex">{search}</div>

        <div className="ml-auto flex items-center gap-2.5 md:ml-0">
          <span className="hidden min-h-[38px] items-center gap-2 rounded-[9px] border border-line bg-surface-2 px-3 text-[0.72rem] font-bold uppercase tracking-[0.04em] text-muted-foreground sm:inline-flex">
            <i className={cn("h-2 w-2 rounded-full", mockResultsProviderEnabled ? "bg-signal-amber" : "bg-signal-teal")} aria-hidden="true" />
            {mockResultsProviderEnabled ? "Mock results" : "FEC data"}
          </span>
          <Link
            to="/about"
            aria-label="About VoteInformed data"
            className="hidden h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-line bg-surface-2 text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <Info className="h-[17px] w-[17px]" aria-hidden="true" />
          </Link>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-line bg-surface-2 text-foreground lg:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-line bg-surface">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              {search && <div className="mt-4 md:hidden">{search}</div>}
              <nav aria-label="Primary" className="mt-4 grid gap-1">
                {shellNavLinks.map((link) => {
                  const active = isNavLinkActive(pathname, link.to);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold",
                        active ? "bg-signal-teal/10 text-signal-teal" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <link.icon className="h-4 w-4" aria-hidden="true" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
