import { FileText, Info, LayoutDashboard, MapPin, Users, type LucideIcon } from "lucide-react";

export interface ShellNavLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const shellNavLinks: ShellNavLink[] = [
  { to: "/election-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/elections", label: "Elections", icon: MapPin },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/voter-resources", label: "Voter Resources", icon: FileText },
  { to: "/about", label: "About", icon: Info },
];

export function isNavLinkActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
