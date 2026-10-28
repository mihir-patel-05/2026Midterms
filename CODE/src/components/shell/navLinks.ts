import { Calculator, FileText, Info, LayoutDashboard, MapPin, Newspaper, Users, type LucideIcon } from "lucide-react";
import { newsEnabled, simulatorEnabled } from "@/lib/featureFlags";

export interface ShellNavLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** The election monitor is the home page of the new frontend (see App.tsx). */
export const DASHBOARD_PATH = "/";
export const SIMULATOR_PATH = "/simulator";
export const MIDTERM_SIMULATOR_PATH = "/simulator/midterms";

export const shellNavLinks: ShellNavLink[] = [
  { to: DASHBOARD_PATH, label: "Dashboard", icon: LayoutDashboard },
  ...(newsEnabled ? [{ to: "/news", label: "News", icon: Newspaper }] : []),
  { to: "/elections", label: "Elections", icon: MapPin },
  { to: "/candidates", label: "Candidates", icon: Users },
  ...(simulatorEnabled ? [{ to: SIMULATOR_PATH, label: "Simulator", icon: Calculator }] : []),
  { to: "/voter-resources", label: "Voter Resources", icon: FileText },
  { to: "/about", label: "About", icon: Info },
];

export function isNavLinkActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
