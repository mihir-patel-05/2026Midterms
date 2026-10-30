import { NavLink } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { DASHBOARD_PATH, MIDTERM_SIMULATOR_PATH, SIMULATOR_PATH } from "@/components/shell/navLinks";

/** Switches between the electoral college and midterm simulators; each keeps its own link. The first link returns to the war room map. */
export function SimulatorTabs() {
  return (
    <nav className="sim-tabs" aria-label="Simulators">
      <NavLink to={DASHBOARD_PATH} end className="sim-tabs-back"><ArrowLeft aria-hidden="true" />War room</NavLink>
      <NavLink to={SIMULATOR_PATH} end>Electoral college</NavLink>
      <NavLink to={MIDTERM_SIMULATOR_PATH}>Midterms</NavLink>
    </nav>
  );
}
