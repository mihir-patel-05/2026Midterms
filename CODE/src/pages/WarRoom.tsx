import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { ComingSoonPanel } from "@/features/war-room/panels/ComingSoonPanel";
import { WarRoomShell } from "@/features/war-room/WarRoomShell";

/** In-page links (#theater, #money) scroll to their panel once it has rendered. */
function useHashScroll() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" }), 0);
    return () => window.clearTimeout(id);
  }, [hash, pathname]);
}

function UnknownScreen() {
  return (
    <section className="wr-head" aria-labelledby="wr-404">
      <div>
        <div className="wr-eyebrow">OPS // NOT FOUND</div>
        <h1 id="wr-404" className="wr-page-title">No such screen</h1>
        <p><Link to="/war-room">Back to Command</Link></p>
      </div>
    </section>
  );
}

function CommandPlaceholder() {
  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // COMMAND // UNITED STATES</div>
          <h1 className="wr-page-title">National situation</h1>
        </div>
      </div>
      <ComingSoonPanel title="Tipping point · Senate" description="The Senate seats most likely to decide control, from 10,000 simulated elections." />
    </>
  );
}

/** The War Room, at /war-room/*. Lazy-loaded and only routed when VITE_FEATURE_WAR_ROOM is "true". */
export default function WarRoom() {
  useHashScroll();
  return (
    <WarRoomShell>
      <Routes>
        <Route index element={<CommandPlaceholder />} />
        <Route path="*" element={<UnknownScreen />} />
      </Routes>
    </WarRoomShell>
  );
}
