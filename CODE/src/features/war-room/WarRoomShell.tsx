import { useLayoutEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { economyEnabled, mockResultsProviderEnabled, newFrontendEnabled, pastResultsEnabled, simulatorEnabled } from "@/lib/featureFlags";
import { formatEtTime } from "@/features/election-monitor/constants";
import { useEconIndicators } from "@/features/election-monitor/economy";
import { useStateCounts } from "@/features/election-monitor/realData";
import { useKalshiStatus, type KalshiFeedStatus } from "@/features/election-monitor/useKalshiLive";
import { countdown, etClock, zuluClock } from "./countdown";
import { Icon, Mark, type IconName } from "./icons";
import { targetSearch } from "./links";
import { parseRace } from "./raceCodes";
import { useNow } from "./useNow";
import "./warRoom.css";

/**
 * Sets `data-skin="warroom"` on <html> while the War Room is mounted. It goes on <html> rather than a wrapper so
 * Radix portals (tooltips, dialogs) rendered into <body> get the War Room tokens too, and comes off on the way out
 * so no other page picks them up.
 */
function useWarRoomSkin() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const title = document.title;
    root.dataset.skin = "warroom";
    document.title = "War Room · VoteInformed";
    return () => {
      delete root.dataset.skin;
      document.title = title;
    };
  }, []);
}

interface RailItem {
  label: string;
  icon: IconName;
  pathname: string;
  hash?: string;
  /** Leaves the War Room for another page, with the same query parameters. */
  search?: (current: URLSearchParams) => URLSearchParams;
  current?: (pathname: string, hash: string) => boolean;
}

const RAIL: RailItem[] = [
  { label: "CMD", icon: "command", pathname: "/war-room", current: (path, hash) => path === "/war-room" && hash !== "#theater" },
  { label: "MAP", icon: "map", pathname: "/war-room", hash: "#theater", current: (path, hash) => path === "/war-room" && hash === "#theater" },
  ...(newFrontendEnabled && pastResultsEnabled
    ? [{ label: "PAST", icon: "past" as const, pathname: "/", search: (current: URLSearchParams) => { current.set("mode", "past"); return current; } }]
    : []),
  ...(newFrontendEnabled && simulatorEnabled ? [{ label: "SIM", icon: "sim" as const, pathname: "/simulator/midterms", search: () => new URLSearchParams() }] : []),
];

function Rail() {
  const { pathname, search, hash } = useLocation();
  return (
    <nav className="wr-rail" aria-label="War Room modules">
      {RAIL.map((item) => {
        const query = item.search ? item.search(new URLSearchParams(search)).toString() : search.slice(1);
        const current = item.current?.(pathname.replace(/\/+$/, "") || "/", hash) ?? false;
        return (
          <Link key={item.label} className="wr-nav" to={{ pathname: item.pathname, search: query ? `?${query}` : "", hash: item.hash ?? "" }} aria-current={current ? "page" : undefined}>
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Race search: a race code or state name targets it on the Command map. */
function Search() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRace(text);
    if ("error" in parsed) {
      setMessage(parsed.error);
      return;
    }
    setMessage("");
    setText("");
    navigate({ pathname: "/war-room", search: targetSearch(search, parsed.state, parsed.code), hash: "#theater" });
  };
  return (
    <form className="wr-search" role="search" onSubmit={submit}>
      <label className="wr-search-box">
        <Icon name="search" size={16} strokeWidth={2} />
        <span className="wr-sr-only">Search races</span>
        <input type="search" value={text} onChange={(event) => { setText(event.target.value); setMessage(""); }}
          placeholder="Search race · NC-SEN, PA-07, Ohio" autoComplete="off" spellCheck={false} />
      </label>
      <p className="wr-search-msg" role="status">{message}</p>
    </form>
  );
}

function Clocks() {
  const now = useNow();
  return (
    <>
      <div className="wr-readout" data-tone="accent">
        <span>FIRST POLLS CLOSE · NOV 3 18:00 ET</span>
        <strong>{countdown(now)}</strong>
      </div>
      <div className="wr-readout">
        <span>EASTERN · {zuluClock(now)}</span>
        <strong>{etClock(now)} ET</strong>
      </div>
    </>
  );
}

const KALSHI_CHIP: Record<KalshiFeedStatus, { text: string; tone?: "live" | "accent"; pulse?: boolean }> = {
  live: { text: "Kalshi live", tone: "live", pulse: true },
  connecting: { text: "Kalshi connecting" },
  degraded: { text: "Kalshi delayed", tone: "accent" },
  offline: { text: "Kalshi offline", tone: "accent" },
  disabled: { text: "Kalshi snapshot" },
};

function Chip({ text, tone, pulse, hollow, title }: { text: string; tone?: "live" | "accent"; pulse?: boolean; hollow?: boolean; title: string }) {
  return (
    <li className="wr-chip" data-tone={tone} title={title}>
      <span className={`wr-dot${pulse ? " wr-pulse" : ""}`} data-hollow={hollow || undefined} aria-hidden="true" />
      {text}
      <span className="wr-sr-only">. {title}</span>
    </li>
  );
}

/** One chip per source: its state now, and when it last answered. Never a made-up time. */
function FeedChips() {
  const kalshi = KALSHI_CHIP[useKalshiStatus()];
  const counts = useStateCounts();
  const econ = useEconIndicators(730, null);
  const fredAt = econ.data?.series.reduce<string | null>((latest, series) => (series.fetchedAt && (!latest || series.fetchedAt > latest) ? series.fetchedAt : latest), null);
  return (
    <ul className="wr-chips" aria-label="Data feeds">
      <Chip {...kalshi} title="Kalshi prices, pushed live over server-sent events" />
      {counts.isError
        ? <Chip text="FEC down" tone="accent" title="The elections API did not answer; race counts are hidden" />
        : <Chip text={counts.dataUpdatedAt ? `FEC ${formatEtTime(new Date(counts.dataUpdatedAt).toISOString())}` : "FEC …"} tone={counts.dataUpdatedAt ? "live" : undefined}
          title={counts.dataUpdatedAt ? "FEC races and candidates, loaded at this time ET" : "Loading FEC races"} />}
      {economyEnabled && (econ.isError
        ? <Chip text="FRED not loaded" tone="accent" title="FRED indicators are not available yet" />
        : <Chip text={fredAt ? `FRED ${formatEtTime(fredAt)}` : "FRED …"} tone={fredAt ? "live" : undefined} title={fredAt ? "FRED indicators, last fetched at this time ET" : "Loading FRED indicators"} />)}
      {mockResultsProviderEnabled
        ? <Chip text="Results mock" tone="accent" hollow title="Results come from fictional fixtures labelled MOCK" />
        : <Chip text="No results feed" tone="accent" hollow title="No licensed results provider is connected" />}
    </ul>
  );
}

export function WarRoomShell({ children }: { children: ReactNode }) {
  useWarRoomSkin();
  const { search } = useLocation();
  return (
    <div className="wr-app">
      <a className="wr-skip" href="#wr-main">Skip to content</a>
      <div className="wr-band">
        <span>VoteInformed // Ops</span>
        <span>Public data · FEC · Kalshi · FRED · MIT Election Lab · Census ACS</span>
        <span>Market prices are not forecasts</span>
      </div>
      <header className="wr-top">
        <Link className="wr-brand" to={{ pathname: "/war-room", search }}>
          <Mark />
          <span className="wr-brand-text"><strong>War Room</strong><span>2026 MIDTERMS</span></span>
        </Link>
        <Search />
        <div className="wr-top-right">
          <Clocks />
          <FeedChips />
        </div>
      </header>
      <div className="wr-body">
        <Rail />
        <main id="wr-main" className="wr-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
