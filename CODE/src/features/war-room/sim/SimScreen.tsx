import { lazy, Suspense } from "react";
import { simulatorEnabled } from "@/lib/featureFlags";
import { NotConnectedPanel } from "../panels/NotConnectedPanel";
import { StatusLine } from "../panels/Panel";
import { SIM_PATHS } from "../screens";
import "@/features/simulator/simulator.css";

const MidtermSimulatorContent = lazy(() => import("@/pages/MidtermSimulator").then((module) => ({ default: module.MidtermSimulatorContent })));
const ElectionSimulatorContent = lazy(() => import("@/pages/ElectionSimulator").then((module) => ({ default: module.ElectionSimulatorContent })));

/** The midterm and electoral college simulators inside the War Room, with their scenarios in the URL as on the site. */
export function SimScreen({ kind }: { kind: "midterms" | "electoral" }) {
  if (!simulatorEnabled) return <NotConnectedPanel title="Simulator" source="past results files" description="The simulator is switched off in this build." />;
  const Content = kind === "midterms" ? MidtermSimulatorContent : ElectionSimulatorContent;
  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // Simulate // {kind === "midterms" ? "Senate and House" : "Electoral college"}</div>
          <h1 className="wr-page-title">Scenario simulator</h1>
        </div>
      </div>
      <div className="wr-sim">
        <Suspense fallback={<StatusLine>Loading simulator…</StatusLine>}>
          <Content paths={SIM_PATHS} />
        </Suspense>
      </div>
    </>
  );
}
