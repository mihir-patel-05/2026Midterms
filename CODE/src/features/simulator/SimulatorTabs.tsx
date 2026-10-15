import { NavLink } from "react-router-dom";
import { MIDTERM_SIMULATOR_PATH, SIMULATOR_PATH } from "@/components/shell/navLinks";

/** Switches between the electoral college and midterm simulators; each keeps its own link. */
export function SimulatorTabs() {
  return (
    <nav className="sim-tabs" aria-label="Simulators">
      <NavLink to={SIMULATOR_PATH} end>Electoral college</NavLink>
      <NavLink to={MIDTERM_SIMULATOR_PATH}>Midterms</NavLink>
    </nav>
  );
}
