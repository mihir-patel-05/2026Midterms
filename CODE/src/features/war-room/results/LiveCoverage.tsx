import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/apiBase";
import { liveStreamsEnabled } from "@/lib/featureFlags";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { embedUrl, type Stream } from "./streams";

/**
 * Election-night network streams (PLAN.md §4.7): the official YouTube player from youtube-nocookie.com, loaded only
 * after a click so no one who doesn't watch gets YouTube cookies or video. Up to four play at once, one with sound.
 * Outlets are alphabetical and the same size; calls and numbers in a broadcast are the network's, never ours.
 */

interface StreamsPayload { shown: boolean; streams: Stream[]; updatedAt: string | null }

const MAX_PLAYERS = 4;

function useLiveStreams() {
  return useQuery({
    queryKey: ["war-room", "live-streams"],
    enabled: liveStreamsEnabled,
    // Admins set streams on the night; pick their changes up within a couple of minutes.
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: 1,
    queryFn: async ({ signal }): Promise<StreamsPayload | null> => {
      const response = await fetch(`${API_BASE_URL}/api/live-streams`, { signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Live streams returned ${response.status}`);
      return response.json() as Promise<StreamsPayload>;
    },
  });
}

/** The IFrame player's postMessage commands; no YouTube script is loaded. */
function command(frame: HTMLIFrameElement | null, func: "mute" | "unMute") {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "https://www.youtube-nocookie.com");
}

function Player({ stream, loud, onSound, onClose }: { stream: Stream & { embed: NonNullable<Stream["embed"]> }; loud: boolean; onSound: () => void; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => command(frame.current, loud ? "unMute" : "mute"), [loud]);
  return (
    <div className="wr-stream-player">
      <iframe ref={frame} src={embedUrl(stream.embed, window.location.origin)} title={`${stream.name} live stream`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => command(frame.current, loud ? "unMute" : "mute")} />
      <div className="wr-stream-actions">
        <button type="button" className="wr-btn" aria-pressed={loud} onClick={onSound}>{loud ? "🔊 Sound on" : "🔇 Sound off"}</button>
        <a className="wr-btn" href={stream.watchUrl} target="_blank" rel="noreferrer">Not playing? Watch on YouTube</a>
        <button type="button" className="wr-btn" onClick={onClose} aria-label={`Close ${stream.name}`}>Close</button>
      </div>
    </div>
  );
}

/** The Live coverage card. Hidden when admins hide it; says so when no stream is set yet. */
export function LiveCoverage() {
  const streams = useLiveStreams();
  const [playing, setPlaying] = useState<string[]>([]);
  const [loud, setLoud] = useState<string | null>(null);
  if (!liveStreamsEnabled || streams.data === null || streams.data?.shown === false) return null;
  const list = streams.data?.streams ?? [];
  const watch = (key: string) => {
    setPlaying((current) => (current.includes(key) ? current : [...current, key].slice(-MAX_PLAYERS)));
    // The first player gets the sound; later ones start muted.
    setLoud((current) => current ?? key);
  };
  const close = (key: string) => {
    setPlaying((current) => current.filter((item) => item !== key));
    setLoud((current) => (current === key ? null : current));
  };
  return (
    <Panel className="wr-coverage" title="Live coverage · network streams" meta={<Badge tone={playing.length ? "live" : undefined}>{playing.length ? `${playing.length} playing` : `Up to ${MAX_PLAYERS} at once`}</Badge>}
      footnote="Third-party broadcasts. Race calls and numbers in the video are the network's, not VoteInformed's. Players load only when you click, from youtube-nocookie.com.">
      {streams.isLoading ? <StatusLine>Loading streams…</StatusLine> : streams.isError ? <StatusLine tone="warn">Live coverage list unavailable</StatusLine> : list.length === 0 ? <StatusLine>No outlets listed</StatusLine> : (
        <ul className="wr-streams">
          {list.map((stream) => {
            const on = playing.includes(stream.key);
            return (
              <li key={stream.key} data-playing={on || undefined}>
                <div className="wr-stream-head"><strong>{stream.name}</strong>{stream.embed ? <span className="wr-dim">YouTube</span> : <span className="wr-dim">Link only</span>}</div>
                {on && stream.embed ? (
                  <Player stream={{ ...stream, embed: stream.embed }} loud={loud === stream.key} onSound={() => setLoud(loud === stream.key ? null : stream.key)} onClose={() => close(stream.key)} />
                ) : stream.embed ? (
                  <button type="button" className="wr-btn wr-stream-watch" onClick={() => watch(stream.key)}>▶ Watch live</button>
                ) : (
                  <p className="wr-stream-off">Not streaming here right now. <a href={stream.watchUrl} target="_blank" rel="noreferrer">Watch on {new URL(stream.watchUrl).hostname.replace(/^www\./, "")}</a></p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
