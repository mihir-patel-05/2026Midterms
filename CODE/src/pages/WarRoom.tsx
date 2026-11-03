import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CommandView } from "@/features/war-room/command/CommandView";
import { EarlyVoteScreen } from "@/features/war-room/earlyVote/EarlyVoteScreen";
import { RaceDossier } from "@/features/war-room/dossier/RaceDossier";
import { MapScreen } from "@/features/war-room/map/MapScreen";
import { NewsScreen } from "@/features/war-room/news/NewsScreen";
import { SimScreen } from "@/features/war-room/sim/SimScreen";
import { NightOps } from "@/features/war-room/night/NightOps";
import { SignalsView } from "@/features/war-room/signals/SignalsView";
import { WarRoomShell } from "@/features/war-room/WarRoomShell";
import { WallScreen } from "@/features/war-room/wall/WallScreen";
import { useWarRoomFlag } from "@/features/war-room/flags";
import { shouldOpenNight } from "@/features/war-room/electionNight";

/**
 * In-page links (#theater, #money) scroll to their panel once it has rendered, and once more after the first data
 * has loaded above it and moved it down.
 */
function useHashScroll() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const scroll = () => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
    const ids = [0, 900].map((delay) => window.setTimeout(scroll, delay));
    return () => ids.forEach((id) => window.clearTimeout(id));
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

function sessionStore() {
  try { return window.sessionStorage; } catch { return null; }
}

/**
 * Command, except on election night: a visit that lands straight on /war-room (a bookmark, a shared link, the home
 * page's link) opens the Night screen once per tab. React Router gives the first location of a page load the key
 * "default", so clicking CMD inside the War Room still opens Command.
 */
function IndexScreen() {
  const location = useLocation();
  const [toNight] = useState(() => shouldOpenNight(Date.now(), location.key === "default" && !location.hash, sessionStore()));
  if (toNight) return <Navigate to={{ pathname: "/war-room/night", search: location.search }} replace />;
  return <CommandView />;
}

/** Wall mode, or the Night screen while an admin has the wall_mode switch off. */
function WallRoute() {
  const location = useLocation();
  const on = useWarRoomFlag("wall_mode");
  if (!on) return <Navigate to={{ pathname: "/war-room/night", search: location.search }} replace />;
  return <WallScreen />;
}

/** The War Room, at /war-room/*. Lazy-loaded and only routed when VITE_FEATURE_WAR_ROOM is "true". */
export default function WarRoom() {
  useHashScroll();
  return (
    <WarRoomShell>
      <Routes>
        <Route index element={<IndexScreen />} />
        <Route path="race/:code" element={<RaceDossier />} />
        <Route path="signals" element={<SignalsView />} />
        <Route path="night" element={<NightOps />} />
        <Route path="wall" element={<WallRoute />} />
        <Route path="map" element={<MapScreen />} />
        <Route path="news" element={<NewsScreen />} />
        <Route path="early-vote" element={<EarlyVoteScreen />} />
        <Route path="sim" element={<SimScreen kind="midterms" />} />
        <Route path="sim/ec" element={<SimScreen kind="electoral" />} />
        <Route path="*" element={<UnknownScreen />} />
      </Routes>
    </WarRoomShell>
  );
}
