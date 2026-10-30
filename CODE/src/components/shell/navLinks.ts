import { Calculator, Map, type LucideIcon } from "lucide-react";
import { simulatorEnabled } from "@/lib/featureFlags";

export interface ShellNavLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** The election monitor is the home page of the new frontend (see App.tsx). */
export const DASHBOARD_PATH = "/";
export const SIMULATOR_PATH = "/simulator";
export const MIDTERM_SIMULATOR_PATH = "/simulator/midterms";

/**
 * The war room's own pages only. The legacy pages (/elections, /candidates, /voter-resources,
 * /about) keep their routes for old links but are never linked from the new shell.
 */
export const shellNavLinks: ShellNavLink[] = [
  { to: DASHBOARD_PATH, label: "War room", icon: Map },
  ...(simulatorEnabled ? [{ to: SIMULATOR_PATH, label: "Simulator", icon: Calculator }] : []),
];

export function isNavLinkActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
