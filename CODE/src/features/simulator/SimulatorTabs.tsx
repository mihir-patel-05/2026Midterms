import { NavLink } from "react-router-dom";
import { MIDTERM_SIMULATOR_PATH, SIMULATOR_PATH } from "@/components/shell/navLinks";

/** Where the two simulators live: the site's pages by default, or the War Room's. */
export interface SimulatorPaths {
  electoral: string;
  midterms: string;
}

const SITE_PATHS: SimulatorPaths = { electoral: SIMULATOR_PATH, midterms: MIDTERM_SIMULATOR_PATH };

/** Switches between the electoral college and midterm simulators; each keeps its own link. */
export function SimulatorTabs({ paths = SITE_PATHS }: { paths?: SimulatorPaths }) {
  return (
    <nav className="sim-tabs" aria-label="Simulators">
      <NavLink to={paths.electoral} end>Electoral college</NavLink>
      <NavLink to={paths.midterms} end>Midterms</NavLink>
    </nav>
  );
}
