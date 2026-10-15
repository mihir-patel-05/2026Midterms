import { useId, useState, type PointerEvent } from "react";
import type { HistoryPoint } from "./marketHistory";
import "./sparkline.css";

export interface SparkSeries {
  key: string;
  /** Short name for the tooltip and screen readers, e.g. "D" or "Democratic Party". */
  label: string;
  color: string;
  points: HistoryPoint[];
  /** The live price, drawn at the right edge so the line ends at the number shown beside it. */
  now?: number | null;
}

const HOUR_MS = 3_600_000;
/** Consecutive hourly rows further apart than this mean the feed was down: draw a gap. */
const GAP_MS = 1.5 * HOUR_MS;
/** The live price joins the last stored hour if that hour is this recent. */
const LIVE_JOIN_MS = 2.5 * HOUR_MS;
/** Flat lines still get a 10-point tall scale, so a 0.3-point wiggle doesn't look like a swing. */
const MIN_SPAN_PTS = 10;

const tipTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });

/** Splits a series at missing hours. The live point is only joined to a recent stored hour. */
function segments(points: HistoryPoint[], liveAt: number | null): HistoryPoint[][] {
  const out: HistoryPoint[][] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const isLive = liveAt !== null && index === points.length - 1;
    const limit = isLive ? LIVE_JOIN_MS : GAP_MS;
    if (!previous || point[0] - previous[0] > limit) out.push([point]);
    else out[out.length - 1].push(point);
  });
  return out;
}

function nearest(points: HistoryPoint[], t: number, within: number) {
  let best: HistoryPoint | null = null;
  for (const point of points) if (Math.abs(point[0] - t) <= within && (!best || Math.abs(point[0] - t) < Math.abs(best[0] - t))) best = point;
  return best;
}

/**
 * A small hourly price line. Gaps in the stored history stay gaps. Hovering shows the
 * hour and each series' price; screen readers get the range in words instead.
 */
export function Sparkline({ series, domain, title, width = 88, height = 22 }: {
  series: SparkSeries[];
  /** [start, end] in epoch ms, shared by every sparkline in a list so their time axes match. */
  domain: [number, number];
  /** What the line covers, e.g. "Past 14 days". */
  title: string;
  width?: number;
  height?: number;
}) {
  const tipId = useId();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [start, end] = domain;
  const lines = series
    .map((item) => {
      const stored = item.points.filter(([t]) => t >= start && t <= end);
      const live = item.now === null || item.now === undefined ? null : end;
      const points: HistoryPoint[] = live === null ? stored : [...stored, [live, item.now!]];
      return { ...item, points, live };
    })
    .filter((item) => item.points.length >= 2);
  if (lines.length === 0) return null;

  const values = lines.flatMap((item) => item.points.map(([, pct]) => pct));
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < MIN_SPAN_PTS) {
    const mid = (high + low) / 2;
    low = Math.max(0, Math.min(mid - MIN_SPAN_PTS / 2, 100 - MIN_SPAN_PTS));
    high = low + MIN_SPAN_PTS;
  }
  const pad = 2;
  const x = (t: number) => ((t - start) / (end - start || 1)) * width;
  const y = (pct: number) => pad + (1 - (pct - low) / (high - low || 1)) * (height - pad * 2);

  const describe = lines.map((item) => {
    const own = item.points.map(([, pct]) => pct);
    return `${item.label}: low ${Math.min(...own).toFixed(1)}%, high ${Math.max(...own).toFixed(1)}%, now ${own[own.length - 1].toFixed(1)}%`;
  }).join("; ");

  const allTimes = [...new Set(lines.flatMap((item) => item.points.map(([t]) => t)))];
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const t = start + ((event.clientX - box.left) / box.width) * (end - start);
    setHoverT(allTimes.reduce((best, time) => (Math.abs(time - t) < Math.abs(best - t) ? time : best), allTimes[0]));
  };
  const hovered = hoverT === null ? [] : lines.map((item) => ({ item, point: nearest(item.points, hoverT, HOUR_MS / 2) }));

  return (
    <span className="em-spark" onPointerLeave={() => setHoverT(null)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${describe}`}
        aria-describedby={hoverT === null ? undefined : tipId} onPointerMove={onMove}>
        {/* The full time axis, so a line that starts partway in reads as "not stored yet", not a layout gap. */}
        <line className="em-spark-axis" x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} />
        {hoverT !== null && <line className="em-spark-guide" x1={x(hoverT)} x2={x(hoverT)} y1={0} y2={height} />}
        {lines.map((item) => segments(item.points, item.live).map((segment, index) => segment.length === 1
          ? <circle key={`${item.key}-${index}`} cx={x(segment[0][0])} cy={y(segment[0][1])} r={1.25} fill={item.color} />
          : <polyline key={`${item.key}-${index}`} points={segment.map(([t, pct]) => `${x(t).toFixed(1)},${y(pct).toFixed(1)}`).join(" ")}
            fill="none" stroke={item.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />))}
        {lines.map((item) => {
          const [t, pct] = item.points[item.points.length - 1];
          return <circle key={`${item.key}-end`} cx={x(t)} cy={y(pct)} r={2} fill={item.color} />;
        })}
        {hovered.map(({ item, point }) => point && <circle key={`${item.key}-hover`} className="em-spark-dot" cx={x(point[0])} cy={y(point[1])} r={2.5} fill={item.color} />)}
      </svg>
      {hoverT !== null && (
        <span className="em-spark-tip" id={tipId} role="tooltip">
          <time dateTime={new Date(hoverT).toISOString()}>{hoverT === end && lines.some((item) => item.live !== null) ? "Now" : `${tipTime.format(hoverT)} ET`}</time>
          {hovered.map(({ item, point }) => (
            <span key={item.key}><i style={{ background: item.color }} aria-hidden="true" />{item.label} {point ? `${point[1].toFixed(1)}%` : "no price"}</span>
          ))}
        </span>
      )}
    </span>
  );
}
